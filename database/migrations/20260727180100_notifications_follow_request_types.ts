import type { Knex } from 'knex';

/** Add follow_request + follow_accepted notification types. */
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
    .whereIn('type', ['follow_request', 'follow_accepted'])
    .update({ type: 'follow' });

  await knex.raw(
    `ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check`,
  );
  const legacy = [
    'like',
    'comment',
    'follow',
    'mention',
    'gift',
    'share',
    'coin_sent',
    'coin_received',
    'system',
    'admin',
    'message',
  ];
  const typeList = legacy.map((t) => `'${t}'`).join(', ');
  await knex.raw(`
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (${typeList}))
  `);
}
