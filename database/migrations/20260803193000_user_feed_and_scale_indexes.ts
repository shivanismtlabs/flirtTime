import type { Knex } from 'knex';

/**
 * Scale foundation (no Redis): write-time home timeline + feed indexes.
 * - user_feed: fan-out rows for home (post/vibe/reel)
 * - GIN on posts.audience_user_ids for privacy=specific
 * - composite keyset-friendly explore index
 * - post_views retention helper index
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_feed', (table) => {
    table.bigIncrements('id').primary();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table
      .bigInteger('post_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('posts')
      .onDelete('CASCADE');

    table
      .bigInteger('author_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    // post | vibe | reel — home filters by content_type without joining posts when needed
    table.string('content_type', 16).notNullable();
    // own | follow | tag | specific | discover_seed
    table.string('source', 24).notNullable().defaultTo('follow');

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE user_feed
      ADD CONSTRAINT user_feed_content_type_check
      CHECK (content_type IN ('post', 'vibe', 'reel'))
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX user_feed_user_post_uidx
      ON user_feed (user_id, post_id)
  `);
  // Primary home keyset: newest first per user
  await knex.raw(`
    CREATE INDEX user_feed_user_keyset_idx
      ON user_feed (user_id, created_at DESC, post_id DESC)
  `);
  await knex.raw(`
    CREATE INDEX user_feed_user_type_keyset_idx
      ON user_feed (user_id, content_type, created_at DESC, post_id DESC)
  `);
  await knex.raw(`
    CREATE INDEX user_feed_post_id_idx
      ON user_feed (post_id)
  `);
  await knex.raw(`
    CREATE INDEX user_feed_author_user_idx
      ON user_feed (author_id, user_id)
  `);

  await knex.raw(`
    COMMENT ON TABLE user_feed IS
      'Write-time home timeline (fan-out). Read path: keyset on (user_id, created_at DESC, post_id DESC). No cache required.';
  `);

  // specific-audience containment (@>)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS posts_audience_user_ids_gin
      ON posts USING GIN (audience_user_ids)
      WHERE audience_user_ids IS NOT NULL
  `);

  // Discover / explore keyset (created_at, id) — avoids offset and same-second ties
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS posts_explore_public_keyset_idx
      ON posts (created_at DESC, id DESC)
      WHERE deleted_at IS NULL
        AND is_draft = false
        AND is_archived = false
        AND privacy = 'public'
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS posts_user_type_keyset_idx
      ON posts (user_id, type, created_at DESC, id DESC)
      WHERE deleted_at IS NULL
        AND is_draft = false
        AND is_archived = false
  `);

  // Speeds trimming old viewers per post
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS post_views_post_created_id_idx
      ON post_views (post_id, created_at DESC, id DESC)
  `);

  // Seed recent timeline (own + accepted follows). Caps insert work for empty envs.
  await knex.raw(`
    INSERT INTO user_feed (user_id, post_id, author_id, content_type, source, created_at)
    SELECT p.user_id, p.id, p.user_id, p.type, 'own', p.created_at
    FROM posts p
    WHERE p.deleted_at IS NULL
      AND p.is_draft = false
      AND p.is_archived = false
      AND p.type IN ('post', 'vibe', 'reel')
      AND p.created_at > now() - interval '60 days'
      AND (p.parent_id IS NULL OR p.type <> 'vibe')
    ON CONFLICT (user_id, post_id) DO NOTHING
  `);

  await knex.raw(`
    INSERT INTO user_feed (user_id, post_id, author_id, content_type, source, created_at)
    SELECT f.follower_id, p.id, p.user_id, p.type, 'follow', p.created_at
    FROM posts p
    INNER JOIN follows f
      ON f.following_id = p.user_id
      AND f.status = 'follow'
      AND f.deleted_at IS NULL
    WHERE p.deleted_at IS NULL
      AND p.is_draft = false
      AND p.is_archived = false
      AND p.type IN ('post', 'vibe', 'reel')
      AND p.privacy IN ('public', 'followers')
      AND p.created_at > now() - interval '60 days'
      AND (p.parent_id IS NULL OR p.type <> 'vibe')
    ON CONFLICT (user_id, post_id) DO NOTHING
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS post_views_post_created_id_idx`);
  await knex.raw(`DROP INDEX IF EXISTS posts_user_type_keyset_idx`);
  await knex.raw(`DROP INDEX IF EXISTS posts_explore_public_keyset_idx`);
  await knex.raw(`DROP INDEX IF EXISTS posts_audience_user_ids_gin`);
  await knex.schema.dropTableIfExists('user_feed');
}
