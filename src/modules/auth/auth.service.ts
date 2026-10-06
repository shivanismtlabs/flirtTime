import { randomUUID } from 'node:crypto';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
} from '../../shared/errors/index.js';
import { env } from '../../shared/config/index.js';
import {
  revokeAccessToken,
  revokeAllUserAccessSessions,
} from '../../shared/auth/index.js';
import {
  generateOtpCode,
  hashOtp,
  hashPassword,
  hashToken,
  verifyOtpHash,
  verifyPassword,
} from '../../shared/crypto/index.js';
import {
  isTwilioEnabled,
  toE164,
  twilioCheckVerification,
  twilioSendVerification,
} from '../../shared/sms/index.js';
import { isEmailEnabled, sendOtpEmail } from '../../shared/email/index.js';
import { status } from '../../shared/logger/index.js';
import { verifyOAuthIdToken } from '../../shared/oauth/index.js';
import type { VerifiedOAuthIdentity } from '../../shared/oauth/index.js';
import { redisMarkOffline } from '../../shared/presence/index.js';
import { normalizeNationalPhone } from '../../shared/utils/phone.js';
import { AuthMessages } from './auth.messages.js';
import type {
  AuthTokens,
  AuthUser,
  ForgotPasswordInput,
  LinkedOAuthProvider,
  LoginInput,
  LogoutInput,
  LogoutResult,
  RefreshInput,
  RegisterInput,
  ResetPasswordInput,
  SendOtpInput,
  SocialLinkInput,
  SocialLoginInput,
  SocialLoginResult,
  SocialRegisterInput,
  TokenSigner,
  VerifyOtpInput,
} from './auth.types.js';
import { AuthRepository } from './auth.repository.js';
import { forceDisconnectUserSockets } from './auth.realtime.js';
import {
  buildUsernameCandidates,
  pickAvailableSuggestions,
} from './auth.username-suggestions.js';
import { DevicesRepository } from '../devices/devices.repository.js';
import { NotificationService } from '../notification/notification.service.js';
import { WalletService } from '../wallet/wallet.service.js';


const OTP_TTL_MS = 10 * 60 * 1000;
const VERIFIED_TTL_MS = 30 * 60 * 1000;
const TWILIO_PLACEHOLDER_HASH = 'twilio-verify';
/** After signup, client registers FCM token — retry welcome push once. */
const WELCOME_PUSH_RETRY_MS = 8_000;

function normalizeCountryCode(code: string): string {
  return code.replace(/^\+/, '');
}

function destinationFromInput(input: {
  channel: 'email' | 'phone';
  email?: string;
  countryCode?: string;
  phoneNumber?: string;
}): { destination: string; countryCode: string | null; e164: string | null } {
  if (input.channel === 'email') {
    const email = input.email!.toLowerCase().trim();
    return { destination: email, countryCode: null, e164: null };
  }
  const countryCode = normalizeCountryCode(input.countryCode!);
  const phoneNumber = normalizeNationalPhone(
    input.countryCode!,
    input.phoneNumber!,
  );
  return {
    destination: `${countryCode}:${phoneNumber}`,
    countryCode,
    e164: toE164(countryCode, phoneNumber),
  };
}

