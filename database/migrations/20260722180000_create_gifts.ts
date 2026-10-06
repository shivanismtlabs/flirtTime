import type { Knex } from 'knex';

/**
 * gifts — catalog of sendable gifts.
 * Fields mirror catalog payloads: icon, amount, type, title, currency, isActive, visualOrder.
 * Seed catalog via: npm run db:seed:gifts
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('gifts', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table.string('type', 64).notNullable();
    table.string('title', 120).notNullable();
    /** Icon URL or media uuid */
    table.string('icon', 512).notNullable().defaultTo('');
    table.decimal('amount', 12, 2).notNullable().defaultTo(0);
    table.string('currency', 16).notNullable().defaultTo('coin');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.integer('visual_order').notNullable().defaultTo(0);

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX gifts_uuid_active_uidx
      ON gifts (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX gifts_active_order_idx
      ON gifts (is_active, visual_order ASC, id ASC)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX gifts_type_active_idx
      ON gifts (type)
      WHERE deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('gifts');
}
