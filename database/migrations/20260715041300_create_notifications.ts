import type { Knex } from 'knex';

/**
 * Social notifications inbox
 * 100M: purge soft-deleted + older than ~90 days via job;
 * RANGE partition by created_at when table is multi-TB
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('notifications', (table) => {
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
      .bigInteger('actor_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table.string('type', 64).notNullable();
    table.string('entity_type', 32).nullable();
    table.bigInteger('entity_id').unsigned().nullable();
    table.text('body').nullable();
    table.boolean('is_read').notNullable().defaultTo(false);

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX notifications_uuid_active_uidx
      ON notifications (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX notifications_user_created_idx
      ON notifications (user_id, created_at DESC)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX notifications_user_unread_idx
      ON notifications (user_id, created_at DESC)
      WHERE deleted_at IS NULL AND is_read = false
  `);
  await knex.raw(`
    CREATE INDEX notifications_created_at_brin
      ON notifications USING BRIN (created_at)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('notifications');
}
