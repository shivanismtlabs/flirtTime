import type { Knex } from 'knex';

/** Who gifted on a post — truth table */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('post_gifts', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('post_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('posts')
      .onDelete('CASCADE');

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    /** Gift catalog key / SKU, e.g. rose | diamond */
    table.string('gift_type', 64).notNullable();
    table.integer('quantity').notNullable().defaultTo(1);
    table.decimal('amount', 12, 2).nullable();
    table.string('currency', 8).nullable();
    table.jsonb('meta').nullable();

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX post_gifts_uuid_active_uidx
      ON post_gifts (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX post_gifts_post_created_idx
      ON post_gifts (post_id, created_at DESC)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX post_gifts_user_created_idx
      ON post_gifts (user_id, created_at DESC)
      WHERE deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('post_gifts');
}
