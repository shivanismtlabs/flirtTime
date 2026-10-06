import type { Knex } from 'knex';

/**
 * Clean historical follow junk that can surface as duplicate list entries:
 * - multiple soft-deleted rows for the same pair (keep newest)
 * - any duplicate active edges (partial unique should prevent; keep newest)
 * - self-follows if any slipped past check
 */
export async function up(knex: Knex): Promise<void> {
  // Hard-delete soft-deleted duplicates (keep highest id per pair)
  await knex.raw(`
    DELETE FROM follows f
    USING follows newer
    WHERE f.follower_id = newer.follower_id
      AND f.following_id = newer.following_id
      AND f.deleted_at IS NOT NULL
      AND newer.deleted_at IS NOT NULL
      AND f.id < newer.id
  `);

  // Soft-delete older active duplicates if any exist (keep highest id)
  await knex.raw(`
    UPDATE follows f
    SET deleted_at = NOW(),
        updated_at = NOW()
    FROM follows newer
    WHERE f.follower_id = newer.follower_id
      AND f.following_id = newer.following_id
      AND f.deleted_at IS NULL
      AND newer.deleted_at IS NULL
      AND f.id < newer.id
  `);

  // Remove self-follows (violates product rules)
  await knex.raw(`
    UPDATE follows
    SET deleted_at = NOW(),
        updated_at = NOW()
    WHERE follower_id = following_id
      AND deleted_at IS NULL
  `);

  // Re-assert unique active pair (no-op if already present)
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS follows_pair_active_uidx
      ON follows (follower_id, following_id)
      WHERE deleted_at IS NULL
  `);
}

export async function down(_knex: Knex): Promise<void> {
  // Data cleanup is not reversible
}
