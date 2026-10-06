import type { Knex } from 'knex';

/**
 * Group + 1:1 call participants.
 * - calls.callee_id becomes nullable (null for group calls)
 * - call_participants tracks invite/join/leave per member
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE calls
      ALTER COLUMN callee_id DROP NOT NULL
  `);

  await knex.schema.createTable('call_participants', (table) => {
    table.bigIncrements('id').primary();

    table
      .bigInteger('call_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('calls')
      .onDelete('CASCADE');

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    /** caller | member */
    table.string('role', 16).notNullable().defaultTo('member');
    /** ringing | joined | left | declined | missed */
    table.string('state', 16).notNullable().defaultTo('ringing');

    table.timestamp('invited_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('joined_at', { useTz: true }).nullable();
    table.timestamp('left_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE call_participants
      ADD CONSTRAINT call_participants_role_chk
      CHECK (role IN ('caller', 'member'))
  `);
  await knex.raw(`
    ALTER TABLE call_participants
      ADD CONSTRAINT call_participants_state_chk
      CHECK (state IN ('ringing', 'joined', 'left', 'declined', 'missed'))
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX call_participants_call_user_uidx
      ON call_participants (call_id, user_id)
  `);
  await knex.raw(`
    CREATE INDEX call_participants_user_active_idx
      ON call_participants (user_id)
      WHERE state IN ('ringing', 'joined')
  `);

  // Backfill existing 1:1 calls into participants
  await knex.raw(`
    INSERT INTO call_participants (call_id, user_id, role, state, invited_at, joined_at, created_at, updated_at)
    SELECT
      c.id,
      c.caller_id,
      'caller',
      CASE
        WHEN c.status IN ('ongoing', 'ended') THEN 'joined'
        WHEN c.status = 'missed' THEN 'missed'
        ELSE 'joined'
      END,
      c.created_at,
      CASE WHEN c.status IN ('ongoing', 'ended') THEN c.started_at ELSE c.created_at END,
      c.created_at,
      c.updated_at
    FROM calls c
    ON CONFLICT (call_id, user_id) DO NOTHING
  `);
  await knex.raw(`
    INSERT INTO call_participants (call_id, user_id, role, state, invited_at, joined_at, left_at, created_at, updated_at)
    SELECT
      c.id,
      c.callee_id,
      'member',
      CASE
        WHEN c.status = 'ongoing' THEN 'joined'
        WHEN c.status = 'ended' THEN 'left'
        WHEN c.status = 'declined' THEN 'declined'
        WHEN c.status = 'missed' THEN 'missed'
        ELSE 'ringing'
      END,
      c.created_at,
      CASE WHEN c.status IN ('ongoing', 'ended') THEN c.started_at ELSE NULL END,
      CASE WHEN c.status = 'ended' THEN c.ended_at ELSE NULL END,
      c.created_at,
      c.updated_at
    FROM calls c
    WHERE c.callee_id IS NOT NULL
    ON CONFLICT (call_id, user_id) DO NOTHING
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('call_participants');
  // Do not restore NOT NULL on callee_id — may have null group rows
}
