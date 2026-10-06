import type { Knex } from 'knex';

/**
 * Account privacy prefs for Linkgram-compatible setting screens:
 * comment-settings, post-settings, tag-visibility, user-visibility.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('comment_settings', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table
      .string('allow_comments_permission', 50)
      .notNullable()
      .defaultTo('everyone');
    table.boolean('hide_offensive_comments').notNullable().defaultTo(true);
    table.boolean('enable_manual_filters').notNullable().defaultTo(false);

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX comment_settings_uuid_active_uidx
      ON comment_settings (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX comment_settings_user_id_uidx
      ON comment_settings (user_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    COMMENT ON TABLE comment_settings IS
      'Per-user who-can-comment / offensive / manual-filter prefs'
  `);

  await knex.schema.createTable('post_default_settings', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table
      .string('default_audience', 50)
      .notNullable()
      .defaultTo('everyone');
    table.jsonb('specific_people').notNullable().defaultTo('[]');

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX post_default_settings_uuid_active_uidx
      ON post_default_settings (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX post_default_settings_user_id_uidx
      ON post_default_settings (user_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    COMMENT ON TABLE post_default_settings IS
      'Per-user default post audience / specific people prefs'
  `);

  await knex.schema.createTable('tag_visibility_settings', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table
      .string('tag_permission', 50)
      .notNullable()
      .defaultTo('everyone');
    table
      .string('mention_permission', 50)
      .notNullable()
      .defaultTo('everyone');
    table.jsonb('tag_permission_user_ids').notNullable().defaultTo('[]');

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX tag_visibility_settings_uuid_active_uidx
      ON tag_visibility_settings (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX tag_visibility_settings_user_id_uidx
      ON tag_visibility_settings (user_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    COMMENT ON TABLE tag_visibility_settings IS
      'Per-user tag / mention visibility prefs'
  `);

  await knex.schema.createTable('user_visibility_settings', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table
      .string('online_visibility', 50)
      .notNullable()
      .defaultTo('everyone');
    table
      .string('last_seen_visibility', 50)
      .notNullable()
      .defaultTo('everyone');
    table.jsonb('blocked_users').notNullable().defaultTo('[]');

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX user_visibility_settings_uuid_active_uidx
      ON user_visibility_settings (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX user_visibility_settings_user_id_uidx
      ON user_visibility_settings (user_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    COMMENT ON TABLE user_visibility_settings IS
      'Per-user online / last-seen visibility prefs'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_visibility_settings');
  await knex.schema.dropTableIfExists('tag_visibility_settings');
  await knex.schema.dropTableIfExists('post_default_settings');
  await knex.schema.dropTableIfExists('comment_settings');
}
