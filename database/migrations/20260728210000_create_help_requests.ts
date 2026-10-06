import type { Knex } from 'knex';

/**
 * help_requests — in-app Help / Report a Problem tickets (Linkgram parity).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('help_requests', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.string('name', 120).notNullable();
    table.string('mobile', 32).notNullable();
    table.string('email', 255).notNullable();
    table.string('type', 64).notNullable();
    table.text('description').notNullable();

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
    CREATE UNIQUE INDEX help_requests_uuid_active_uidx
      ON help_requests (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX help_requests_user_id_idx
      ON help_requests (user_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX help_requests_created_at_idx
      ON help_requests (created_at DESC)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    COMMENT ON TABLE help_requests IS
      'User help / support tickets from Settings → Help'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('help_requests');
}
