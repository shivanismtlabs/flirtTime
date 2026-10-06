import type { Knex } from 'knex';

/** Post-level people tags (Instagram-style) — not media JSONB */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('post_user_tags', (table) => {
    table.bigIncrements('id').primary();

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

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['post_id', 'user_id'], { indexName: 'post_user_tags_pair_uidx' });
    table.index(['user_id', 'post_id'], 'post_user_tags_user_post_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('post_user_tags');
}
