import { UnauthorizedError, ValidationError } from '../errors/index.js';
import { verifyAppleIdToken, isAppleOAuthConfigured } from './apple.js';
import { verifyGoogleIdToken, isGoogleOAuthConfigured } from './google.js';
import type { OAuthProvider, VerifiedOAuthIdentity } from './types.js';

export type { OAuthProvider, VerifiedOAuthIdentity } from './types.js';
export { verifyGoogleIdToken, isGoogleOAuthConfigured } from './google.js';
export { verifyAppleIdToken, isAppleOAuthConfigured } from './apple.js';

export function isOAuthProviderConfigured(provider: OAuthProvider): boolean {
  return provider === 'google'
    ? isGoogleOAuthConfigured()
    : isAppleOAuthConfigured();
}

/**
 * Verify Google or Apple ID / identity token on the server.
 */
export async function verifyOAuthIdToken(
  provider: OAuthProvider,
  idToken: string,
): Promise<VerifiedOAuthIdentity> {
  const token = idToken.trim();
  if (!token) {
    throw new ValidationError('idToken is required');
  }

  if (!isOAuthProviderConfigured(provider)) {
    throw new ValidationError(
      `${provider === 'google' ? 'Google' : 'Apple'} Sign-In is not configured`,
    );
  }

  if (provider === 'google') {
    return verifyGoogleIdToken(token);
  }
  if (provider === 'apple') {
    return verifyAppleIdToken(token);
  }

  throw new UnauthorizedError('Unsupported OAuth provider');
}
