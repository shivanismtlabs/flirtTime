import type { Knex } from 'knex';

/**
 * Staff admin notification inbox (separate from app-user `notifications`).
 * One message + per-admin recipient rows (read receipts).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('admin_notifications', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table.string('title', 160).notNullable();
    table.text('body').notNullable();
    table.string('type', 64).notNullable().defaultTo('system');
    table.string('link', 512).nullable();
    table.string('icon', 255).nullable();

    table
      .bigInteger('created_by')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('admins')
      .onDelete('SET NULL');

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(['created_at'], 'admin_notifications_created_at_idx');
    table.index(['created_by'], 'admin_notifications_created_by_idx');
  });

  await knex.raw(`
    CREATE UNIQUE INDEX admin_notifications_uuid_active_uidx
      ON admin_notifications (uuid)
      WHERE deleted_at IS NULL
  `);

  await knex.raw(`
    ALTER TABLE admin_notifications
      ADD CONSTRAINT admin_notifications_type_check
      CHECK (type IN ('system', 'alert', 'info', 'security'))
  `);

  await knex.schema.createTable('admin_notification_recipients', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('admin_notification_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('admin_notifications')
      .onDelete('CASCADE');

    table
      .bigInteger('admin_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('admins')
      .onDelete('CASCADE');

    table.boolean('is_read').notNullable().defaultTo(false);
    table.timestamp('read_at', { useTz: true }).nullable();

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(
      ['admin_id', 'is_read', 'created_at'],
      'admin_notification_recipients_inbox_idx',
    );
  });

  await knex.raw(`
    CREATE UNIQUE INDEX admin_notification_recipients_uuid_active_uidx
      ON admin_notification_recipients (uuid)
      WHERE deleted_at IS NULL
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX admin_notification_recipients_pair_active_uidx
      ON admin_notification_recipients (admin_notification_id, admin_id)
      WHERE deleted_at IS NULL
  `);

  await knex.raw(`
    CREATE INDEX admin_notification_recipients_unread_idx
      ON admin_notification_recipients (admin_id, created_at DESC)
      WHERE deleted_at IS NULL AND is_read = false
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('admin_notification_recipients');
  await knex.schema.dropTableIfExists('admin_notifications');
}
