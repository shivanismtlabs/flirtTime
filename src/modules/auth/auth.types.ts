export type OtpChannel = 'email' | 'phone';
export type OtpPurpose =
  | 'signup'
  | 'login'
  | 'reset_password'
  /** Authenticated: verify ownership of a new email before applying it */
  | 'change_email'
  /** Authenticated: verify ownership of a new phone before applying it */
  | 'change_phone';

export type SocialProvider = 'google' | 'apple';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface AuthUser {
  id: string;
  email: string | null;
  username: string;
  fullName: string | null;
  countryCode: string | null;
  phoneNumber: string | null;
  dob: string | null;
  gender: string | null;
  nationality: string | null;
  /** Localized country name from nationality (request language). */
  country: string | null;
  living: string | null;
  status: string;
  isVerified: boolean;
}

export interface SendOtpInput {
  channel: OtpChannel;
  purpose: OtpPurpose;
  email?: string;
  countryCode?: string;
  phoneNumber?: string;
}

export interface VerifyOtpInput {
  channel: OtpChannel;
  purpose: OtpPurpose;
  code: string;
  email?: string;
  countryCode?: string;
  phoneNumber?: string;
}

export interface RegisterInput {
  /** Required — signup OTP verify id (email preferred; phone-only signup still allowed) */
  verificationId: string;
  email: string;
  /**
   * Optional — when email was verified first, pass the phone OTP verify id
   * after phone step. Omit entirely to skip phone (null phone stored).
   */
  phoneVerificationId?: string;
  countryCode?: string;
  phoneNumber?: string;
  password: string;
  username: string;
  fullName: string;
  dob: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  nationality: string;
  termsAgreed: true;
}

export interface LoginInput {
  login: string;
  password: string;
  /** Stable client device id — keeps VoIP/CallKit active on this phone after login */
  deviceId?: string;
}

export interface SocialLoginInput {
  provider: SocialProvider;
  /** Google ID token or Apple identity token — verified server-side */
  idToken: string;
  /** Apple often provides the name only on first authorize (not in JWT) */
  fullName?: string;
  deviceId?: string;
}

export interface SocialRegisterInput {
  provider: SocialProvider;
  idToken: string;
  username: string;
  fullName: string;
  dob: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  nationality: string;
  termsAgreed: true;
  deviceId?: string;
}

export interface SocialLinkInput {
  provider: SocialProvider;
  idToken: string;
}

export interface LinkedOAuthProvider {
  provider: SocialProvider;
  email: string | null;
  linkedAt: string;
}

export interface SocialLoginResult {
  isNewUser: boolean;
  /** Present when an existing account was logged in / linked */
  user?: AuthUser;
  tokens?: AuthTokens;
  /** Hints for the client when isNewUser=true */
  email?: string | null;
  suggestedFullName?: string | null;
  provider?: SocialProvider;
}

export interface ForgotPasswordInput {
  login?: string;
  channel?: OtpChannel;
  email?: string;
  countryCode?: string;
  phoneNumber?: string;
}

export interface ResetPasswordInput {
  verificationId: string;
  password: string;
}

export interface RefreshInput {
  refreshToken: string;
}

export interface LogoutInput {
  /** Current session refresh token (revoked when present and valid for this user). */
  refreshToken?: string;
  /** Push device_id to deactivate on this device. */
  deviceId?: string;
  /** Revoke every refresh session (+ all push devices). */
  allDevices?: boolean;
}

export interface LogoutResult {
  loggedOut: true;
  allDevices: boolean;
  refreshRevoked: boolean;
  deviceDeactivated: boolean;
}

export interface TokenSigner {
  signAccessToken(payload: {
    sub: string;
    email?: string;
    username?: string;
    role?: string;
    jti?: string;
  }): string;
  signRefreshToken(payload: {
    sub: string;
    email?: string;
    username?: string;
    role?: string;
  }): string;
  verifyRefreshToken(token: string): {
    sub: string;
    email?: string;
    username?: string;
    role?: string;
    type?: string;
  };
}
