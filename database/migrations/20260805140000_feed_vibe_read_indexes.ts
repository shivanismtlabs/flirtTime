import type { Knex } from 'knex';

/**
 * Read-path indexes for home feed/vibe list optimisations:
 * - type-scoped public explore keyset
 * - viewer flag batch lookups (user_id, post_id)
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS posts_type_explore_public_keyset_idx
      ON posts (type, created_at DESC, id DESC)
      WHERE deleted_at IS NULL
        AND is_draft = false
        AND is_archived = false
        AND privacy = 'public'
  `);

  // Viewer-centric flag loads: WHERE user_id = ? AND post_id IN (...)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS post_likes_user_post_idx
      ON post_likes (user_id, post_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS post_dislikes_user_post_idx
      ON post_dislikes (user_id, post_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS post_saves_user_post_idx
      ON post_saves (user_id, post_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS post_reposts_user_post_idx
      ON post_reposts (user_id, post_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS post_shares_user_post_idx
      ON post_shares (user_id, post_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS post_gifts_user_post_idx
      ON post_gifts (user_id, post_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS post_views_user_post_idx
      ON post_views (user_id, post_id)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS post_reports_reporter_post_idx
      ON post_reports (reporter_id, post_id)
      WHERE deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS post_reports_reporter_post_idx`);
  await knex.raw(`DROP INDEX IF EXISTS post_views_user_post_idx`);
  await knex.raw(`DROP INDEX IF EXISTS post_gifts_user_post_idx`);
  await knex.raw(`DROP INDEX IF EXISTS post_shares_user_post_idx`);
  await knex.raw(`DROP INDEX IF EXISTS post_reposts_user_post_idx`);
  await knex.raw(`DROP INDEX IF EXISTS post_saves_user_post_idx`);
  await knex.raw(`DROP INDEX IF EXISTS post_dislikes_user_post_idx`);
  await knex.raw(`DROP INDEX IF EXISTS post_likes_user_post_idx`);
  await knex.raw(`DROP INDEX IF EXISTS posts_type_explore_public_keyset_idx`);
}
