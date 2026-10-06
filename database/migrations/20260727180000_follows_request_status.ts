import type { Knex } from 'knex';

/**
 * Instagram-style follow requests:
 * - status: `follow` (accepted) | `requested` (pending private follow)
 * - Counts / feed / isFollowing use `status = 'follow'` only
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('follows', (table) => {
    table.string('status', 16).notNullable().defaultTo('follow');
    table.timestamp('requested_at', { useTz: true }).nullable();
    table.timestamp('followed_at', { useTz: true }).nullable();
  });

  await knex('follows')
    .whereNull('deleted_at')
    .update({
      status: 'follow',
      followed_at: knex.raw('COALESCE(followed_at, created_at)'),
    });

  await knex.raw(`
    ALTER TABLE follows
      ADD CONSTRAINT follows_status_check
      CHECK (status IN ('follow', 'requested'))
  `);

  await knex.raw(`
    CREATE INDEX follows_incoming_requested_idx
      ON follows (following_id, requested_at DESC)
      WHERE deleted_at IS NULL AND status = 'requested'
  `);

  await knex.raw(`
    CREATE INDEX follows_accepted_pair_idx
      ON follows (follower_id, following_id)
      WHERE deleted_at IS NULL AND status = 'follow'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS follows_accepted_pair_idx`);
  await knex.raw(`DROP INDEX IF EXISTS follows_incoming_requested_idx`);
  await knex.raw(`ALTER TABLE follows DROP CONSTRAINT IF EXISTS follows_status_check`);
  await knex.schema.alterTable('follows', (table) => {
    table.dropColumn('status');
    table.dropColumn('requested_at');
    table.dropColumn('followed_at');
  });
}
