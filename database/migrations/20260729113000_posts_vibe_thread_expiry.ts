import type { Knex } from 'knex';

/** Threads-style vibe columns: parent/main_parent + 24h expiry indexes */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('posts', (table) => {
    table
      .bigInteger('parent_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('posts')
      .onDelete('SET NULL');
    table
      .bigInteger('main_parent_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('posts')
      .onDelete('SET NULL');
    table.timestamp('expired_at', { useTz: true }).nullable();
  });

  await knex.raw(`
    CREATE INDEX posts_vibe_root_feed_idx
      ON posts (type, created_at DESC)
      WHERE type = 'vibe'
        AND deleted_at IS NULL
        AND parent_id IS NULL
  `);
  await knex.raw(`
    CREATE INDEX posts_vibe_expired_at_idx
      ON posts (type, expired_at)
      WHERE type = 'vibe'
  `);
  await knex.raw(`
    CREATE INDEX posts_vibe_main_parent_idx
      ON posts (main_parent_id, created_at)
      WHERE type = 'vibe'
        AND deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX posts_vibe_parent_idx
      ON posts (parent_id, created_at)
      WHERE type = 'vibe'
        AND deleted_at IS NULL
  `);

  await knex.raw(`
    COMMENT ON COLUMN posts.parent_id IS 'Direct parent vibe (reply); null = root'
  `);
  await knex.raw(`
    COMMENT ON COLUMN posts.main_parent_id IS 'Root vibe id for the thread; null = this is root'
  `);
  await knex.raw(`
    COMMENT ON COLUMN posts.expired_at IS 'Vibe TTL; null means no expiry (non-vibe or legacy)'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS posts_vibe_parent_idx`);
  await knex.raw(`DROP INDEX IF EXISTS posts_vibe_main_parent_idx`);
  await knex.raw(`DROP INDEX IF EXISTS posts_vibe_expired_at_idx`);
  await knex.raw(`DROP INDEX IF EXISTS posts_vibe_root_feed_idx`);

  await knex.schema.alterTable('posts', (table) => {
    table.dropColumn('expired_at');
    table.dropColumn('main_parent_id');
    table.dropColumn('parent_id');
  });
}
