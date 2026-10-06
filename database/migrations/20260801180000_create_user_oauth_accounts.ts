import type { Knex } from 'knex';

/**
 * Social login (Google / Apple)
 * - users.password / salt / phone nullable for social-only accounts
 * - user_oauth_accounts stores verified provider identities
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.string('password', 255).nullable().alter();
    table.string('salt', 255).nullable().alter();
    table.string('country_code', 8).nullable().alter();
    table.string('phone_number', 32).nullable().alter();
    table.string('email', 255).nullable().alter();
  });

  // Replace phone unique index so NULL phones do not collide
  await knex.raw(`DROP INDEX IF EXISTS users_phone_active_uidx`);
  await knex.raw(`
    CREATE UNIQUE INDEX users_phone_active_uidx
      ON users (country_code, phone_number)
      WHERE deleted_at IS NULL
        AND country_code IS NOT NULL
        AND phone_number IS NOT NULL
  `);

  await knex.raw(`DROP INDEX IF EXISTS users_email_active_uidx`);
  await knex.raw(`
    CREATE UNIQUE INDEX users_email_active_uidx
      ON users (email)
      WHERE deleted_at IS NULL AND email IS NOT NULL
  `);

  await knex.schema.createTable('user_oauth_accounts', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.string('provider', 32).notNullable(); // google | apple
    table.string('provider_user_id', 255).notNullable();
    table.string('email', 255).nullable();
    table.boolean('email_verified').notNullable().defaultTo(false);
    table.string('display_name', 255).nullable();
    table.text('avatar_url').nullable();
    table.jsonb('raw_profile').nullable();

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['user_id'], 'user_oauth_accounts_user_id_idx');
    table.index(['deleted_at'], 'user_oauth_accounts_deleted_at_idx');
  });

  await knex.raw(`
    ALTER TABLE user_oauth_accounts
      ADD CONSTRAINT user_oauth_accounts_provider_check
      CHECK (provider IN ('google', 'apple'))
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX user_oauth_accounts_uuid_active_uidx
      ON user_oauth_accounts (uuid)
      WHERE deleted_at IS NULL
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX user_oauth_accounts_provider_uid_active_uidx
      ON user_oauth_accounts (provider, provider_user_id)
      WHERE deleted_at IS NULL
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX user_oauth_accounts_user_provider_active_uidx
      ON user_oauth_accounts (user_id, provider)
      WHERE deleted_at IS NULL
  `);

  await knex.raw(`
    COMMENT ON TABLE user_oauth_accounts IS
      'Verified Google/Apple identities linked to users (server-side ID token verify)'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_oauth_accounts');

  await knex.raw(`DROP INDEX IF EXISTS users_phone_active_uidx`);
  await knex.raw(`
    CREATE UNIQUE INDEX users_phone_active_uidx
      ON users (country_code, phone_number)
      WHERE deleted_at IS NULL
  `);

  await knex.raw(`DROP INDEX IF EXISTS users_email_active_uidx`);
  await knex.raw(`
    CREATE UNIQUE INDEX users_email_active_uidx
      ON users (email)
      WHERE deleted_at IS NULL
  `);

  // Restore NOT NULL — fill nulls first so alter succeeds
  await knex('users').whereNull('email').update({
    email: knex.raw(`'deleted-' || id::text || '@invalid.local'`),
  });
  await knex('users').whereNull('country_code').update({ country_code: '0' });
  await knex('users').whereNull('phone_number').update({
    phone_number: knex.raw(`'x' || id::text`),
  });
  await knex('users').whereNull('password').update({ password: '' });
  await knex('users').whereNull('salt').update({ salt: '' });

  await knex.schema.alterTable('users', (table) => {
    table.string('email', 255).notNullable().alter();
    table.string('country_code', 8).notNullable().alter();
    table.string('phone_number', 32).notNullable().alter();
    table.string('password', 255).notNullable().alter();
    table.string('salt', 255).notNullable().alter();
  });
}
