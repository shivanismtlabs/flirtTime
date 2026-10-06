import type { Knex } from 'knex';

/** Allow notifications.type = poll_vote (vibe polls). */
const TYPES = [
  'like',
  'comment',
  'follow',
  'follow_request',
  'follow_accepted',
  'mention',
  'gift',
  'share',
  'coin_sent',
  'coin_received',
  'poll_vote',
  'system',
  'admin',
  'message',
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check`,
  );
  const typeList = TYPES.map((t) => `'${t}'`).join(', ');
  await knex.raw(`
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (${typeList}))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex('notifications')
    .where({ type: 'poll_vote' })
    .update({ type: 'system' });

  await knex.raw(
    `ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check`,
  );
  const legacy = TYPES.filter((t) => t !== 'poll_vote');
  const typeList = legacy.map((t) => `'${t}'`).join(', ');
  await knex.raw(`
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (${typeList}))
  `);
}
