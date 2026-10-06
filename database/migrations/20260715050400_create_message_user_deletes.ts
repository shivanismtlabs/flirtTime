import type { Knex } from 'knex';

/**
 * Sparse delete-for-me — ONLY when user hides a message
 * Composite FK matches partitioned messages PK
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE message_user_deletes (
      id BIGSERIAL PRIMARY KEY,
      conversation_id BIGINT NOT NULL,
      message_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT message_user_deletes_message_fkey
        FOREIGN KEY (conversation_id, message_id)
        REFERENCES messages (conversation_id, id)
        ON DELETE CASCADE
    )
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX message_user_deletes_pair_uidx
      ON message_user_deletes (message_id, user_id)
  `);
  await knex.raw(`
    CREATE INDEX message_user_deletes_user_conv_idx
      ON message_user_deletes (user_id, conversation_id, message_id)
  `);

  await knex.raw(`
    COMMENT ON TABLE message_user_deletes IS
      '100M sparse delete-for-me — never write on ordinary send';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('message_user_deletes');
}
