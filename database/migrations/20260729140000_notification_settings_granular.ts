import type { Knex } from 'knex';

/**
 * Expand notification_settings to legacy Linkgram-compatible granular prefs.
 * Keeps coarse columns (push_enabled, likes_enabled, …) for backward compat.
 */
const GRANULAR_COLUMNS: Array<{ name: string; default: boolean }> = [
  { name: 'notification', default: true },
  { name: 'like_post', default: true },
  { name: 'comment_post', default: true },
  { name: 'share_post', default: false },
  { name: 'dislike_post', default: true },
  { name: 'gift_post', default: true },
  { name: 'like_reel', default: true },
  { name: 'comment_reel', default: true },
  { name: 'share_reel', default: false },
  { name: 'dislike_reel', default: true },
  { name: 'gift_reel', default: true },
  { name: 'like_vibe', default: true },
  { name: 'comment_vibe', default: true },
  { name: 'share_vibe', default: false },
  { name: 'dislike_vibe', default: true },
  { name: 'gift_vibe', default: true },
  { name: 'poll_vibe', default: true },
  { name: 'like_story', default: true },
  { name: 'message_story', default: true },
  { name: 'share_story', default: false },
  { name: 'post_from_follower', default: true },
  { name: 'follow_request', default: true },
  { name: 'msg_show_notifications', default: true },
  { name: 'msg_show_likes', default: true },
  { name: 'msg_show_comments', default: true },
  { name: 'group_show_notifications', default: true },
  { name: 'channel_show_notifications', default: true },
  { name: 'in_app_notifications', default: true },
  { name: 'show_preview', default: true },
  { name: 'new_chat_message', default: true },
];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('notification_settings', (table) => {
    for (const col of GRANULAR_COLUMNS) {
      table.boolean(col.name).notNullable().defaultTo(col.default);
    }
  });

  // Backfill existing rows from coarse prefs
  await knex.raw(`
    UPDATE notification_settings SET
      notification = push_enabled,
      like_post = likes_enabled,
      like_reel = likes_enabled,
      like_story = likes_enabled,
      like_vibe = likes_enabled,
      comment_post = comments_enabled,
      comment_reel = comments_enabled,
      comment_vibe = comments_enabled,
      follow_request = follows_enabled,
      gift_post = COALESCE(gifts_enabled, true),
      gift_reel = COALESCE(gifts_enabled, true),
      gift_vibe = COALESCE(gifts_enabled, true),
      in_app_notifications = push_enabled,
      new_chat_message = push_enabled,
      msg_show_notifications = push_enabled,
      group_show_notifications = push_enabled,
      channel_show_notifications = push_enabled
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('notification_settings', (table) => {
    for (const col of GRANULAR_COLUMNS) {
      table.dropColumn(col.name);
    }
  });
}