function formatDob(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function refreshExpiresAt(): Date {
  const raw = env.JWT_REFRESH_EXPIRES_IN;
  const match = /^(\d+)([smhd])$/.exec(raw);
  const now = Date.now();
  if (!match) {
    return new Date(now + 7 * 24 * 60 * 60 * 1000);
  }
  const n = Number(match[1]);
  const unit = match[2];
  const ms =
    unit === 's'
      ? n * 1000
      : unit === 'm'
        ? n * 60 * 1000
        : unit === 'h'
          ? n * 60 * 60 * 1000
          : n * 24 * 60 * 60 * 1000;
  return new Date(now + ms);
}

export class AuthService {
  constructor(
    private readonly repo = new AuthRepository(),
    private readonly notifications = new NotificationService(),
    private readonly wallets = new WalletService(),
    private readonly devices = new DevicesRepository(),
  ) {}

  async sendOtp(input: SendOtpInput, actorUserUuid?: string | null) {
    return this.dispatchOtp(input, actorUserUuid);
  }

  /** Alias of send — expires previous pending OTP for the same destination/purpose */
  async resendOtp(input: SendOtpInput, actorUserUuid?: string | null) {
    return this.dispatchOtp(input, actorUserUuid);
  }

  async forgotPassword(input: ForgotPasswordInput) {
    const sendInput = await this.resolveForgotPasswordDestination(input);
    return this.dispatchOtp(sendInput);
  }

  /** Linkgram-compatible: isExists=true means username is already taken */
  async checkUsernameAvailable(username: string) {
    const normalized = username.toLowerCase();
    const existing = await this.repo.findUsername(normalized);
    const isExists = Boolean(existing);

    let suggestions: string[] = [];
    if (isExists) {
      const candidates = [
        normalized,
        ...buildUsernameCandidates(normalized),
      ];
      const taken = await this.repo.findTakenUsernames(candidates);
      suggestions = pickAvailableSuggestions(normalized, taken, 3);
    }

    return {
      username: normalized,
      isExists,
      available: !isExists,
      isAvailable: !isExists,
      suggestions,
    };
  }

  async checkEmailAvailable(email: string) {
    const existing = await this.repo.findUserByEmail(email);
    const isExists = Boolean(existing);
    return {
      email: email.toLowerCase().trim(),
      isExists,
      available: !isExists,
      isAvailable: !isExists,
    };
  }

  async checkPhoneAvailable(countryCode: string, phoneNumber: string) {
    const cc = normalizeCountryCode(countryCode);
    const phone = phoneNumber.replace(/\D/g, '');
    const existing = await this.repo.findUserByPhone(cc, phone);
    const isExists = Boolean(existing);
    return {
      countryCode: cc,
      phoneNumber: phone,
      isExists,
      available: !isExists,
      isAvailable: !isExists,
    };
  }

  async resetPassword(input: ResetPasswordInput): Promise<{ reset: true }> {
    const verification = await this.repo.findVerifiedByPurpose(
      input.verificationId,
      'reset_password',
    );
    if (!verification) {
      throw new ValidationError(AuthMessages.resetNotVerified);
    }

    const verifiedAt = verification.verified_at
      ? new Date(verification.verified_at).getTime()
      : 0;
    if (Date.now() - verifiedAt > VERIFIED_TTL_MS) {
      throw new ValidationError(AuthMessages.otpExpired);
    }

    const user = await this.userFromVerificationDestination(
      verification.channel,
      verification.destination,
    );
    if (!user || user.status !== 'active') {
      throw new NotFoundError(AuthMessages.accountNotFound);
    }

    const { hash, salt } = await hashPassword(input.password);
    await this.repo.updatePassword(user.id, hash, salt);
    await this.repo.revokeAllRefreshTokensForUser(user.id);
    await this.repo.consumeVerification(verification.id);

    return { reset: true };
  }

  private async dispatchOtp(
    input: SendOtpInput,
    actorUserUuid?: string | null,
  ) {
    const { destination, countryCode, e164 } = destinationFromInput(input);

    let actorUserId: string | null = null;
    if (
      input.purpose === 'change_email' ||
      input.purpose === 'change_phone'
    ) {
      if (!actorUserUuid) {
        throw new UnauthorizedError(
          'Authentication required to change email or phone',
        );
      }
      const actor = await this.repo.findUserByUuid(actorUserUuid);
      if (!actor || actor.status !== 'active') {
        throw new NotFoundError('User not found');
      }
      actorUserId = String(actor.id);

      if (input.purpose === 'change_email') {
        if (input.channel !== 'email') {
          throw new ValidationError('change_email requires channel email');
        }
        const email = destination.toLowerCase().trim();
        if (actor.email && actor.email.toLowerCase() === email) {
          throw new ValidationError('This is already your email');
        }
        const existing = await this.repo.findUserByEmail(email);
        if (existing && String(existing.id) !== actorUserId) {
          throw new ConflictError(AuthMessages.emailAlreadyRegistered);
        }
      } else {
        if (input.channel !== 'phone') {
          throw new ValidationError('change_phone requires channel phone');
        }
        const phoneDigits = input.phoneNumber!.replace(/\D/g, '');
        const cc = countryCode!;
        if (
          actor.phone_number === phoneDigits &&
          (actor.country_code ?? '').replace(/^\+/, '') === cc
        ) {
          throw new ValidationError('This is already your phone number');
        }
        const existing = await this.repo.findUserByPhone(cc, phoneDigits);
        if (existing && String(existing.id) !== actorUserId) {
          throw new ConflictError(AuthMessages.phoneAlreadyRegistered);
        }
      }

      await this.repo.invalidatePendingOtpsForUser({
        userId: actorUserId,
        purpose: input.purpose,
      });
    }

    if (input.purpose === 'signup') {
      if (input.channel === 'email') {
        const existing = await this.repo.findUserByEmail(destination);
        if (existing) {
          throw new ConflictError(AuthMessages.emailAlreadyRegistered);
        }
      } else {
        const existing = await this.repo.findUserByPhone(
          countryCode!,
          input.phoneNumber!.replace(/\D/g, ''),
        );
        if (existing) {
          throw new ConflictError(AuthMessages.phoneAlreadyRegistered);
        }
      }
    }

    if (input.purpose === 'login' || input.purpose === 'reset_password') {
      const user =
        input.channel === 'email'
          ? await this.repo.findUserByEmail(destination)
          : await this.repo.findUserByPhone(
              countryCode!,
              input.phoneNumber!.replace(/\D/g, ''),
            );
      if (!user) {
        throw new NotFoundError(AuthMessages.accountNotFound);
      }
    }

    await this.repo.invalidatePendingOtps({
      channel: input.channel,
      destination,
      purpose: input.purpose,
    });

    const useTwilio = input.channel === 'phone' && isTwilioEnabled();
    let codeHash = TWILIO_PLACEHOLDER_HASH;
    let debugCode: string | undefined;
    let emailSent = false;

    if (useTwilio) {
      await twilioSendVerification(e164!);
    } else {
      const code = generateOtpCode(6);
      codeHash = hashOtp(code, env.JWT_ACCESS_SECRET);
      debugCode = code;

      if (input.channel === 'email') {
        if (isEmailEnabled()) {
          try {
            await sendOtpEmail(destination, code, input.purpose);
            emailSent = true;
            status.ok('OTP', `email sent to ${destination} (${input.purpose})`);
          } catch (err) {
            if (env.NODE_ENV === 'production') {
              throw err;
            }
            const msg = err instanceof Error ? err.message : String(err);
            status.fail(
              'OTP',
              `email send failed (${msg}) — using debugCode for ${destination}`,
            );
            status.ok('OTP', `email ${destination} code=${code} (fallback)`);
          }
        } else if (env.NODE_ENV === 'production') {
          throw new ServiceUnavailableError(
            'Email delivery is not configured',
            { provider: 'email' },
          );
        } else {
          status.ok('OTP', `email ${destination} code=${code} (email off)`);
        }
      } else if (env.NODE_ENV === 'development') {
        status.ok('OTP', `${input.channel} ${destination} code=${code}`);
      }
    }

    const row = await this.repo.createVerification({
      channel: input.channel,
      destination,
      countryCode,
      purpose: input.purpose,
      codeHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      userId: actorUserId,
    });

    return {
      verificationId: row.uuid,
      channel: input.channel,
      purpose: input.purpose,
      expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
      // Only expose debug OTP when the code was not emailed (local / email-off).
      ...(env.NODE_ENV === 'development' && debugCode && !emailSent
        ? { debugCode }
        : {}),
    };
  }

  private async resolveForgotPasswordDestination(
    input: ForgotPasswordInput,
  ): Promise<SendOtpInput> {
    if (input.login) {
      const user = await this.repo.findUserByLogin(input.login);
      if (!user || user.status !== 'active') {
        throw new NotFoundError(AuthMessages.accountNotFound);
      }
      // Prefer phone reset when available
      if (user.phone_number && user.country_code) {
        return {
          channel: 'phone',
          purpose: 'reset_password',
          countryCode: user.country_code,
          phoneNumber: user.phone_number,
        };
      }
      if (!user.email) {
        throw new ValidationError(
          'No email or phone on this account — cannot reset password via OTP',
        );
      }
      return {
        channel: 'email',
        purpose: 'reset_password',
        email: user.email,
      };
    }

    return {
      channel: input.channel!,
      purpose: 'reset_password',
      email: input.email,
      countryCode: input.countryCode,
      phoneNumber: input.phoneNumber,
    };
  }

  private async userFromVerificationDestination(
    channel: string,
    destination: string,
  ) {
    if (channel === 'email') {
      return this.repo.findUserByEmail(destination);
    }
    const [countryCode, phoneNumber] = destination.split(':');
    if (!countryCode || !phoneNumber) {
      return undefined;
    }
    return this.repo.findUserByPhone(countryCode, phoneNumber);
  }

  async verifyOtp(input: VerifyOtpInput, actorUserUuid?: string | null) {
    const { destination, countryCode, e164 } = destinationFromInput(input);

    let actorUserId: string | null = null;
    if (
      input.purpose === 'change_email' ||
      input.purpose === 'change_phone'
    ) {
      if (!actorUserUuid) {
        throw new UnauthorizedError(
          'Authentication required to verify email or phone change',
        );
      }
      const actor = await this.repo.findUserByUuid(actorUserUuid);
      if (!actor || actor.status !== 'active') {
        throw new NotFoundError('User not found');
      }
      actorUserId = String(actor.id);
    }

    const pending = await this.repo.findPendingVerification({
      channel: input.channel,
      destination,
      purpose: input.purpose,
    });

    if (!pending) {
      throw new NotFoundError(AuthMessages.otpNotFound);
    }

    if (
      actorUserId &&
      pending.user_id != null &&
      String(pending.user_id) !== actorUserId
    ) {
      throw new ForbiddenError(AuthMessages.otpNotBelong);
    }

    if (new Date(pending.expires_at).getTime() < Date.now()) {
      await this.repo.invalidatePendingOtps({
        channel: input.channel,
        destination,
        purpose: input.purpose,
      });
      throw new ValidationError(AuthMessages.otpExpired);
    }

    if (pending.attempts >= pending.max_attempts) {
      await this.repo.markVerificationBlocked(pending.id);
      throw new ValidationError(AuthMessages.otpTooManyAttempts);
    }

    let ok = false;
    if (pending.code_hash === TWILIO_PLACEHOLDER_HASH && isTwilioEnabled() && e164) {
      ok = await twilioCheckVerification(e164, input.code);
    } else {
      ok = verifyOtpHash(input.code, env.JWT_ACCESS_SECRET, pending.code_hash);
    }

    if (!ok) {
      await this.repo.bumpVerificationAttempt(pending.id);
      throw new ValidationError(AuthMessages.otpIncorrect);
    }

    const verified = await this.repo.markVerificationVerified(pending.id);

    return {
      verificationId: verified.uuid,
      verified: true,
      channel: verified.channel,
      purpose: verified.purpose,
      countryCode,
    };
  }

  /**
   * Apply a verified change_email OTP to the authenticated user.
   * Destination was the new email checked free at send time (re-checked here).
   */
  async applyChangeEmail(
    actorUserUuid: string,
    verificationId: string,
  ): Promise<{ email: string }> {
    const actor = await this.repo.findUserByUuid(actorUserUuid);
    if (!actor || actor.status !== 'active') {
      throw new NotFoundError('User not found');
    }
    const verification = await this.repo.findVerifiedByPurpose(
      verificationId,
      'change_email',
    );
    if (!verification) {
      throw new ValidationError(AuthMessages.otpNotVerified);
    }
    if (
      verification.user_id == null ||
      String(verification.user_id) !== String(actor.id)
    ) {
      throw new ForbiddenError(AuthMessages.otpNotBelong);
    }
    if (verification.channel !== 'email') {
      throw new ValidationError('Invalid email verification');
    }
    const verifiedAt = verification.verified_at
      ? new Date(verification.verified_at).getTime()
      : 0;
    if (Date.now() - verifiedAt > VERIFIED_TTL_MS) {
      throw new ValidationError(AuthMessages.otpExpired);
    }

    const email = verification.destination.toLowerCase().trim();
    const taken = await this.repo.findUserByEmail(email);
    if (taken && String(taken.id) !== String(actor.id)) {
      throw new ConflictError(AuthMessages.emailAlreadyRegistered);
    }

    await this.repo.updateUserEmail(String(actor.id), email);
    await this.repo.consumeVerification(verification.id);
    return { email };
  }

  /**
   * Apply a verified change_phone OTP to the authenticated user.
   */
  async applyChangePhone(
    actorUserUuid: string,
    verificationId: string,
  ): Promise<{ countryCode: string; phoneNumber: string }> {
    const actor = await this.repo.findUserByUuid(actorUserUuid);
    if (!actor || actor.status !== 'active') {
      throw new NotFoundError('User not found');
    }
    const verification = await this.repo.findVerifiedByPurpose(
      verificationId,
      'change_phone',
    );
    if (!verification) {
      throw new ValidationError(AuthMessages.otpNotVerified);
    }
    if (
      verification.user_id == null ||
      String(verification.user_id) !== String(actor.id)
    ) {
      throw new ForbiddenError(AuthMessages.otpNotBelong);
    }
    if (verification.channel !== 'phone') {
      throw new ValidationError('Invalid phone verification');
    }
    const verifiedAt = verification.verified_at
      ? new Date(verification.verified_at).getTime()
      : 0;
    if (Date.now() - verifiedAt > VERIFIED_TTL_MS) {
      throw new ValidationError(AuthMessages.otpExpired);
    }

    const [ccRaw, phoneRaw] = verification.destination.split(':');
    if (!ccRaw || !phoneRaw) {
      throw new ValidationError('Invalid phone verification destination');
    }
    const countryCode = ccRaw.replace(/^\+/, '');
    const phoneNumber = phoneRaw.replace(/\D/g, '');
    const taken = await this.repo.findUserByPhone(countryCode, phoneNumber);
    if (taken && String(taken.id) !== String(actor.id)) {
      throw new ConflictError(AuthMessages.phoneAlreadyRegistered);
    }

    await this.repo.updateUserPhone(
      String(actor.id),
      countryCode,
      phoneNumber,
    );
    await this.repo.consumeVerification(verification.id);
    return { countryCode, phoneNumber };
  }

  async register(
    input: RegisterInput,
    signer: TokenSigner,
  ): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const verification = await this.repo.findVerifiedSignup(input.verificationId);
    if (!verification) {
      throw new ValidationError(AuthMessages.otpNotVerified);
    }

    const verifiedAt = verification.verified_at
      ? new Date(verification.verified_at).getTime()
      : 0;
    if (Date.now() - verifiedAt > VERIFIED_TTL_MS) {
      throw new ValidationError(AuthMessages.otpExpired);
    }

    const countryCode = input.countryCode
      ? normalizeCountryCode(input.countryCode)
      : undefined;
    const phoneNumber = input.phoneNumber
      ? input.phoneNumber.replace(/\D/g, '')
      : undefined;

    let phoneVerification:
      | Awaited<ReturnType<AuthRepository['findVerifiedSignup']>>
      | undefined;

    if (verification.channel === 'phone') {
      if (!countryCode || !phoneNumber) {
        throw new ValidationError(AuthMessages.phoneRequiredForPhoneSignup);
      }
      const expected = `${countryCode}:${phoneNumber}`;
      if (verification.destination !== expected) {
        throw new ValidationError(AuthMessages.registerPhoneMismatch);
      }
      if (input.phoneVerificationId) {
        throw new ValidationError(AuthMessages.phoneVerificationIdOnlyAfterEmail);
      }
    } else if (verification.channel === 'email') {
      if (verification.destination !== input.email.toLowerCase()) {
        throw new ValidationError(AuthMessages.registerEmailMismatch);
      }

      // Email-first flow: phone is optional (skip) or must be OTP-verified
      if (input.phoneVerificationId) {
        if (!countryCode || !phoneNumber) {
          throw new ValidationError(AuthMessages.phoneVerificationOptionalHint);
        }
        phoneVerification = await this.repo.findVerifiedSignup(
          input.phoneVerificationId,
        );
        if (!phoneVerification || phoneVerification.channel !== 'phone') {
          throw new ValidationError(AuthMessages.phoneVerificationOptionalHint);
        }
        const phoneVerifiedAt = phoneVerification.verified_at
          ? new Date(phoneVerification.verified_at).getTime()
          : 0;
        if (Date.now() - phoneVerifiedAt > VERIFIED_TTL_MS) {
          throw new ValidationError(AuthMessages.otpExpired);
        }
        const expectedPhone = `${countryCode}:${phoneNumber}`;
        if (phoneVerification.destination !== expectedPhone) {
          throw new ValidationError(AuthMessages.registerPhoneMismatch);
        }
      } else if (countryCode || phoneNumber) {
        throw new ValidationError(AuthMessages.phoneVerificationOptionalHint);
      }
    } else {
      throw new ValidationError(AuthMessages.unsupportedVerificationChannel);
    }

    if (await this.repo.findUserByEmail(input.email)) {
      throw new ConflictError(AuthMessages.emailAlreadyRegistered);
    }
    if (countryCode && phoneNumber) {
      if (await this.repo.findUserByPhone(countryCode, phoneNumber)) {
        throw new ConflictError(AuthMessages.phoneAlreadyRegistered);
      }
    }
    if (await this.repo.findUsername(input.username)) {
      throw new ConflictError(AuthMessages.usernameTaken);
    }

    // Skip phone: store null (columns are nullable)
    const resolvedCountry = countryCode ?? null;
    const resolvedPhone = phoneNumber ?? null;

    const { hash, salt } = await hashPassword(input.password);

    const user = await this.repo.createAccount({
      email: input.email,
      countryCode: resolvedCountry,
      phoneNumber: resolvedPhone,
      passwordHash: hash,
      salt,
      termsAgreed: true,
      username: input.username,
      fullName: input.fullName,
      dob: input.dob,
      gender: input.gender,
      nationality: input.nationality,
    });

    await this.repo.consumeVerification(verification.id);
    if (phoneVerification) {
      await this.repo.consumeVerification(phoneVerification.id);
    }

    this.queueWelcomeNotification(String(user.id), input.username, input.fullName);
    void this.wallets.ensureWalletForUserId(String(user.id)).catch(() => {});

    const tokens = await this.issueTokens(user, input.username.toLowerCase(), signer, {
      kickOtherSessions: true,
    });
    return {
      user: this.toAuthUser(user, {
        username: input.username.toLowerCase(),
        fullName: input.fullName,
        dob: input.dob,
        gender: input.gender,
        nationality: input.nationality,
        living: null,
        isVerified: false,
      }),
      tokens,
    };
  }

  /** In-app + FCM welcome; delayed FCM retry so device token can register first. */
  private queueWelcomeNotification(
    userId: string,
    username: string,
    fullName?: string | null,
  ): void {
    const display = (fullName?.trim() || username).trim() || 'there';
    const title = 'Welcome to OneVibe';
    const body = `Hi ${display}! Your account is ready — start exploring and connect with people.`;

    void this.notifications
      .create({
        userId,
        type: 'system',
        i18nKey: 'WELCOME',
        i18nParams: { user: display },
        entityType: 'welcome',
      })
      .catch(() => {
        // never fail registration
      });

    setTimeout(() => {
      void this.notifications
        .pushOnly(userId, {
          type: 'system',
          title,
          body,
          entityType: 'welcome',
        })
        .catch(() => {});
    }, WELCOME_PUSH_RETRY_MS);
  }

  /**
   * Account status gates for password login.
   * Unknown/non-active statuses map to blocked / disabled / unverified messages.
   */
  private assertLoginAccountAllowed(user: { status: string }): void {
    const s = String(user.status ?? '').toLowerCase();
    if (s === 'active') return;
    if (s === 'blocked' || s === 'suspended' || s === 'banned') {
      throw new ForbiddenError(AuthMessages.accountTemporarilyBlocked);
    }
    if (s === 'pending' || s === 'unverified') {
      throw new ForbiddenError(AuthMessages.emailNotVerified);
    }
    throw new ForbiddenError(AuthMessages.accountDisabled);
  }

  async login(
    input: LoginInput,
    signer: TokenSigner,
  ): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const user = await this.repo.findUserByLogin(input.login);

    if (!user) {
      throw new UnauthorizedError(AuthMessages.invalidEmailOrPassword);
    }
    this.assertLoginAccountAllowed(user);

    if (!user.password || !user.salt) {
      throw new UnauthorizedError(AuthMessages.socialLoginOnly);
    }

    const valid = await verifyPassword(input.password, user.password, user.salt);
    if (!valid) {
      throw new UnauthorizedError(AuthMessages.invalidEmailOrPassword);
    }

    const profile = await this.repo.findProfileByUserId(user.id);
    const username = profile?.username ?? '';
    const tokens = await this.issueTokens(user, username, signer, {
      kickOtherSessions: true,
      keepDeviceId: input.deviceId,
    });
    return {
      user: this.toAuthUser(user, {
        username,
        fullName: profile?.full_name ?? null,
        dob: formatDob(profile?.dob),
        gender: profile?.gender ?? null,
        nationality: profile?.nationality ?? null,
        living: profile?.living ?? null,
        isVerified: Boolean(profile?.is_verified),
      }),
      tokens,
    };
  }

  /**
   * Social login (Google / Apple).
   * - Existing OAuth link → issue tokens
   * - Verified email matches existing user → link + tokens
   * - Otherwise → isNewUser (client must call /auth/social/register)
   */
  async socialLogin(
    input: SocialLoginInput,
    signer: TokenSigner,
  ): Promise<SocialLoginResult> {
    const identity = await verifyOAuthIdToken(input.provider, input.idToken);
    const suggestedFullName =
      input.fullName?.trim() || identity.displayName || null;

    const existingOAuth = await this.repo.findOAuthAccount(
      identity.provider,
      identity.providerUserId,
    );

    if (existingOAuth) {
      const user = await this.repo.findUserById(existingOAuth.user_id);
      if (!user || user.status !== 'active') {
        throw new UnauthorizedError(AuthMessages.invalidEmailOrPassword);
      }
      if (identity.email && !user.email) {
        await this.repo.updateUserEmailIfEmpty(user.id, identity.email);
        user.email = identity.email;
      }
      return this.authSuccess(user, signer, false, input.deviceId);
    }

    if (identity.email && identity.emailVerified) {
      const byEmail = await this.repo.findUserByEmail(identity.email);
      if (byEmail) {
        if (byEmail.status !== 'active') {
          throw new UnauthorizedError(AuthMessages.invalidEmailOrPassword);
        }
        const already = await this.repo.findOAuthAccountByUserAndProvider(
          byEmail.id,
          identity.provider,
        );
        if (already && already.provider_user_id !== identity.providerUserId) {
          throw new ConflictError(
            `Another ${identity.provider} account is already linked`,
          );
        }
        if (!already) {
          await this.repo.createOAuthAccount(
            this.oauthInsert(byEmail.id, identity, suggestedFullName),
          );
        }
        return this.authSuccess(byEmail, signer, false, input.deviceId);
      }
    }

    return {
      isNewUser: true,
      provider: identity.provider,
      email: identity.email,
      suggestedFullName,
    };
  }

  /**
   * Create a new account from a verified Google/Apple identity.
   */
  async socialRegister(
    input: SocialRegisterInput,
    signer: TokenSigner,
  ): Promise<{ user: AuthUser; tokens: AuthTokens; isNewUser: true }> {
    const identity = await verifyOAuthIdToken(input.provider, input.idToken);

    const existingOAuth = await this.repo.findOAuthAccount(
      identity.provider,
      identity.providerUserId,
    );
    if (existingOAuth) {
      throw new ConflictError('Social account already registered — use login');
    }

    if (!identity.email) {
      throw new ValidationError(
        'Email is required from the provider to create an account. ' +
          'For Apple, share email on first Sign in with Apple.',
      );
    }

    if (await this.repo.findUserByEmail(identity.email)) {
      throw new ConflictError(AuthMessages.emailAlreadyRegistered);
    }

    if (await this.repo.findUsername(input.username)) {
      throw new ConflictError(AuthMessages.usernameTaken);
    }

    const user = await this.repo.createAccount({
      email: identity.email,
      countryCode: null,
      phoneNumber: null,
      passwordHash: null,
      salt: null,
      termsAgreed: true,
      username: input.username,
      fullName: input.fullName,
      dob: input.dob,
      gender: input.gender,
      nationality: input.nationality,
    });

    await this.repo.createOAuthAccount(
      this.oauthInsert(user.id, identity, input.fullName),
    );

    this.queueWelcomeNotification(String(user.id), input.username, input.fullName);
    void this.wallets.ensureWalletForUserId(String(user.id)).catch(() => {});

    const tokens = await this.issueTokens(user, input.username.toLowerCase(), signer, {
      kickOtherSessions: true,
      keepDeviceId: input.deviceId,
    });
    return {
      isNewUser: true,
      user: this.toAuthUser(user, {
        username: input.username.toLowerCase(),
        fullName: input.fullName,
        dob: input.dob,
        gender: input.gender,
        nationality: input.nationality,
        living: null,
        isVerified: false,
      }),
      tokens,
    };
  }

  /** Link Google/Apple to the authenticated account. */
  async socialLink(
    userUuid: string,
    input: SocialLinkInput,
  ): Promise<{ linked: true; provider: string }> {
    const user = await this.repo.findUserByUuid(userUuid);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('User not found');
    }

    const identity = await verifyOAuthIdToken(input.provider, input.idToken);

    const existingOAuth = await this.repo.findOAuthAccount(
      identity.provider,
      identity.providerUserId,
    );
    if (existingOAuth) {
      if (String(existingOAuth.user_id) === String(user.id)) {
        return { linked: true, provider: identity.provider };
      }
      throw new ConflictError('This social account is linked to another user');
    }

    const sameProvider = await this.repo.findOAuthAccountByUserAndProvider(
      user.id,
      identity.provider,
    );
    if (sameProvider) {
      throw new ConflictError(
        `${identity.provider} is already linked — unlink it first`,
      );
    }

    if (
      identity.email &&
      identity.emailVerified &&
      user.email &&
      identity.email !== user.email.toLowerCase()
    ) {
      const other = await this.repo.findUserByEmail(identity.email);
      if (other && String(other.id) !== String(user.id)) {
        throw new ConflictError(
          'Provider email belongs to a different OneVibe account',
        );
      }
    }

    await this.repo.createOAuthAccount(
      this.oauthInsert(user.id, identity, identity.displayName),
    );

    if (identity.email && !user.email) {
      await this.repo.updateUserEmailIfEmpty(user.id, identity.email);
    }

    return { linked: true, provider: identity.provider };
  }

  async socialUnlink(
    userUuid: string,
    provider: 'google' | 'apple',
  ): Promise<{ unlinked: true }> {
    const user = await this.repo.findUserByUuid(userUuid);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('User not found');
    }

    const linked = await this.repo.findOAuthAccountByUserAndProvider(
      user.id,
      provider,
    );
    if (!linked) {
      throw new NotFoundError(`${provider} is not linked`);
    }

    const methods = await this.repo.countActiveAuthMethods(user.id);
    const remainingOauth = methods.oauthCount - 1;
    if (!methods.hasPassword && remainingOauth < 1) {
      throw new ValidationError(
        'Cannot unlink the only sign-in method — set a password or link another provider first',
      );
    }

    await this.repo.softDeleteOAuthAccount(linked.id);
    return { unlinked: true };
  }

  async listSocialProviders(userUuid: string): Promise<{
    providers: LinkedOAuthProvider[];
  }> {
    const user = await this.repo.findUserByUuid(userUuid);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('User not found');
    }

    const rows = await this.repo.findOAuthAccountsByUserId(user.id);
    return {
      providers: rows.map((row) => ({
        provider: row.provider,
        email: row.email,
        linkedAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : String(row.created_at ?? ''),
      })),
    };
  }

  private oauthInsert(
    userId: string,
    identity: VerifiedOAuthIdentity,
    displayName: string | null,
  ) {
    return {
      userId,
      provider: identity.provider,
      providerUserId: identity.providerUserId,
      email: identity.email,
      emailVerified: identity.emailVerified,
      displayName: displayName || identity.displayName,
      avatarUrl: identity.avatarUrl,
      rawProfile: identity.rawProfile,
    };
  }

  private async authSuccess(
    user: {
      id: string;
      uuid: string;
      email: string | null;
      country_code: string | null;
      phone_number: string | null;
      status: string;
    },
    signer: TokenSigner,
    isNewUser: boolean,
    keepDeviceId?: string,
  ): Promise<SocialLoginResult> {
    const profile = await this.repo.findProfileByUserId(user.id);
    const username = profile?.username ?? '';
    const tokens = await this.issueTokens(user, username, signer, {
      kickOtherSessions: true,
      keepDeviceId,
    });
    return {
      isNewUser,
      user: this.toAuthUser(user, {
        username,
        fullName: profile?.full_name ?? null,
        dob: formatDob(profile?.dob),
        gender: profile?.gender ?? null,
        nationality: profile?.nationality ?? null,
        living: profile?.living ?? null,
        isVerified: Boolean(profile?.is_verified),
      }),
      tokens,
    };
  }

  async refresh(input: RefreshInput, signer: TokenSigner): Promise<AuthTokens> {
    let payload: ReturnType<TokenSigner['verifyRefreshToken']>;
    try {
      payload = signer.verifyRefreshToken(input.refreshToken);
    } catch {
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (payload.type && payload.type !== 'refresh') {
      throw new UnauthorizedError('Refresh token required');
    }

    const tokenHash = hashToken(input.refreshToken);
    const stored = await this.repo.findActiveRefreshToken(tokenHash);
    if (!stored) {
      throw new UnauthorizedError('Refresh token revoked or expired');
    }

    const user = await this.repo.findUserByUuid(payload.sub);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('User not found');
    }

    await this.repo.revokeRefreshToken(tokenHash);
    const username = (await this.repo.findUsernameByUserId(user.id)) ?? '';
    // Refresh must NOT kick other devices / clear push / disconnect sockets.
    return this.issueTokens(user, username, signer, {
      kickOtherSessions: false,
    });
  }

  /**
   * Logout for the authenticated user:
   * - always denylist current access token (jti)
   * - `allDevices`: revoke every session + deactivate all push + kick all sockets
   * - single device: revoke this refresh (+ optional deviceId push); other phones stay logged in
   */
  async logout(
    actorUuid: string,
    input: LogoutInput,
    access: {
      rawToken: string | null;
      jti?: string;
      exp?: number;
    },
    signer: TokenSigner,
  ): Promise<LogoutResult> {
    const user = await this.repo.findUserByUuid(actorUuid);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('User not found');
    }

    // Always kill only THIS access token.
    await revokeAccessToken(
      { jti: access.jti, exp: access.exp },
      access.rawToken,
    );

    const allDevices = Boolean(input.allDevices);
    let refreshRevoked = false;
    let deviceDeactivated = false;

    if (allDevices) {
      await revokeAllUserAccessSessions(actorUuid);
      const n = await this.repo.revokeAllRefreshTokensForUser(user.id);
      refreshRevoked = Number(n) > 0;
      // Soft-deactivate only — voip_token stays so re-login + register restores CallKit.
      deviceDeactivated =
        (await this.devices.deactivateActiveForUser(user.id)) > 0;

      await forceDisconnectUserSockets({
        userId: actorUuid,
        reason: 'logout_all',
      });
      void redisMarkOffline(actorUuid);
    } else {
      const refresh = input.refreshToken?.trim();
      if (refresh) {
        let ownerOk = false;
        try {
          const payload = signer.verifyRefreshToken(refresh);
          if (payload.type && payload.type !== 'refresh') {
            ownerOk = false;
          } else if (payload.sub === actorUuid) {
            ownerOk = true;
          }
        } catch {
          ownerOk = true;
        }
        if (ownerOk) {
          const n = await this.repo.revokeRefreshTokenForUser(
            user.id,
            hashToken(refresh),
          );
          refreshRevoked = n > 0;
        }
      }

      // Deactivate only this phone's push/CallKit eligibility (voip_token kept).
      const deviceId = input.deviceId?.trim();
      if (deviceId) {
        deviceDeactivated = await this.devices.deactivateByDeviceId(
          user.id,
          deviceId,
        );
      }
      // Do NOT revokeAllUserAccessSessions / forceDisconnect all sockets —
      // other logged-in devices must keep working.
    }

    return {
      loggedOut: true,
      allDevices,
      refreshRevoked,
      deviceDeactivated,
    };
  }

  private toAuthUser(
    user: {
      uuid: string;
      email: string | null;
      country_code: string | null;
      phone_number: string | null;
      status: string;
    },
    profile: {
      username: string;
      fullName?: string | null;
      dob?: string | null;
      gender?: string | null;
      nationality?: string | null;
      living?: string | null;
      isVerified?: boolean;
    },
  ): AuthUser {
    return {
      id: user.uuid,
      email: user.email,
      username: profile.username,
      fullName: profile.fullName ?? null,
      countryCode: user.country_code,
      phoneNumber: user.phone_number,
      dob: profile.dob ?? null,
      gender: profile.gender ?? null,
      nationality: profile.nationality ?? null,
      country: null,
      living: profile.living ?? null,
      status: user.status,
      isVerified: Boolean(profile.isVerified),
    };
  }

  private async issueTokens(
    user: { id: string; uuid: string; email: string | null },
    username: string,
    signer: TokenSigner,
    opts?: { kickOtherSessions?: boolean; keepDeviceId?: string },
  ): Promise<AuthTokens> {
    const normalizedUsername = username.trim().toLowerCase() || undefined;
    const kick = Boolean(opts?.kickOtherSessions);
    const keepDeviceId = opts?.keepDeviceId?.trim() || undefined;

    if (kick) {
      // Single-device login: new phone kicks every other session + socket + push.
      await this.repo.revokeAllRefreshTokensForUser(user.id);
      await revokeAllUserAccessSessions(user.uuid);

      if (keepDeviceId) {
        await this.devices.deactivateActiveForUserExcept(user.id, keepDeviceId);
        await this.devices.keepDeviceActiveForUser(user.id, keepDeviceId);
      } else {
        await this.devices.deactivateActiveForUser(user.id);
      }

      await forceDisconnectUserSockets({
        userId: user.uuid,
        reason: 'device_limit',
      });
    }

    const accessToken = signer.signAccessToken({
      sub: user.uuid,
      email: user.email ?? undefined,
      username: normalizedUsername,
      role: 'user',
      jti: randomUUID(),
    });
    const refreshToken = signer.signRefreshToken({
      sub: user.uuid,
      email: user.email ?? undefined,
      username: normalizedUsername,
      role: 'user',
    });

    await this.repo.saveRefreshToken({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt(),
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    };
  }
}
