import { publicUrl } from '../../shared/storage/index.js';

const LEGACY_MEDIA_HOSTS = new Set([
  'app.onevibe.ai',
  'www.app.onevibe.ai',
]);

const GENERIC_GIFT_TYPES = new Set(['coin', 'coins', 'gift', 'gifts']);

/** S3/object key for a stored gift icon (strips legacy host + query). */
export function giftIconStorageKey(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (LEGACY_MEDIA_HOSTS.has(url.hostname.toLowerCase())) {
        return url.pathname.replace(/^\//, '');
      }
      return url.pathname.replace(/^\//, '');
    } catch {
      return trimmed.split('?')[0]!.replace(/^\//, '');
    }
  }
  return trimmed.split('?')[0]!.replace(/^\//, '');
}

/**
 * Gift `icon` is stored as an S3 key (`chat-media/.../file.gif`) or a legacy
 * `https://app.onevibe.ai/chat-media/...` URL. Return a browser-loadable URL.
 */
export function resolveGiftIconUrl(raw: string | null | undefined): string {
  const key = giftIconStorageKey(raw);
  if (!key) return '';
  if (/^https?:\/\//i.test(String(raw).trim())) {
    try {
      const url = new URL(String(raw).trim());
      if (!LEGACY_MEDIA_HOSTS.has(url.hostname.toLowerCase())) {
        return String(raw).trim();
      }
    } catch {
      return String(raw).trim();
    }
  }
  return publicUrl(key);
}

export function isGenericGiftType(value: string | null | undefined): boolean {
  const key = value?.trim().toLowerCase() ?? '';
  return !key || GENERIC_GIFT_TYPES.has(key);
}
