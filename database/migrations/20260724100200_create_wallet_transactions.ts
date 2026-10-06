import type { Knex } from 'knex';

/**
 * wallet_transactions — immutable ledger for all balance movements.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('wallet_transactions', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('wallet_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('wallets')
      .onDelete('CASCADE');

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.string('type', 32).notNullable();
    table.string('bucket', 16).notNullable();
    table.string('direction', 8).notNullable();
    table.bigInteger('amount').notNullable();
    table.bigInteger('balance_after').notNullable();

    table
      .bigInteger('counterparty_user_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table.string('reference_type', 64).nullable();
    table.string('reference_id', 64).nullable();
    table.jsonb('meta').nullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX wallet_transactions_uuid_uidx
      ON wallet_transactions (uuid)
  `);
  await knex.raw(`
    ALTER TABLE wallet_transactions
      ADD CONSTRAINT wallet_transactions_type_chk
      CHECK (type IN ('topup','send','receive','earn','withdraw','spend','adjust'))
  `);
  await knex.raw(`
    ALTER TABLE wallet_transactions
      ADD CONSTRAINT wallet_transactions_bucket_chk
      CHECK (bucket IN ('available','earned'))
  `);
  await knex.raw(`
    ALTER TABLE wallet_transactions
      ADD CONSTRAINT wallet_transactions_direction_chk
      CHECK (direction IN ('credit','debit'))
  `);
  await knex.raw(`
    ALTER TABLE wallet_transactions
      ADD CONSTRAINT wallet_transactions_amount_positive_chk
      CHECK (amount > 0)
  `);
  await knex.raw(`
    CREATE INDEX wallet_transactions_user_created_idx
      ON wallet_transactions (user_id, created_at DESC)
  `);
  await knex.raw(`
    CREATE INDEX wallet_transactions_wallet_created_idx
      ON wallet_transactions (wallet_id, created_at DESC)
  `);
  await knex.raw(`
    CREATE INDEX wallet_transactions_type_idx
      ON wallet_transactions (type)
  `);
  await knex.raw(`
    COMMENT ON TABLE wallet_transactions IS
      'Wallet ledger — topup/send/receive/earn/withdraw/spend/adjust';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('wallet_transactions');
}
