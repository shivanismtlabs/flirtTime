import type { Knex } from 'knex';

/**
 * wallets — per-user balances.
 * available_coins: IAP / send / receive / spend
 * earned_coins: rewards; withdraw only
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('wallets', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.bigInteger('available_coins').notNullable().defaultTo(0);
    table.bigInteger('earned_coins').notNullable().defaultTo(0);
    table.string('currency', 16).notNullable().defaultTo('coin');

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX wallets_uuid_active_uidx
      ON wallets (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX wallets_user_id_active_uidx
      ON wallets (user_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    ALTER TABLE wallets
      ADD CONSTRAINT wallets_available_coins_nonneg_chk
      CHECK (available_coins >= 0)
  `);
  await knex.raw(`
    ALTER TABLE wallets
      ADD CONSTRAINT wallets_earned_coins_nonneg_chk
      CHECK (earned_coins >= 0)
  `);
  await knex.raw(`
    COMMENT ON TABLE wallets IS
      'User coin wallet — available (spend/send) + earned (withdraw)';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('wallets');
}
