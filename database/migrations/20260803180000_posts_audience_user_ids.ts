import type { Knex } from 'knex';

/** Optional allowlist of user public UUIDs when posts.privacy = 'specific'. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('posts', (table) => {
    table.jsonb('audience_user_ids').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('posts', (table) => {
    table.dropColumn('audience_user_ids');
  });
}
