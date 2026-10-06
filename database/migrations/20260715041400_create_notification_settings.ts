import type { Knex } from 'knex';

/** Per-user social notification prefs (no chat) */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('notification_settings', (table) => {
    table.bigIncrements('id').primary();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.boolean('push_enabled').notNullable().defaultTo(true);
    table.boolean('likes_enabled').notNullable().defaultTo(true);
    table.boolean('comments_enabled').notNullable().defaultTo(true);
    table.boolean('follows_enabled').notNullable().defaultTo(true);
    table.boolean('mentions_enabled').notNullable().defaultTo(true);

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['user_id'], { indexName: 'notification_settings_user_id_uidx' });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('notification_settings');
}
