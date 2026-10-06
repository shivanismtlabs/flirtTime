import * as jose from 'jose';
import { env } from '../config/index.js';
import { UnauthorizedError, ValidationError } from '../errors/index.js';
import type { VerifiedOAuthIdentity } from './types.js';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URI = 'https://appleid.apple.com/auth/keys';

let jwks: ReturnType<typeof jose.createRemoteJWKSet> | null = null;

function getAppleJwks() {
  if (!jwks) {
    jwks = jose.createRemoteJWKSet(new URL(APPLE_JWKS_URI));
  }
  return jwks;
}

function appleAudiences(): string[] {
  return env.APPLE_CLIENT_IDS.split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function isAppleOAuthConfigured(): boolean {
  return appleAudiences().length > 0;
}

/**
 * Verify an Apple identity token (Sign in with Apple) server-side via Apple JWKS.
 */
export async function verifyAppleIdToken(
  idToken: string,
): Promise<VerifiedOAuthIdentity> {
  const audiences = appleAudiences();
  if (audiences.length === 0) {
    throw new ValidationError('Apple Sign-In is not configured');
  }

  let payload: jose.JWTPayload;
  try {
    const result = await jose.jwtVerify(idToken, getAppleJwks(), {
      issuer: APPLE_ISSUER,
      audience: audiences,
    });
    payload = result.payload;
  } catch {
    throw new UnauthorizedError('Invalid Apple identity token');
  }

  const sub = typeof payload.sub === 'string' ? payload.sub : null;
  if (!sub) {
    throw new UnauthorizedError('Invalid Apple identity token payload');
  }

  const email =
    typeof payload.email === 'string'
      ? payload.email.toLowerCase().trim()
      : null;

  // Apple may send email_verified as boolean or string "true"
  const emailVerifiedRaw = payload.email_verified;
  const emailVerified =
    emailVerifiedRaw === true ||
    emailVerifiedRaw === 'true' ||
    (email != null && email.endsWith('@privaterelay.appleid.com'));

  return {
    provider: 'apple',
    providerUserId: sub,
    email,
    emailVerified: Boolean(email && emailVerified),
    displayName: null, // Apple JWT has no name; client may pass fullName once
    avatarUrl: null,
    rawProfile: {
      iss: payload.iss ?? null,
      aud: payload.aud ?? null,
      email,
      email_verified: emailVerifiedRaw ?? null,
      is_private_email: payload.is_private_email ?? null,
      auth_time: payload.auth_time ?? null,
    },
  };
}
