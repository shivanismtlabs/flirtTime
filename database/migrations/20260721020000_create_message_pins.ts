import type { Knex } from 'knex';

/**
 * One pinned message per conversation (WhatsApp-style).
 * Composite FK matches HASH-partitioned messages PK.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE message_pins (
      id BIGSERIAL PRIMARY KEY,
      conversation_id BIGINT NOT NULL
        REFERENCES conversations(id) ON DELETE CASCADE,
      message_id BIGINT NOT NULL,
      pinned_by BIGINT NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT message_pins_message_fkey
        FOREIGN KEY (conversation_id, message_id)
        REFERENCES messages (conversation_id, id)
        ON DELETE CASCADE,
      CONSTRAINT message_pins_conversation_uidx UNIQUE (conversation_id)
    )
  `);

  await knex.raw(`
    CREATE INDEX message_pins_message_idx
      ON message_pins (conversation_id, message_id)
  `);

  await knex.raw(`
    COMMENT ON TABLE message_pins IS
      'At most one pinned message per conversation'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('message_pins');
}
