import type { Knex } from 'knex';

/**
 * countries — master country / nationality dial list (Linkgram `countries` parity).
 * Public id is `uuid`; used by lookup country/nationality APIs.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('countries', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table.string('name', 120).notNullable();
    table.string('flag_url', 500).notNullable();
    table.string('country_code', 10).notNullable();
    table.string('nationality', 200).notNullable();
    table.string('phone_code', 16).notNullable();
    table.boolean('is_new_country_visible').notNullable().defaultTo(false);

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX countries_uuid_active_uidx
      ON countries (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX countries_name_active_uidx
      ON countries (LOWER(name))
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX countries_country_code_active_uidx
      ON countries (UPPER(country_code))
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX countries_phone_code_idx
      ON countries (phone_code)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX countries_name_idx
      ON countries (name ASC)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    COMMENT ON TABLE countries IS
      'Country master — name, ISO code, nationality demonym, phone dial, flag URL'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('countries');
}
