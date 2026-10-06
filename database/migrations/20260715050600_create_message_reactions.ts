import type { Knex } from 'knex';

/** One emoji per user per message */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE message_reactions (
      id BIGSERIAL PRIMARY KEY,
      conversation_id BIGINT NOT NULL,
      message_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      emoji VARCHAR(32) NOT NULL,
      deleted_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT message_reactions_message_fkey
        FOREIGN KEY (conversation_id, message_id)
        REFERENCES messages (conversation_id, id)
        ON DELETE CASCADE
    )
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX message_reactions_pair_active_uidx
      ON message_reactions (conversation_id, message_id, user_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX message_reactions_message_idx
      ON message_reactions (conversation_id, message_id)
      WHERE deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('message_reactions');
}
