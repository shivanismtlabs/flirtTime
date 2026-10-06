import type { Knex } from 'knex';

/** Extend media for modern upload sessions (put + multipart up to 2GB) */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('media', (table) => {
    table.string('purpose', 32).notNullable().defaultTo('post');
    table.string('strategy', 16).notNullable().defaultTo('put'); // put | multipart
    table.string('upload_id', 255).nullable();
    table.integer('part_size').nullable();
    table.integer('part_count').nullable();
    table.string('idempotency_key', 128).nullable();
    table.integer('width').nullable();
    table.integer('height').nullable();
    table.integer('duration_ms').nullable();
    table.string('thumbnail_key', 512).nullable();
    table.text('error_message').nullable();
  });

  await knex.raw(`
    CREATE UNIQUE INDEX media_user_idempotency_active_uidx
      ON media (user_id, idempotency_key)
      WHERE deleted_at IS NULL AND idempotency_key IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS media_user_idempotency_active_uidx`);
  await knex.schema.alterTable('media', (table) => {
    table.dropColumn('purpose');
    table.dropColumn('strategy');
    table.dropColumn('upload_id');
    table.dropColumn('part_size');
    table.dropColumn('part_count');
    table.dropColumn('idempotency_key');
    table.dropColumn('width');
    table.dropColumn('height');
    table.dropColumn('duration_ms');
    table.dropColumn('thumbnail_key');
    table.dropColumn('error_message');
  });
}
