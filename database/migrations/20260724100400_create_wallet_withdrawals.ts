import type { Knex } from 'knex';

/**
 * wallet_withdrawals — earned-coin payout requests (bank / paypal / crypto).
 * payout_details jsonb shapes:
 *   bank: accountNumber, fullName, bankName, swiftCode, country,
 *         verification.{routingNumber,city,postalCode}
 *   crypto: currency, network, address
 *   paypal: paypalId
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('wallet_withdrawals', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table
      .bigInteger('wallet_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('wallets')
      .onDelete('CASCADE');

    /** Gross amount debited from earned_coins */
    table.bigInteger('amount').notNullable();
    table.bigInteger('fee_amount').notNullable().defaultTo(0);
    /** Net payout = amount - fee_amount ("you will receive") */
    table.bigInteger('net_amount').notNullable();
    table.jsonb('fee_snapshot').nullable();

    table.string('payout_method', 16).notNullable();
    table.jsonb('payout_details').notNullable();

    table.string('status', 32).notNullable().defaultTo('pending');
    table.text('admin_note').nullable();
    table.timestamp('processed_at', { useTz: true }).nullable();

    table
      .bigInteger('processed_by')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table
      .bigInteger('wallet_transaction_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('wallet_transactions')
      .onDelete('SET NULL');

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX wallet_withdrawals_uuid_active_uidx
      ON wallet_withdrawals (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    ALTER TABLE wallet_withdrawals
      ADD CONSTRAINT wallet_withdrawals_payout_method_chk
      CHECK (payout_method IN ('bank','paypal','crypto'))
  `);
  await knex.raw(`
    ALTER TABLE wallet_withdrawals
      ADD CONSTRAINT wallet_withdrawals_status_chk
      CHECK (status IN ('pending','approved','rejected','paid','cancelled'))
  `);
  await knex.raw(`
    ALTER TABLE wallet_withdrawals
      ADD CONSTRAINT wallet_withdrawals_amount_positive_chk
      CHECK (amount > 0 AND fee_amount >= 0 AND net_amount >= 0)
  `);
  await knex.raw(`
    ALTER TABLE wallet_withdrawals
      ADD CONSTRAINT wallet_withdrawals_net_eq_chk
      CHECK (net_amount = amount - fee_amount)
  `);
  await knex.raw(`
    CREATE INDEX wallet_withdrawals_user_created_idx
      ON wallet_withdrawals (user_id, created_at DESC)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX wallet_withdrawals_status_idx
      ON wallet_withdrawals (status)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    COMMENT ON TABLE wallet_withdrawals IS
      'Earned-coin withdraw requests — bank / paypal / crypto + fee snapshot';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('wallet_withdrawals');
}
