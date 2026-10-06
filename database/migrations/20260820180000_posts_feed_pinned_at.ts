import type { Knex } from 'knex';

/**
 * Feed pin order: last-pinned first.
 * is_pinned already exists; pinned_at is independent of post edits (updated_at).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('posts', (table) => {
    table.timestamp('pinned_at', { useTz: true }).nullable();
  });

  await knex.raw(`
    UPDATE posts
       SET pinned_at = updated_at
     WHERE is_pinned = true
       AND pinned_at IS NULL
       AND deleted_at IS NULL
  `);

  await knex.raw(`
    CREATE INDEX posts_user_type_pinned_at_idx
      ON posts (user_id, type, pinned_at DESC)
      WHERE deleted_at IS NULL
        AND is_pinned = true
        AND pinned_at IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS posts_user_type_pinned_at_idx`);
  await knex.schema.alterTable('posts', (table) => {
    table.dropColumn('pinned_at');
  });
}
