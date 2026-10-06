import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/index.js';
import { UnauthorizedError, ValidationError } from '../errors/index.js';
import { getFirebaseAuth } from '../firebase/admin.js';
import { status } from '../logger/index.js';
import type { VerifiedOAuthIdentity } from './types.js';

let client: OAuth2Client | null = null;

function getClient(): OAuth2Client {
  if (!client) {
    client = new OAuth2Client();
  }
  return client;
}

function googleAudiences(): string[] {
  return env.GOOGLE_CLIENT_IDS.split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function isGoogleOAuthConfigured(): boolean {
  // Native Google ID tokens and/or Firebase Auth Google sign-in
  return googleAudiences().length > 0 || Boolean(env.FIREBASE_ENABLED);
}

function mapGooglePayload(payload: {
  sub: string;
  email?: string | null;
  email_verified?: boolean;
  name?: string | null;
  picture?: string | null;
  iss?: string;
  aud?: string | string[];
  given_name?: string | null;
  family_name?: string | null;
  locale?: string | null;
}): VerifiedOAuthIdentity {
  const email = payload.email?.toLowerCase().trim() || null;
  return {
    provider: 'google',
    providerUserId: payload.sub,
    email,
    emailVerified: Boolean(payload.email_verified),
    displayName: payload.name?.trim() || null,
    avatarUrl: payload.picture?.trim() || null,
    rawProfile: {
      iss: payload.iss ?? null,
      aud: payload.aud ?? null,
      email: payload.email ?? null,
      email_verified: payload.email_verified ?? false,
      name: payload.name ?? null,
      given_name: payload.given_name ?? null,
      family_name: payload.family_name ?? null,
      picture: payload.picture ?? null,
      locale: payload.locale ?? null,
    },
  };
}

/**
 * Verify a Firebase ID token from Google Sign-In (web popup / Firebase Auth).
 * Uses Google subject from `firebase.identities['google.com']` when present.
 */
async function verifyGoogleFirebaseIdToken(
  idToken: string,
): Promise<VerifiedOAuthIdentity> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new ValidationError('Firebase Auth is not configured');
  }

  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken, true);
  } catch (err) {
    if (env.NODE_ENV !== 'production') {
      status.fail(
        'Google/Firebase token',
        err instanceof Error ? err.message : 'verifyIdToken failed',
      );
    }
    throw new UnauthorizedError('Invalid Google ID token');
  }

  const signInProvider = decoded.firebase?.sign_in_provider;
  if (signInProvider && signInProvider !== 'google.com') {
    throw new UnauthorizedError(
      `Expected Google sign-in, got ${signInProvider}`,
    );
  }

  const googleIds = decoded.firebase?.identities?.['google.com'];
  const googleSub =
    Array.isArray(googleIds) && typeof googleIds[0] === 'string'
      ? googleIds[0]
      : decoded.uid;

  const email =
    typeof decoded.email === 'string'
      ? decoded.email.toLowerCase().trim()
      : null;

  return {
    provider: 'google',
    providerUserId: googleSub,
    email,
    emailVerified: Boolean(decoded.email_verified),
    displayName: typeof decoded.name === 'string' ? decoded.name.trim() : null,
    avatarUrl:
      typeof decoded.picture === 'string' ? decoded.picture.trim() : null,
    rawProfile: {
      iss: decoded.iss ?? null,
      aud: decoded.aud ?? null,
      email,
      email_verified: decoded.email_verified ?? false,
      name: decoded.name ?? null,
      picture: decoded.picture ?? null,
      firebase_uid: decoded.uid,
      sign_in_provider: signInProvider ?? 'google.com',
      via: 'firebase_id_token',
    },
  };
}

/**
 * Verify Google sign-in token server-side.
 *
 * Accepts:
 * 1. Native Google ID token (iOS/Android/GIS) — audience must be in GOOGLE_CLIENT_IDS
 * 2. Firebase ID token after Google Sign-In (web) — verified with Firebase Admin
 */
export async function verifyGoogleIdToken(
  idToken: string,
): Promise<VerifiedOAuthIdentity> {
  const token = idToken.trim();
  if (!token) {
    throw new ValidationError('idToken is required');
  }

  // Peek at issuer to pick the right verifier first
  let issHint = '';
  try {
    const mid = token.split('.')[1];
    if (mid) {
      const json = Buffer.from(
        mid.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf8');
      issHint = String((JSON.parse(json) as { iss?: string }).iss ?? '');
    }
  } catch {
    // ignore — verify below will fail clearly
  }

  const isFirebaseIss =
    issHint.includes('securetoken.google.com') ||
    issHint.includes('identitytoolkit.googleapis.com');

  if (isFirebaseIss) {
    return verifyGoogleFirebaseIdToken(token);
  }

  const audiences = googleAudiences();
  if (audiences.length > 0) {
    try {
      const ticket = await getClient().verifyIdToken({
        idToken: token,
        audience: audiences,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub) {
        throw new UnauthorizedError('Invalid Google ID token payload');
      }
      return mapGooglePayload(payload);
    } catch (err) {
      if (err instanceof UnauthorizedError || err instanceof ValidationError) {
        throw err;
      }
      // Audience mismatch / malformed Google token — try Firebase as fallback
      if (env.NODE_ENV !== 'production') {
        let aud: unknown;
        try {
          const mid = token.split('.')[1];
          if (mid) {
            const json = Buffer.from(
              mid.replace(/-/g, '+').replace(/_/g, '/'),
              'base64',
            ).toString('utf8');
            aud = (JSON.parse(json) as { aud?: unknown }).aud;
          }
        } catch {
          // ignore
        }
        status.fail(
          'Google ID token',
          `${err instanceof Error ? err.message : 'verify failed'}; token aud=${JSON.stringify(aud)}; expected=${audiences.join(',')}`,
        );
      }
    }
  }

  // Fallback: Firebase ID token (common for web Firebase Auth Google popup)
  try {
    return await verifyGoogleFirebaseIdToken(token);
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof ValidationError) {
      throw err;
    }
    throw new UnauthorizedError('Invalid Google ID token');
  }
}
