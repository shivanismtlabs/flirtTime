import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('hashtags', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table.string('name', 100).notNullable();
    table.bigInteger('post_count').notNullable().defaultTo(0);

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX hashtags_uuid_active_uidx
      ON hashtags (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX hashtags_name_active_uidx
      ON hashtags (lower(name))
      WHERE deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('hashtags');
}
