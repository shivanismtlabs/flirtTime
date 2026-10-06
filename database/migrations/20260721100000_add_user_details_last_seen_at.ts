import type { Knex } from 'knex';

/** Persist last-seen for chat presence when user goes offline. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_details', (table) => {
    table.timestamp('last_seen_at', { useTz: true }).nullable();
    table.index(['last_seen_at'], 'user_details_last_seen_at_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_details', (table) => {
    table.dropIndex(['last_seen_at'], 'user_details_last_seen_at_idx');
    table.dropColumn('last_seen_at');
  });
}
