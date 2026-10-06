import type { Knex } from 'knex';

/**
 * calls — 1:1 Agora audio/video call sessions
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('calls', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('conversation_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('conversations')
      .onDelete('CASCADE');

    table
      .bigInteger('caller_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table
      .bigInteger('callee_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.string('type', 16).notNullable(); // audio | video
    table.string('status', 16).notNullable().defaultTo('ringing');
    table.string('channel_name', 64).notNullable();

    table.timestamp('started_at', { useTz: true }).nullable();
    table.timestamp('ended_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE calls
      ADD CONSTRAINT calls_type_check
      CHECK (type IN ('audio', 'video'))
  `);

  await knex.raw(`
    ALTER TABLE calls
      ADD CONSTRAINT calls_status_check
      CHECK (status IN ('ringing', 'ongoing', 'ended', 'missed', 'declined'))
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX calls_uuid_uidx ON calls (uuid)
  `);

  await knex.raw(`
    CREATE INDEX calls_conversation_created_idx
      ON calls (conversation_id, created_at DESC)
  `);

  await knex.raw(`
    CREATE INDEX calls_active_caller_idx
      ON calls (caller_id)
      WHERE status IN ('ringing', 'ongoing')
  `);

  await knex.raw(`
    CREATE INDEX calls_active_callee_idx
      ON calls (callee_id)
      WHERE status IN ('ringing', 'ongoing')
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('calls');
}
