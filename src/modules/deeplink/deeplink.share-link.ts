import { env } from '../../shared/config/index.js';

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

/**
 * Public origin for share / Universal Links (no `/api/v1` suffix).
 * Canonical profile share: `{origin}/api/v1/share/{username}`
 */
export function sharePublicOrigin(): string {
  return (env.DEEPLINK_PUBLIC_URL || env.API_PUBLIC_URL)
    .replace(/\/+$/, '')
    .replace(/\/api\/v1(?:\/auth)?$/i, '');
}

/**
 * HTTPS share URL (Universal / App Link). Opens landing when the app is not installed.
 * Linkgram parity: `{APP}/api/v1/auth/{type}/{id}/username/{username}`
 */
export function getShareLink(
  type: string,
  id: string | number,
  username?: string,
): string | null {
  if (id == null || id === '') return null;

  const baseUrl = (env.DEEPLINK_PUBLIC_URL || env.API_PUBLIC_URL).replace(
    /\/$/,
    '',
  );
  const cleanType = (type || 'post').toLowerCase();
  const cleanUsername = encodeURIComponent(username || 'user');
  const cleanId = encodeURIComponent(String(id));

  if (baseUrl.includes('/api/v1/auth')) {
    return `${baseUrl}/${cleanType}/${cleanId}/username/${cleanUsername}`;
  }
  if (baseUrl.includes('/api/v1')) {
    return `${baseUrl}/auth/${cleanType}/${cleanId}/username/${cleanUsername}`;
  }
  return `${baseUrl}/api/v1/auth/${cleanType}/${cleanId}/username/${cleanUsername}`;
}

/** Strip `@`, decode, lowercase. Returns null when the handle is not a username. */
export function normalizeShareUsername(raw: string): string | null {
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  const username = value.replace(/^@+/, '').trim().toLowerCase();
  if (!USERNAME_RE.test(username)) return null;
  return username;
}

/** Profile share landing URL — `{origin}/api/v1/share/{username}` */
export function getProfileShareLink(username: string): string {
  const origin = sharePublicOrigin();
  const normalized =
    normalizeShareUsername(username) ??
    username.replace(/^@+/, '').trim().toLowerCase();
  return `${origin}/api/v1/share/${encodeURIComponent(normalized)}`;
}

/** Custom URI scheme the mobile app registers */
export function getAppSchemeLink(
  type: string,
  idOrUsername: string,
): string {
  const scheme = env.DEEPLINK_SCHEME.replace(/:\/\/$/, '');
  return `${scheme}://${type}/${idOrUsername}`;
}
