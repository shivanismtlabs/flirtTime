import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('admin_refresh_tokens', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('admin_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('admins')
      .onDelete('CASCADE');

    table.string('token_hash', 128).notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('revoked_at', { useTz: true }).nullable();
    table.string('user_agent', 512).nullable();
    table.string('ip_address', 64).nullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['expires_at'], 'admin_refresh_tokens_expires_at_idx');
  });

  await knex.raw(`
    CREATE UNIQUE INDEX admin_refresh_tokens_token_hash_active_uidx
      ON admin_refresh_tokens (token_hash)
      WHERE revoked_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX admin_refresh_tokens_admin_active_idx
      ON admin_refresh_tokens (admin_id, created_at DESC)
      WHERE revoked_at IS NULL
  `);
  await knex.raw(`
    COMMENT ON TABLE admin_refresh_tokens IS
      'Hashed refresh tokens for staff admin sessions — enables rotation + revocation (logout / logout-everywhere)';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('admin_refresh_tokens');
}
