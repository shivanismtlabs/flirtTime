import type { Knex } from 'knex';

/**
 * Toggles that exist as notification types (or call/visit) but were missing
 * from notification_settings / the settings API.
 */
const COLUMNS: Array<{ name: string; default: boolean }> = [
  { name: 'mention_post', default: true },
  { name: 'mention_reel', default: true },
  { name: 'mention_vibe', default: true },
  { name: 'save_post', default: true },
  { name: 'save_reel', default: true },
  { name: 'save_vibe', default: true },
  { name: 'follow', default: true },
  { name: 'follow_accepted', default: true },
  { name: 'coin_received', default: true },
  { name: 'coin_sent', default: true },
  { name: 'incoming_call', default: true },
  { name: 'profile_visit', default: true },
  { name: 'admin', default: true },
];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('notification_settings', (table) => {
    for (const col of COLUMNS) {
      table.boolean(col.name).notNullable().defaultTo(col.default);
    }
  });

  await knex.raw(`
    UPDATE notification_settings SET
      mention_post = COALESCE(mentions_enabled, true),
      mention_reel = COALESCE(mentions_enabled, true),
      mention_vibe = COALESCE(mentions_enabled, true),
      follow = COALESCE(follows_enabled, true),
      follow_accepted = COALESCE(follows_enabled, true),
      coin_received = COALESCE(wallet_enabled, true),
      coin_sent = COALESCE(wallet_enabled, true),
      admin = COALESCE(admin_enabled, true)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('notification_settings', (table) => {
    for (const col of COLUMNS) {
      table.dropColumn(col.name);
    }
  });
}
