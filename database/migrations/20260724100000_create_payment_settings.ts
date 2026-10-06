import type { Knex } from 'knex';

/**
 * payment_settings — admin-configurable payment / withdraw fee rules.
 * Key/value JSON blobs (e.g. key = `withdraw`).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('payment_settings', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table.string('key', 64).notNullable();
    table.jsonb('value').notNullable().defaultTo('{}');
    table.boolean('is_active').notNullable().defaultTo(true);

    table
      .bigInteger('updated_by')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX payment_settings_uuid_active_uidx
      ON payment_settings (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX payment_settings_key_active_uidx
      ON payment_settings (key)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    COMMENT ON TABLE payment_settings IS
      'Admin payment config (withdraw fees, enabled methods, crypto networks)';
  `);

  const withdrawValue = {
    feeType: 'percent',
    feePercent: 5,
    feeFlat: 0,
    minAmount: 100,
    maxAmount: 100000,
    enabledMethods: ['bank', 'paypal', 'crypto'],
    methodFees: {
      bank: { feeType: 'percent', feePercent: 5, feeFlat: 0 },
      paypal: { feeType: 'percent', feePercent: 7, feeFlat: 0 },
      crypto: { feeType: 'flat', feePercent: 0, feeFlat: 10 },
    },
    cryptoCurrencies: [
      { currency: 'USDT', networks: ['TRC20', 'ERC20', 'BEP20'] },
      { currency: 'BTC', networks: ['BTC'] },
    ],
  };

  await knex('payment_settings').insert({
    uuid: knex.raw('gen_random_uuid()'),
    key: 'withdraw',
    value: JSON.stringify(withdrawValue),
    is_active: true,
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('payment_settings');
}
