import type { Knex } from 'knex';

/** Common OTP table — email and phone */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('verifications', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.string('channel', 16).notNullable(); // email | phone
    table.string('destination', 255).notNullable();
    table.string('country_code', 8).nullable();
    table.string('purpose', 32).notNullable();
    table.string('code_hash', 255).notNullable();
    table.integer('attempts').notNullable().defaultTo(0);
    table.integer('max_attempts').notNullable().defaultTo(5);
    table.string('status', 16).notNullable().defaultTo('pending');
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('verified_at', { useTz: true }).nullable();
    table.timestamp('deleted_at', { useTz: true }).nullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['expires_at'], 'verifications_expires_at_idx');
    table.index(['user_id', 'created_at'], 'verifications_user_created_idx');
  });

  await knex.raw(`
    ALTER TABLE verifications
      ADD CONSTRAINT verifications_channel_check
      CHECK (channel IN ('email', 'phone'))
  `);

  await knex.raw(`
    CREATE INDEX verifications_pending_lookup_idx
      ON verifications (destination, purpose, channel)
      WHERE status = 'pending' AND deleted_at IS NULL
  `);

  await knex.raw(`
    COMMENT ON TABLE verifications IS 'Common OTP for email + phone verification flows';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('verifications');
}
