import type { Knex } from 'knex';

/**
 * Transactional outbox — required at 100M for reliable socket/push
 * Same TX as message insert; workers drain published_at IS NULL
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('chat_outbox', (table) => {
    table.bigIncrements('id').primary();

    table.string('event_type', 64).notNullable();
    table.bigInteger('conversation_id').unsigned().notNullable();
    table.bigInteger('message_id').unsigned().nullable();
    table.bigInteger('actor_id').unsigned().nullable();
    table.jsonb('payload').notNullable();

    table.smallint('attempts').notNullable().defaultTo(0);
    table.timestamp('available_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('published_at', { useTz: true }).nullable();
    table.text('last_error').nullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX chat_outbox_pending_idx
      ON chat_outbox (available_at ASC, id ASC)
      WHERE published_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX chat_outbox_published_purge_idx
      ON chat_outbox (published_at)
      WHERE published_at IS NOT NULL
  `);

  await knex.raw(`
    COMMENT ON TABLE chat_outbox IS
      '100M chat outbox — durable fan-out; purge published rows via job';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('chat_outbox');
}
