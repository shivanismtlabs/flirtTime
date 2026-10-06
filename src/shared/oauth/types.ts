export type OAuthProvider = 'google' | 'apple';

export interface VerifiedOAuthIdentity {
  provider: OAuthProvider;
  /** Provider subject / user id (stable) */
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  /** Subset of claims for audit (no tokens) */
  rawProfile: Record<string, unknown>;
}
