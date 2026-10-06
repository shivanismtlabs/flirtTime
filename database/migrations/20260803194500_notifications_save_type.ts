import type { Knex } from 'knex';

/** Allow notifications.type = save (bookmark). */
const TYPES = [
  'like',
  'comment',
  'follow',
  'follow_request',
  'follow_accepted',
  'mention',
  'gift',
  'share',
  'save',
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
    .where({ type: 'save' })
    .update({ type: 'system' });

  await knex.raw(
    `ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check`,
  );
  const legacy = TYPES.filter((t) => t !== 'save');
  const typeList = legacy.map((t) => `'${t}'`).join(', ');
  await knex.raw(`
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (${typeList}))
  `);
}
