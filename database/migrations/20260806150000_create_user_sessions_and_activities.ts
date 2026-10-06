import type { Knex } from 'knex';

/**
 * Static (denormalized) user session + activity log.
 *
 * Design:
 * - Rows are self-contained for admin detail UI — no JOINs needed to render.
 * - IDs / UUIDs are stored for deep-links to detail pages (user, post, admin, …).
 * - Display fields are frozen at write-time (username, labels, device, etc.).
 * - `event_type` / `target_type` are dynamic strings (app module owns the vocabulary).
 * - Only `user_id` has an FK (cleanup when user is hard-deleted).
 *
 * Tables:
 * - user_sessions   — login → logout span
 * - user_activities — append-only curated events
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_sessions', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    // Static user snapshot (no join for display)
    table.uuid('user_uuid').notNullable();
    table.string('username', 64).notNullable();
    table.string('full_name', 120).nullable();

    // Plain ids for detail-page links (no FK — survive deletes)
    table.bigInteger('device_info_id').unsigned().nullable();
    table.uuid('device_info_uuid').nullable();
    table.bigInteger('refresh_token_id').unsigned().nullable();

    // Static device / client snapshot
    table.string('platform', 16).nullable();
    table.string('app_version', 32).nullable();
    table.string('os_version', 32).nullable();
    table.string('device_model', 128).nullable();
    table.string('device_name', 128).nullable();
    table.string('ip_address', 64).nullable();
    table.string('user_agent', 512).nullable();

    table.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('ended_at', { useTz: true }).nullable();
    table.string('end_reason', 32).nullable();
    table.timestamp('last_activity_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX user_sessions_uuid_uidx
      ON user_sessions (uuid)
  `);
  await knex.raw(`
    CREATE INDEX user_sessions_user_started_idx
      ON user_sessions (user_id, started_at DESC)
  `);
  await knex.raw(`
    CREATE INDEX user_sessions_user_active_idx
      ON user_sessions (user_id, started_at DESC)
      WHERE ended_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX user_sessions_device_id_idx
      ON user_sessions (device_info_id)
      WHERE device_info_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE INDEX user_sessions_refresh_token_id_idx
      ON user_sessions (refresh_token_id)
      WHERE refresh_token_id IS NOT NULL
  `);
  await knex.raw(`
    ALTER TABLE user_sessions
      ADD CONSTRAINT user_sessions_end_reason_chk
      CHECK (
        end_reason IS NULL
        OR end_reason IN ('logout', 'logout_all', 'expired', 'revoked', 'forced')
      )
  `);
  await knex.raw(`
    ALTER TABLE user_sessions
      ADD CONSTRAINT user_sessions_ended_consistency_chk
      CHECK (
        (ended_at IS NULL AND end_reason IS NULL)
        OR (ended_at IS NOT NULL AND end_reason IS NOT NULL)
      )
  `);
  await knex.raw(`
    COMMENT ON TABLE user_sessions IS
      'Static auth session snapshot (login→logout). Display fields frozen; ids for detail links only.';
  `);

  await knex.schema.createTable('user_activities', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    // Static user snapshot
    table.uuid('user_uuid').notNullable();
    table.string('username', 64).notNullable();
    table.string('full_name', 120).nullable();

    // Session link (plain ids)
    table.bigInteger('session_id').unsigned().nullable();
    table.uuid('session_uuid').nullable();

    // Device link + static snapshot
    table.bigInteger('device_info_id').unsigned().nullable();
    table.uuid('device_info_uuid').nullable();
    table.string('platform', 16).nullable();
    table.string('app_version', 32).nullable();
    table.string('device_model', 128).nullable();
    table.string('device_name', 128).nullable();

    // Actor — static; ids for admin detail page
    table.string('actor_type', 16).notNullable().defaultTo('user');
    table.bigInteger('actor_admin_id').unsigned().nullable();
    table.uuid('actor_admin_uuid').nullable();
    table.string('actor_admin_name', 120).nullable();
    table.string('actor_admin_email', 255).nullable();

    // Dynamic vocabulary (owned by app module — not DB enum)
    table.string('event_type', 64).notNullable();
    table.boolean('success').notNullable().defaultTo(true);

    table.string('target_type', 64).nullable();
    table.bigInteger('target_id').unsigned().nullable();
    table.uuid('target_uuid').nullable();
    table.string('target_label', 255).nullable();
    table.jsonb('target_snapshot').nullable();

    table.string('ip_address', 64).nullable();
    table.string('user_agent', 512).nullable();
    table.jsonb('meta').nullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX user_activities_uuid_uidx
      ON user_activities (uuid)
  `);
  await knex.raw(`
    CREATE INDEX user_activities_user_created_idx
      ON user_activities (user_id, created_at DESC)
  `);
  await knex.raw(`
    CREATE INDEX user_activities_user_uuid_created_idx
      ON user_activities (user_uuid, created_at DESC)
  `);
  await knex.raw(`
    CREATE INDEX user_activities_session_created_idx
      ON user_activities (session_id, created_at ASC)
      WHERE session_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE INDEX user_activities_event_created_idx
      ON user_activities (event_type, created_at DESC)
  `);
  await knex.raw(`
    CREATE INDEX user_activities_target_id_idx
      ON user_activities (target_type, target_id)
      WHERE target_type IS NOT NULL AND target_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE INDEX user_activities_target_uuid_idx
      ON user_activities (target_type, target_uuid)
      WHERE target_type IS NOT NULL AND target_uuid IS NOT NULL
  `);
  await knex.raw(`
    CREATE INDEX user_activities_actor_admin_idx
      ON user_activities (actor_admin_id, created_at DESC)
      WHERE actor_admin_id IS NOT NULL
  `);
  await knex.raw(`
    ALTER TABLE user_activities
      ADD CONSTRAINT user_activities_actor_type_chk
      CHECK (actor_type IN ('user', 'admin', 'system'))
  `);
  await knex.raw(`
    ALTER TABLE user_activities
      ADD CONSTRAINT user_activities_actor_admin_consistency_chk
      CHECK (
        (actor_type = 'admin' AND actor_admin_id IS NOT NULL)
        OR (actor_type <> 'admin' AND actor_admin_id IS NULL)
      )
  `);
  await knex.raw(`
    ALTER TABLE user_activities
      ADD CONSTRAINT user_activities_target_consistency_chk
      CHECK (
        (
          target_type IS NULL
          AND target_id IS NULL
          AND target_uuid IS NULL
          AND target_label IS NULL
        )
        OR (
          target_type IS NOT NULL
          AND (target_id IS NOT NULL OR target_uuid IS NOT NULL)
        )
      )
  `);
  await knex.raw(`
    ALTER TABLE user_activities
      ADD CONSTRAINT user_activities_session_consistency_chk
      CHECK (
        (session_id IS NULL AND session_uuid IS NULL)
        OR (session_id IS NOT NULL AND session_uuid IS NOT NULL)
      )
  `);
  await knex.raw(`
    COMMENT ON TABLE user_activities IS
      'Append-only static activity log — display frozen at write; event_type/target_type dynamic via app module';
  `);
  await knex.raw(`
    COMMENT ON COLUMN user_activities.event_type IS
      'Dynamic event key (e.g. login, post_created) — vocabulary owned by user-activity module';
  `);
  await knex.raw(`
    COMMENT ON COLUMN user_activities.target_uuid IS
      'Public uuid for admin/app detail routes';
  `);
  await knex.raw(`
    COMMENT ON COLUMN user_activities.target_label IS
      'Frozen human-readable label (username, caption snippet, channel name, …)';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_activities');
  await knex.schema.dropTableIfExists('user_sessions');
}
