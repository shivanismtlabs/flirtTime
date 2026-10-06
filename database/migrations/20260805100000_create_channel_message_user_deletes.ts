import type { Knex } from 'knex';

/**
 * Sparse delete-for-me for channel messages — ONLY when a member hides a post.
 * Composite FK matches HASH-partitioned channel_messages PK.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE channel_message_user_deletes (
      id BIGSERIAL PRIMARY KEY,
      channel_id BIGINT NOT NULL,
      message_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT channel_message_user_deletes_message_fkey
        FOREIGN KEY (channel_id, message_id)
        REFERENCES channel_messages (channel_id, id)
        ON DELETE CASCADE
    )
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX channel_message_user_deletes_pair_uidx
      ON channel_message_user_deletes (message_id, user_id)
  `);
  await knex.raw(`
    CREATE INDEX channel_message_user_deletes_user_ch_idx
      ON channel_message_user_deletes (user_id, channel_id, message_id)
  `);

  await knex.raw(`
    COMMENT ON TABLE channel_message_user_deletes IS
      'Sparse delete-for-me on channel posts — followers hide without affecting others';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('channel_message_user_deletes');
}
