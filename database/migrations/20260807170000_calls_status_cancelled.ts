import type { Knex } from 'knex';

/**
 * Allow `cancelled` call status — caller hung up before pickup (WhatsApp-style).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_status_check
  `);
  await knex.raw(`
    ALTER TABLE calls
      ADD CONSTRAINT calls_status_check
      CHECK (status IN ('ringing', 'ongoing', 'ended', 'missed', 'declined', 'cancelled'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex('calls').where({ status: 'cancelled' }).update({ status: 'missed' });
  await knex.raw(`
    ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_status_check
  `);
  await knex.raw(`
    ALTER TABLE calls
      ADD CONSTRAINT calls_status_check
      CHECK (status IN ('ringing', 'ongoing', 'ended', 'missed', 'declined'))
  `);
}
