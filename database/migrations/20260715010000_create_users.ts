import type { Knex } from 'knex';

/**
 * users
 * Dual ID: id (BIGINT autoincrement, internal) + uuid (public)
 * Soft delete: deleted_at (NULL = active)
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.bigIncrements('id').primary();

    table.uuid('uuid').notNullable();

    table.string('email', 255).notNullable();
    table.string('country_code', 8).notNullable();
    table.string('phone_number', 32).notNullable();
    table.string('password', 255).notNullable();
    table.string('salt', 255).notNullable();
    table.string('status', 32).notNullable().defaultTo('active');
    table.boolean('terms_agreed').notNullable().defaultTo(true);

    // Soft delete — NULL means not deleted
    table.timestamp('deleted_at', { useTz: true }).nullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['status'], 'users_status_idx');
    table.index(['created_at'], 'users_created_at_idx');
    table.index(['deleted_at'], 'users_deleted_at_idx');
  });

  // Unique only among non-deleted rows (allows re-register after soft delete)
  await knex.raw(`
    CREATE UNIQUE INDEX users_uuid_active_uidx
      ON users (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX users_email_active_uidx
      ON users (email)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX users_phone_active_uidx
      ON users (country_code, phone_number)
      WHERE deleted_at IS NULL
  `);

  await knex.raw(`
    COMMENT ON COLUMN users.id IS 'Internal autoincrement PK — joins only, do not expose';
  `);
  await knex.raw(`
    COMMENT ON COLUMN users.uuid IS 'Public UUID — API / clients';
  `);
  await knex.raw(`
    COMMENT ON COLUMN users.deleted_at IS 'Soft delete timestamp — NULL = active user';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
