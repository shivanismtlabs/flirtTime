import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('post_medias', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('post_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('posts')
      .onDelete('CASCADE');

    table
      .bigInteger('media_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('media')
      .onDelete('SET NULL');

    table.text('file_path').notNullable();
    table.string('file_type', 16).notNullable(); // image | video
    table.text('thumbnail').nullable();
    table.integer('position').notNullable().defaultTo(0);
    table.jsonb('meta').nullable();
    table.uuid('stream_id').nullable();
    table.boolean('is_stream_available').notNullable().defaultTo(false);

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE post_medias
      ADD CONSTRAINT post_medias_file_type_check
      CHECK (file_type IN ('image', 'video'))
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX post_medias_uuid_active_uidx
      ON post_medias (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX post_medias_post_position_active_idx
      ON post_medias (post_id, position)
      WHERE deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('post_medias');
}
