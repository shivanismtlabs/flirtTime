import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_reports', (table) => {
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
      .bigInteger('reported_user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.string('reason', 64).notNullable();
    table.text('details').nullable();
    table.string('status', 32).notNullable().defaultTo('open');

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE user_reports
      ADD CONSTRAINT user_reports_no_self_check
      CHECK (reporter_id <> reported_user_id)
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX user_reports_uuid_active_uidx
      ON user_reports (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX user_reports_pair_active_uidx
      ON user_reports (reporter_id, reported_user_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX user_reports_reported_status_idx
      ON user_reports (reported_user_id, status, created_at DESC)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX user_reports_reporter_created_idx
      ON user_reports (reporter_id, created_at DESC)
      WHERE deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_reports');
}
