import type { Knex } from 'knex';

/**
 * user_contacts — phonebook snapshot uploaded by a user for contact matching.
 * Phones stored normalized (digits-only country_code + national number), same as users.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_contacts', (table) => {
    table.bigIncrements('id').primary();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.string('country_code', 8).notNullable();
    table.string('phone_number', 32).notNullable();
    table.string('display_name', 120).nullable();

    table.timestamp('synced_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['user_id'], 'user_contacts_user_idx');
  });

  await knex.raw(`
    CREATE UNIQUE INDEX user_contacts_owner_phone_active_uidx
      ON user_contacts (user_id, country_code, phone_number)
      WHERE deleted_at IS NULL
  `);

  await knex.raw(`
    CREATE INDEX user_contacts_phone_active_idx
      ON user_contacts (country_code, phone_number)
      WHERE deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_contacts');
}
