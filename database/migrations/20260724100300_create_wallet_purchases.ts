import type { Knex } from 'knex';

/**
 * wallet_purchases — Android / iOS IAP records (store receipt + credit status).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('wallet_purchases', (table) => {
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

    table
      .bigInteger('coin_package_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('coin_packages')
      .onDelete('RESTRICT');

    table.string('platform', 16).notNullable();
    table.string('product_id', 255).notNullable();
    table.string('store_transaction_id', 255).notNullable();
    table.text('store_purchase_token').nullable();
    table.text('store_receipt').nullable();

    table.bigInteger('coins_granted').notNullable();
    table.integer('amount_usd_cent').notNullable().defaultTo(0);

    table.string('status', 32).notNullable().defaultTo('pending');
    table.timestamp('verified_at', { useTz: true }).nullable();
    table.timestamp('credited_at', { useTz: true }).nullable();

    table
      .bigInteger('wallet_transaction_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('wallet_transactions')
      .onDelete('SET NULL');

    table.jsonb('meta').nullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX wallet_purchases_uuid_uidx
      ON wallet_purchases (uuid)
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX wallet_purchases_store_tx_uidx
      ON wallet_purchases (store_transaction_id)
  `);
  await knex.raw(`
    ALTER TABLE wallet_purchases
      ADD CONSTRAINT wallet_purchases_platform_chk
      CHECK (platform IN ('android','ios'))
  `);
  await knex.raw(`
    ALTER TABLE wallet_purchases
      ADD CONSTRAINT wallet_purchases_status_chk
      CHECK (status IN ('pending','verified','credited','failed','refunded'))
  `);
  await knex.raw(`
    ALTER TABLE wallet_purchases
      ADD CONSTRAINT wallet_purchases_coins_positive_chk
      CHECK (coins_granted > 0)
  `);
  await knex.raw(`
    CREATE INDEX wallet_purchases_user_created_idx
      ON wallet_purchases (user_id, created_at DESC)
  `);
  await knex.raw(`
    CREATE INDEX wallet_purchases_status_idx
      ON wallet_purchases (status)
  `);
  await knex.raw(`
    COMMENT ON TABLE wallet_purchases IS
      'IAP purchases — Google/Apple transaction ids; credits available_coins';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('wallet_purchases');
}
