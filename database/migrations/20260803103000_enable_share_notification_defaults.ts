import type { Knex } from 'knex';

/**
 * Share notifications were gated behind share_* prefs that defaulted to false,
 * so owners never got "X shared your vibe/post" unless they toggled each flag.
 * Align defaults with other engagement prefs (likes/comments) and opt-in on.
 */
const SHARE_COLUMNS = [
  'share_post',
  'share_reel',
  'share_vibe',
  'share_story',
] as const;

export async function up(knex: Knex): Promise<void> {
  for (const col of SHARE_COLUMNS) {
    await knex.raw(
      `ALTER TABLE notification_settings ALTER COLUMN ${col} SET DEFAULT true`,
    );
  }

  await knex('notification_settings').update({
    share_post: true,
    share_reel: true,
    share_vibe: true,
    share_story: true,
  });
}

export async function down(knex: Knex): Promise<void> {
  for (const col of SHARE_COLUMNS) {
    await knex.raw(
      `ALTER TABLE notification_settings ALTER COLUMN ${col} SET DEFAULT false`,
    );
  }
}
