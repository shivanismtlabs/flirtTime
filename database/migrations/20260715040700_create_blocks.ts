import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('blocks', (table) => {
    table.bigIncrements('id').primary();

    table
      .bigInteger('blocker_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table
      .bigInteger('blocked_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE blocks
      ADD CONSTRAINT blocks_no_self_check
      CHECK (blocker_id <> blocked_id)
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX blocks_pair_active_uidx
      ON blocks (blocker_id, blocked_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX blocks_blocked_idx
      ON blocks (blocked_id)
      WHERE deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('blocks');
}
