/**
 * Opaque keyset cursor for feeds: createdAt + id (stable, no deep OFFSET).
 * Legacy plain ISO timestamps are still accepted for older clients.
 */

export type KeysetCursor = {
  createdAt: string;
  id: string;
};

const SEP = '|';

export function encodeKeysetCursor(createdAt: Date | string, id: string | number): string {
  const iso =
    createdAt instanceof Date
      ? createdAt.toISOString()
      : new Date(createdAt).toISOString();
  return `${iso}${SEP}${String(id)}`;
}

export function parseKeysetCursor(cursor: string | undefined | null): KeysetCursor | null {
  if (cursor == null) return null;
  const raw = String(cursor).trim();
  if (!raw) return null;

  const sep = raw.lastIndexOf(SEP);
  if (sep > 0) {
    const createdAt = raw.slice(0, sep);
    const id = raw.slice(sep + 1);
    if (createdAt && id && !Number.isNaN(Date.parse(createdAt))) {
      return { createdAt, id };
    }
  }

  // Legacy: ISO date only
  if (!Number.isNaN(Date.parse(raw))) {
    return { createdAt: new Date(raw).toISOString(), id: '0' };
  }

  return null;
}

/** (created_at, id) DESC keyset: rows strictly older than cursor. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyKeysetDesc(
  qb: any,
  createdAtColumn: string,
  idColumn: string,
  cursor: KeysetCursor | null,
): void {
  if (!cursor) return;
  if (cursor.id === '0') {
    qb.where(createdAtColumn, '<', cursor.createdAt);
    return;
  }
  qb.whereRaw(
    `(${createdAtColumn}, ${idColumn}) < (?::timestamptz, ?::bigint)`,
    [cursor.createdAt, cursor.id],
  );
}

/** Cap OFFSET depth so page-only clients cannot scan far into large tables. */
export const MAX_FEED_OFFSET_PAGES = 20;

export function feedOffset(page: number, limit: number): number {
  const safePage = Math.min(Math.max(1, page), MAX_FEED_OFFSET_PAGES);
  return (safePage - 1) * limit;
}
