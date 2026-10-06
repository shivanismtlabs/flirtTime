import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('post_reports', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('reporter_id')
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

    table.string('reason', 64).notNullable();
    table.text('details').nullable();
    table.string('status', 32).notNullable().defaultTo('open');

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX post_reports_uuid_active_uidx
      ON post_reports (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX post_reports_pair_active_uidx
      ON post_reports (reporter_id, post_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX post_reports_post_status_idx
      ON post_reports (post_id, status, created_at DESC)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX post_reports_reporter_created_idx
      ON post_reports (reporter_id, created_at DESC)
      WHERE deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('post_reports');
}
