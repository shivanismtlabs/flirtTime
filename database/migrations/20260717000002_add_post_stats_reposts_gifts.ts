import type { Knex } from 'knex';

/** Extend post_stats with repost + gift counters */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('post_stats', (table) => {
    table.bigInteger('reposts_count').notNullable().defaultTo(0);
    table.bigInteger('gifts_count').notNullable().defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('post_stats', (table) => {
    table.dropColumn('reposts_count');
    table.dropColumn('gifts_count');
  });
}
