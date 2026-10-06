import type { Knex } from 'knex';

/**
 * request_verifications — Settings → Request verification (blue check).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('request_verifications', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.string('full_name', 120).notNullable();
    table.string('document_type', 64).notNullable();
    table.text('document_url').notNullable();
    table.string('category', 64).notNullable();
    table.string('nationality_code', 16).notNullable();
    table.string('nationality_name', 120).notNullable().defaultTo('');
    table.text('audience').nullable();
    table.string('also_known_as', 255).nullable();
    table.jsonb('links').notNullable().defaultTo('[]');
    table.string('status', 32).notNullable().defaultTo('Submitted');
    table.text('comments').nullable();

    table.timestamp('submitted_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('approved_at', { useTz: true }).nullable();
    table.string('approved_by', 120).nullable();
    table.timestamp('rejected_at', { useTz: true }).nullable();
    table.string('rejected_by', 120).nullable();

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
    CREATE UNIQUE INDEX request_verifications_uuid_active_uidx
      ON request_verifications (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX request_verifications_user_active_uidx
      ON request_verifications (user_id)
      WHERE deleted_at IS NULL
        AND status IN ('Submitted', 'Viewed')
  `);
  await knex.raw(`
    CREATE INDEX request_verifications_user_id_idx
      ON request_verifications (user_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    COMMENT ON TABLE request_verifications IS
      'User blue-check verification requests from Settings → Request verification'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('request_verifications');
}
