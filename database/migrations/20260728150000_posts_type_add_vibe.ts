import type { Knex } from 'knex';

/** Allow posts.type = 'vibe' (Threads-style) alongside post | reel */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE posts
      DROP CONSTRAINT IF EXISTS posts_type_check
  `);
  await knex.raw(`
    ALTER TABLE posts
      ADD CONSTRAINT posts_type_check
      CHECK (type IN ('post', 'reel', 'vibe'))
  `);
  await knex.raw(`
    COMMENT ON COLUMN posts.type IS 'post | reel | vibe'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    UPDATE posts SET type = 'post' WHERE type = 'vibe'
  `);
  await knex.raw(`
    ALTER TABLE posts
      DROP CONSTRAINT IF EXISTS posts_type_check
  `);
  await knex.raw(`
    ALTER TABLE posts
      ADD CONSTRAINT posts_type_check
      CHECK (type IN ('post', 'reel'))
  `);
  await knex.raw(`
    COMMENT ON COLUMN posts.type IS 'post | reel'
  `);
}
