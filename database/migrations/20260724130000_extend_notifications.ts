import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';

/**
 * Extend notifications for typed inbox + admin broadcast.
 * - title / icon / image_url / link columns
 * - CHECK constraint for known types (message kept for legacy, excluded from inbox API)
 * - Admin RBAC: notifications.send / notifications.read
 */

const INBOX_TYPES = [
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
  'message', // legacy / not shown in inbox list
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('notifications', (table) => {
    table.string('title', 160).nullable();
    table.string('icon', 64).nullable();
    table.text('image_url').nullable();
    table.string('link', 512).nullable();
  });

  // Normalize any unknown types before adding CHECK
  await knex('notifications')
    .whereNotIn('type', [...INBOX_TYPES])
    .update({ type: 'system' });

  const typeList = INBOX_TYPES.map((t) => `'${t}'`).join(', ');
  await knex.raw(`
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (${typeList}))
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS notifications_user_type_idx
      ON notifications (user_id, type, created_at DESC)
      WHERE deleted_at IS NULL
  `);

  await knex.schema.alterTable('notification_settings', (table) => {
    table.boolean('gifts_enabled').notNullable().defaultTo(true);
    table.boolean('wallet_enabled').notNullable().defaultTo(true);
    table.boolean('admin_enabled').notNullable().defaultTo(true);
  });

  // Admin permissions (idempotent)
  const perms = [
    {
      key: 'notifications.send',
      name: 'Send notifications',
      description: 'Broadcast or target push/in-app notifications to users',
      group: 'notifications',
    },
    {
      key: 'notifications.read',
      name: 'View notification admin',
      description: 'Read notification admin capabilities',
      group: 'notifications',
    },
  ];

  for (const p of perms) {
    const existing = await knex('admin_permissions').where({ key: p.key }).first('id');
    if (existing) continue;
    const [row] = await knex('admin_permissions')
      .insert({
        uuid: randomUUID(),
        key: p.key,
        name: p.name,
        description: p.description,
        group_key: p.group,
      })
      .returning('id');

    const superAdmin = await knex('admin_roles').where({ key: 'super_admin' }).first('id');
    if (superAdmin && row?.id) {
      const linked = await knex('admin_role_permissions')
        .where({ role_id: superAdmin.id, permission_id: row.id })
        .first('id');
      if (!linked) {
        await knex('admin_role_permissions').insert({
          role_id: superAdmin.id,
          permission_id: row.id,
        });
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS notifications_user_type_idx`);
  await knex.raw(
    `ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check`,
  );

  await knex.schema.alterTable('notifications', (table) => {
    table.dropColumn('title');
    table.dropColumn('icon');
    table.dropColumn('image_url');
    table.dropColumn('link');
  });

  await knex.schema.alterTable('notification_settings', (table) => {
    table.dropColumn('gifts_enabled');
    table.dropColumn('wallet_enabled');
    table.dropColumn('admin_enabled');
  });

  const keys = ['notifications.send', 'notifications.read'];
  const rows = await knex('admin_permissions').whereIn('key', keys).select('id');
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    await knex('admin_role_permissions').whereIn('permission_id', ids).del();
    await knex('admin_permissions').whereIn('id', ids).del();
  }
}
