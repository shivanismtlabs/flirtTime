import type { Knex } from 'knex';

/**
 * channel_members — lean edge (never embed followers in channels row)
 * Roles: owner | admin | follower
 * Only owner/admin may post; followers are read-only subscribers
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('channel_members', (table) => {
    table.bigIncrements('id').primary();

    table
      .bigInteger('channel_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('channels')
      .onDelete('CASCADE');

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.string('role', 16).notNullable().defaultTo('follower');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('joined_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('left_at', { useTz: true }).nullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE channel_members
      ADD CONSTRAINT channel_members_role_check
      CHECK (role IN ('owner', 'admin', 'follower'))
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX channel_members_pair_uidx
      ON channel_members (channel_id, user_id)
  `);
  await knex.raw(`
    CREATE INDEX channel_members_user_active_idx
      ON channel_members (user_id, channel_id)
      WHERE is_active = true
  `);
  await knex.raw(`
    CREATE INDEX channel_members_channel_active_idx
      ON channel_members (channel_id, user_id)
      WHERE is_active = true
  `);
  await knex.raw(`
    CREATE INDEX channel_members_posters_idx
      ON channel_members (channel_id, user_id)
      WHERE is_active = true AND role IN ('owner', 'admin')
  `);

  await knex.raw(`
    COMMENT ON TABLE channel_members IS
      '50M channel membership — owner/admin post; follower read-only';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('channel_members');
}
