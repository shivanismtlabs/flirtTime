import type { Knex } from 'knex';

/**
 * user_stats — 1:1 denormalized counters for a user
 * System-maintained only (not user form input)
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_stats', (table) => {
    table.bigIncrements('id').primary();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.bigInteger('post_count').notNullable().defaultTo(0);
    table.bigInteger('reel_count').notNullable().defaultTo(0);
    table.bigInteger('follower_count').notNullable().defaultTo(0);
    table.bigInteger('following_count').notNullable().defaultTo(0);

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['user_id'], { indexName: 'user_stats_user_id_uidx' });
  });

  await knex.raw(`
    COMMENT ON TABLE user_stats IS 'Denormalized user counters — updated by app/jobs, not user forms';
  `);
  await knex.raw(`
    COMMENT ON COLUMN user_stats.user_id IS 'FK → users.id (1:1)';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_stats');
}
