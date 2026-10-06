import type { Knex } from 'knex';

/**
 * media.playback_key — HLS master playlist (destination/.../master.m3u8)
 * after process-video Lambda. Source MP4 stays in media.key.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('media', (table) => {
    table.string('playback_key', 512).nullable();
  });

  await knex.raw(`
    COMMENT ON COLUMN media.playback_key IS
      'HLS master.m3u8 key under destination/ after video Lambda; null until processed'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('media', (table) => {
    table.dropColumn('playback_key');
  });
}
