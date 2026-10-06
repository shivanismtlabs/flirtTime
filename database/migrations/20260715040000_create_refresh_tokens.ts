import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('refresh_tokens', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.string('token_hash', 128).notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('revoked_at', { useTz: true }).nullable();
    table.string('user_agent', 512).nullable();
    table.string('ip_address', 64).nullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['expires_at'], 'refresh_tokens_expires_at_idx');
  });

  await knex.raw(`
    CREATE UNIQUE INDEX refresh_tokens_token_hash_active_uidx
      ON refresh_tokens (token_hash)
      WHERE revoked_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX refresh_tokens_user_active_idx
      ON refresh_tokens (user_id, created_at DESC)
      WHERE revoked_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('refresh_tokens');
}
