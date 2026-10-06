import { getDb } from '../database/index.js';
import { publicUrl } from '../storage/index.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Turn an S3 object key (or absolute URL) into a browser-loadable URL. */
export function mediaKeyToUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  const clean = key.replace(/^\//, '');
  return publicUrl(clean.startsWith('media/') ? clean : `media/${clean}`);
}

/**
 * `user_details.profile_picture` stores a media UUID.
 * Resolve many UUIDs (or raw keys) → public URLs for API responses.
 */
export async function resolveProfilePictureUrls(
  values: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uuids: string[] = [];

  for (const value of values) {
    if (!value) continue;
    if (/^https?:\/\//i.test(value) || value.includes('/')) {
      const url = mediaKeyToUrl(value);
      if (url) map.set(value, url);
      continue;
    }
    if (UUID_RE.test(value)) uuids.push(value);
  }

  const unique = [...new Set(uuids)];
  if (!unique.length) return map;

  const rows = (await getDb()('media')
    .whereIn('uuid', unique)
    .whereNull('deleted_at')
    .select('uuid', 'key')) as Array<{ uuid: string; key: string }>;

  for (const row of rows) {
    map.set(row.uuid, publicUrl(row.key));
  }

  return map;
}

export function pickProfilePictureUrl(
  value: string | null | undefined,
  resolved: Map<string, string>,
): string | null {
  if (!value) return null;
  return resolved.get(value) ?? null;
}

/** Resolve a single profile_picture value (UUID or key) to a URL. */
export async function resolveProfilePictureUrl(
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return null;
  const map = await resolveProfilePictureUrls([value]);
  return pickProfilePictureUrl(value, map);
}
