import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { newPublicId } from '../../shared/ids/index.js';
import { defaultNotificationSettingsRow } from '../notification/notification.settings-map.js';
import type { OAuthProvider } from '../../shared/oauth/index.js';

type UserRow = {
  id: string;
  uuid: string;
  email: string | null;
  country_code: string | null;
  phone_number: string | null;
  password: string | null;
  salt: string | null;
  status: string;
  deleted_at: Date | null;
};

type VerificationRow = {
  id: string;
  uuid: string;
  user_id: string | null;
  channel: string;
  destination: string;
  country_code: string | null;
  purpose: string;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  status: string;
  expires_at: Date;
  verified_at: Date | null;
};

export type OAuthAccountRow = {
  id: string;
  uuid: string;
  user_id: string;
  provider: OAuthProvider;
  provider_user_id: string;
  email: string | null;
  email_verified: boolean;
  display_name: string | null;
  avatar_url: string | null;
  raw_profile: Record<string, unknown> | null;
  deleted_at: Date | null;
  created_at: Date | string;
};

export class AuthRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async findUserByEmail(email: string): Promise<UserRow | undefined> {
    return this.db('users')
      .where({ email: email.toLowerCase() })
      .whereNull('deleted_at')
      .first();
  }

  async findUserByPhone(
    countryCode: string,
    phoneNumber: string,
  ): Promise<UserRow | undefined> {
    return this.db('users')
      .where({
        country_code: countryCode.replace(/^\+/, ''),
        phone_number: phoneNumber,
      })
      .whereNull('deleted_at')
      .first();
  }

  async findUserByUuid(uuid: string): Promise<UserRow | undefined> {
    return this.db('users').where({ uuid }).whereNull('deleted_at').first();
  }

  async findUsername(username: string) {
    return this.db('user_details')
      .whereRaw('lower(username) = ?', [username.toLowerCase()])
      .whereNull('deleted_at')
      .first<{ user_id: string; username: string }>();
  }

  /** Batch lowercase username lookup for suggestion filtering. */
  async findTakenUsernames(usernames: string[]): Promise<Set<string>> {
    const unique = [
      ...new Set(usernames.map((u) => u.trim().toLowerCase()).filter(Boolean)),
    ];
    if (!unique.length) return new Set();

    const placeholders = unique.map(() => '?').join(', ');
    const rows = await this.db('user_details')
      .whereNull('deleted_at')
      .whereRaw(`lower(username) IN (${placeholders})`, unique)
      .select<{ username: string }[]>(
        this.db.raw('lower(username) as username'),
      );

    return new Set(rows.map((r) => String(r.username).toLowerCase()));
  }

  /** Resolve username, email, or phone digits to a user row */
  async findUserByLogin(login: string): Promise<UserRow | undefined> {
    const value = login.trim();
    if (!value) return undefined;

    if (value.includes('@')) {
      return this.findUserByEmail(value);
    }

    const byUsername = await this.findUsername(value);
    if (byUsername) {
      return this.db('users')
        .where({ id: byUsername.user_id })
        .whereNull('deleted_at')
        .first();
    }

    const digits = value.replace(/\D/g, '');
    if (digits.length >= 6 && digits.length <= 20) {
      return this.db('users')
        .where({ phone_number: digits })
        .whereNull('deleted_at')
        .first();
    }

    return undefined;
  }

  async invalidatePendingOtps(params: {
    channel: string;
    destination: string;
    purpose: string;
  }) {
    return this.db('verifications')
      .where({
        channel: params.channel,
        destination: params.destination,
        purpose: params.purpose,
        status: 'pending',
      })
      .whereNull('deleted_at')
      .update({
        status: 'expired',
        updated_at: this.db.fn.now(),
      });
  }

  /** Expire all pending OTPs of a purpose for a specific user (profile change flows). */
  async invalidatePendingOtpsForUser(params: {
    userId: string;
    purpose: string;
  }) {
    return this.db('verifications')
      .where({
        user_id: params.userId,
        purpose: params.purpose,
        status: 'pending',
      })
      .whereNull('deleted_at')
      .update({
        status: 'expired',
        updated_at: this.db.fn.now(),
      });
  }

  async createVerification(data: {
    channel: string;
    destination: string;
    countryCode?: string | null;
    purpose: string;
    codeHash: string;
    expiresAt: Date;
    userId?: string | null;
  }) {
    const [row] = await this.db('verifications')
      .insert({
        uuid: newPublicId(),
        user_id: data.userId ?? null,
        channel: data.channel,
        destination: data.destination,
        country_code: data.countryCode ?? null,
        purpose: data.purpose,
        code_hash: data.codeHash,
        expires_at: data.expiresAt,
        status: 'pending',
      })
      .returning('*');
    return row as VerificationRow;
  }

  async findPendingVerification(params: {
    channel: string;
    destination: string;
    purpose: string;
  }): Promise<VerificationRow | undefined> {
    return this.db('verifications')
      .where({
        channel: params.channel,
        destination: params.destination,
        purpose: params.purpose,
        status: 'pending',
      })
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc')
      .first();
  }

  async bumpVerificationAttempt(id: string) {
    return this.db('verifications').where({ id }).increment({ attempts: 1 });
  }

  async markVerificationBlocked(id: string) {
    return this.db('verifications').where({ id }).update({
      status: 'blocked',
      updated_at: this.db.fn.now(),
    });
  }

  async markVerificationVerified(id: string) {
    const [row] = await this.db('verifications')
      .where({ id })
      .update({
        status: 'verified',
        verified_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      })
      .returning('*');
    return row as VerificationRow;
  }

  async findVerifiedSignup(uuid: string): Promise<VerificationRow | undefined> {
    return this.findVerifiedByPurpose(uuid, 'signup');
  }

  async findVerifiedByPurpose(
    uuid: string,
    purpose: string,
  ): Promise<VerificationRow | undefined> {
    return this.db('verifications')
      .where({
        uuid,
        status: 'verified',
        purpose,
      })
      .whereNull('deleted_at')
      .first();
  }

  async consumeVerification(id: string) {
    return this.db('verifications').where({ id }).update({
      deleted_at: this.db.fn.now(),
      updated_at: this.db.fn.now(),
    });
  }

  async updatePassword(userId: string, passwordHash: string, salt: string) {
    return this.db('users').where({ id: userId }).update({
      password: passwordHash,
      salt,
      updated_at: this.db.fn.now(),
    });
  }

  async revokeAllRefreshTokensForUser(userId: string) {
    return this.db('refresh_tokens')
      .where({ user_id: userId })
      .whereNull('revoked_at')
      .update({
        revoked_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
  }

  /** Active (non-revoked, non-expired) refresh sessions for device-limit enforcement.
   * Oldest first so excess login kicks the earliest sessions.
   */
  async listActiveRefreshTokensForUser(
    userId: string,
  ): Promise<Array<{ id: string; uuid: string }>> {
    const rows = await this.db('refresh_tokens')
      .select('id', 'uuid')
      .where({ user_id: userId })
      .whereNull('revoked_at')
      .where('expires_at', '>', this.db.fn.now())
      .orderBy('created_at', 'asc');

    return (rows as Array<{ id: string | number; uuid: string }>).map((r) => ({
      id: String(r.id),
      uuid: r.uuid,
    }));
  }

  async revokeRefreshTokensByIds(
    userId: string,
    ids: Array<string | number>,
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const updated = await this.db('refresh_tokens')
      .where({ user_id: userId })
      .whereIn('id', ids)
      .whereNull('revoked_at')
      .update({
        revoked_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
    return Number(updated);
  }

  async createAccount(data: {
    email: string | null;
    countryCode: string | null;
    phoneNumber: string | null;
    passwordHash: string | null;
    salt: string | null;
    termsAgreed: boolean;
    username: string;
    fullName: string;
    dob: string | null;
    gender: string | null;
    nationality: string | null;
  }) {
    return this.db.transaction(async (trx) => {
      const [user] = await trx('users')
        .insert({
          uuid: newPublicId(),
          email: data.email ? data.email.toLowerCase() : null,
          country_code: data.countryCode
            ? data.countryCode.replace(/^\+/, '')
            : null,
          phone_number: data.phoneNumber,
          password: data.passwordHash,
          salt: data.salt,
          status: 'active',
          terms_agreed: data.termsAgreed,
        })
        .returning('*');

      await trx('user_details').insert({
        uuid: newPublicId(),
        user_id: user.id,
        username: data.username.toLowerCase(),
        full_name: data.fullName,
        dob: data.dob,
        gender: data.gender,
        nationality: data.nationality,
        is_private: false,
      });

      await trx('user_stats').insert({ user_id: user.id });

      await trx('notification_settings').insert({
        user_id: user.id,
        ...defaultNotificationSettingsRow(),
      });

      return user as UserRow;
    });
  }

  async findOAuthAccount(
    provider: OAuthProvider,
    providerUserId: string,
  ): Promise<OAuthAccountRow | undefined> {
    return this.db('user_oauth_accounts')
      .where({
        provider,
        provider_user_id: providerUserId,
      })
      .whereNull('deleted_at')
      .first();
  }

  async findOAuthAccountsByUserId(userId: string): Promise<OAuthAccountRow[]> {
    return this.db('user_oauth_accounts')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .orderBy('created_at', 'asc');
  }

  async findOAuthAccountByUserAndProvider(
    userId: string,
    provider: OAuthProvider,
  ): Promise<OAuthAccountRow | undefined> {
    return this.db('user_oauth_accounts')
      .where({ user_id: userId, provider })
      .whereNull('deleted_at')
      .first();
  }

  async createOAuthAccount(data: {
    userId: string;
    provider: OAuthProvider;
    providerUserId: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
    avatarUrl: string | null;
    rawProfile: Record<string, unknown> | null;
  }): Promise<OAuthAccountRow> {
    const [row] = await this.db('user_oauth_accounts')
      .insert({
        uuid: newPublicId(),
        user_id: data.userId,
        provider: data.provider,
        provider_user_id: data.providerUserId,
        email: data.email,
        email_verified: data.emailVerified,
        display_name: data.displayName,
        avatar_url: data.avatarUrl,
        raw_profile: data.rawProfile,
      })
      .returning('*');
    return row as OAuthAccountRow;
  }

  async softDeleteOAuthAccount(id: string): Promise<void> {
    await this.db('user_oauth_accounts').where({ id }).update({
      deleted_at: this.db.fn.now(),
      updated_at: this.db.fn.now(),
    });
  }

  async findUserById(id: string): Promise<UserRow | undefined> {
    return this.db('users').where({ id }).whereNull('deleted_at').first();
  }

  async countActiveAuthMethods(userId: string): Promise<{
    hasPassword: boolean;
    oauthCount: number;
  }> {
    const user = await this.findUserById(userId);
    const oauthCount = await this.db('user_oauth_accounts')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .count('* as count')
      .first<{ count: string | number }>();

    return {
      hasPassword: Boolean(user?.password && user?.salt),
      oauthCount: Number(oauthCount?.count ?? 0),
    };
  }

  async updateUserEmailIfEmpty(userId: string, email: string): Promise<void> {
    await this.db('users')
      .where({ id: userId })
      .whereNull('email')
      .whereNull('deleted_at')
      .update({
        email: email.toLowerCase().trim(),
        updated_at: this.db.fn.now(),
      });
  }

  async updateUserEmail(userId: string, email: string): Promise<void> {
    await this.db('users')
      .where({ id: userId })
      .whereNull('deleted_at')
      .update({
        email: email.toLowerCase().trim(),
        updated_at: this.db.fn.now(),
      });
  }

  async updateUserPhone(
    userId: string,
    countryCode: string,
    phoneNumber: string,
  ): Promise<void> {
    await this.db('users')
      .where({ id: userId })
      .whereNull('deleted_at')
      .update({
        country_code: countryCode.replace(/^\+/, ''),
        phone_number: phoneNumber.replace(/\D/g, ''),
        updated_at: this.db.fn.now(),
      });
  }

  async saveRefreshToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string | null;
    ipAddress?: string | null;
  }) {
    const [row] = await this.db('refresh_tokens')
      .insert({
        uuid: newPublicId(),
        user_id: data.userId,
        token_hash: data.tokenHash,
        expires_at: data.expiresAt,
        user_agent: data.userAgent ?? null,
        ip_address: data.ipAddress ?? null,
      })
      .returning('*');
    return row;
  }

  async findActiveRefreshToken(tokenHash: string) {
    return this.db('refresh_tokens')
      .where({ token_hash: tokenHash })
      .whereNull('revoked_at')
      .where('expires_at', '>', this.db.fn.now())
      .first();
  }

  async revokeRefreshToken(tokenHash: string) {
    return this.db('refresh_tokens').where({ token_hash: tokenHash }).update({
      revoked_at: this.db.fn.now(),
      updated_at: this.db.fn.now(),
    });
  }

  /** Revoke only if the token belongs to this user (prevents cross-user revocation). */
  async revokeRefreshTokenForUser(
    userId: string,
    tokenHash: string,
  ): Promise<number> {
    const updated = await this.db('refresh_tokens')
      .where({
        token_hash: tokenHash,
        user_id: userId,
      })
      .whereNull('revoked_at')
      .update({
        revoked_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
    return Number(updated);
  }

  async findUsernameByUserId(userId: string): Promise<string | null> {
    const profile = await this.findProfileByUserId(userId);
    return profile?.username ?? null;
  }

  /**
   * `userId` may be the internal bigint id **or** the public user UUID
   * (callers like deeplink pass `request.user.sub`).
   */
  async findProfileByUserId(userId: string): Promise<{
    username: string;
    full_name: string | null;
    dob: Date | string | null;
    gender: string | null;
    nationality: string | null;
    living: string | null;
    is_verified: boolean | null;
  } | undefined> {
    const id = userId?.trim();
    if (!id) return undefined;

    const looksLikeUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      );

    if (looksLikeUuid) {
      return this.db('user_details as d')
        .join('users as u', 'u.id', 'd.user_id')
        .where('u.uuid', id)
        .whereNull('d.deleted_at')
        .whereNull('u.deleted_at')
        .first(
          'd.username',
          'd.full_name',
          'd.dob',
          'd.gender',
          'd.nationality',
          'd.living',
          'd.is_verified',
        );
    }

    return this.db('user_details')
      .where({ user_id: id })
      .whereNull('deleted_at')
      .first(
        'username',
        'full_name',
        'dob',
        'gender',
        'nationality',
        'living',
        'is_verified',
      );
  }
}
