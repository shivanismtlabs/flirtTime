import type { Knex } from 'knex';

/** 1:1 denormalized counters for posts */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('post_stats', (table) => {
    table.bigIncrements('id').primary();

    table
      .bigInteger('post_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('posts')
      .onDelete('CASCADE');

    table.bigInteger('likes_count').notNullable().defaultTo(0);
    table.bigInteger('comments_count').notNullable().defaultTo(0);
    table.bigInteger('shares_count').notNullable().defaultTo(0);
    table.bigInteger('views_count').notNullable().defaultTo(0);
    table.bigInteger('saves_count').notNullable().defaultTo(0);

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['post_id'], { indexName: 'post_stats_post_id_uidx' });
  });

  await knex.raw(`
    COMMENT ON TABLE post_stats IS 'Denormalized post counters — system-maintained';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('post_stats');
}
