import { getDb } from '../../shared/database/index.js';

/** Usernames: 3–20 chars, letters/digits/`_`/`.` (same as auth username rules). */
const MENTION_RE = /@([a-zA-Z0-9_.]{3,20})/g;

export function extractMentionUsernames(text: string): string[] {
  const seen = new Set<string>();
  if (!text) return [];
  const re = new RegExp(MENTION_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const raw = match[1] ?? '';
    const name = raw.replace(/\.+$/, '').toLowerCase();
    if (name.length >= 3 && name.length <= 20) {
      seen.add(name);
    }
  }
  return [...seen];
}

/**
 * Resolve `@username` mentions in comment text to internal user ids.
 * Unknown names are ignored. `excludeUserIds` skips self / already-notified users.
 */
export async function resolveMentionedUserIds(
  body: string,
  excludeUserIds: Array<string | number | null | undefined> = [],
): Promise<string[]> {
  const names = extractMentionUsernames(body);
  if (!names.length) return [];

  const db = getDb();
  const placeholders = names.map(() => '?').join(', ');
  const rows = (await db('user_details')
    .join('users', 'users.id', 'user_details.user_id')
    .whereNull('user_details.deleted_at')
    .whereNull('users.deleted_at')
    .whereRaw(`lower(user_details.username) IN (${placeholders})`, names)
    .select('users.id')) as Array<{ id: string | number }>;

  const exclude = new Set(
    excludeUserIds
      .filter((id): id is string | number => id != null && id !== '')
      .map((id) => String(id)),
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = String(row.id);
    if (exclude.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
