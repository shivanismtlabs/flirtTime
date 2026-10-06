import type { Knex } from 'knex';

/**
 * coin_packages — IAP / store coin packs (Linkgram `coin_packages` parity).
 * List active packs by sort_order for wallet top-up UI.
 * Seed catalog via: npm run db:seed:coin-packages
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('coin_packages', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table.string('name', 255).notNullable();
    table.integer('coins').notNullable();
    /** Price in USD cents (e.g. 99 = $0.99) */
    table.integer('amount_usd_cent').notNullable();
    table.integer('bonus_coins').notNullable().defaultTo(0);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.string('google_product_id', 255).nullable();
    table.string('ios_product_id', 255).nullable();
    table.integer('sort_order').notNullable().defaultTo(0);

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX coin_packages_uuid_active_uidx
      ON coin_packages (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX coin_packages_active_order_idx
      ON coin_packages (is_active, sort_order ASC, id ASC)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX coin_packages_google_product_active_uidx
      ON coin_packages (google_product_id)
      WHERE deleted_at IS NULL AND google_product_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX coin_packages_ios_product_active_uidx
      ON coin_packages (ios_product_id)
      WHERE deleted_at IS NULL AND ios_product_id IS NOT NULL
  `);
  await knex.raw(`
    COMMENT ON TABLE coin_packages IS
      'Store coin packs — coins + bonus, USD cents, Google/iOS product ids';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('coin_packages');
}
