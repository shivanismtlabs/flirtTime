import type { Knex } from 'knex';

/** Generic S3 / asset registry (not chat attachments) */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('media', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.string('kind', 32).notNullable(); // image | video | audio | file
    table.string('key', 512).notNullable();
    table.string('content_type', 128).notNullable();
    table.bigInteger('size_bytes').nullable();
    table.string('status', 32).notNullable().defaultTo('pending'); // pending | ready | failed
    table.timestamp('deleted_at', { useTz: true }).nullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['user_id', 'created_at'], 'media_user_created_idx');
    table.index(['deleted_at'], 'media_deleted_at_idx');
  });

  await knex.raw(`
    CREATE UNIQUE INDEX media_uuid_active_uidx
      ON media (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX media_key_active_uidx
      ON media (key)
      WHERE deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('media');
}
