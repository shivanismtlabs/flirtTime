import type { Knex } from 'knex';

/**
 * messages — 100M: HASH partitioned by conversation_id (32 parts)
 * Why: thread queries stay on one partition
 * PK (conversation_id, id) — partition compatible
 * Soft reply_to (no FK) — faster inserts
 * No per-message status rows — use conversation_settings
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE SEQUENCE IF NOT EXISTS messages_id_seq`);

  await knex.raw(`
    CREATE TABLE messages (
      id BIGINT NOT NULL DEFAULT nextval('messages_id_seq'),
      uuid UUID NOT NULL,
      conversation_id BIGINT NOT NULL
        REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(32) NOT NULL DEFAULT 'text',
      body TEXT NULL,
      reply_to_id BIGINT NULL,
      client_message_id VARCHAR(64) NULL,
      is_edited BOOLEAN NOT NULL DEFAULT false,
      edited_at TIMESTAMPTZ NULL,
      deleted_for_everyone_at TIMESTAMPTZ NULL,
      meta JSONB NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (conversation_id, id)
    ) PARTITION BY HASH (conversation_id)
  `);

  for (let i = 0; i < 32; i += 1) {
    await knex.raw(`
      CREATE TABLE messages_p${i}
        PARTITION OF messages
        FOR VALUES WITH (MODULUS 32, REMAINDER ${i})
    `);
  }

  await knex.raw(`ALTER SEQUENCE messages_id_seq OWNED BY messages.id`);

  await knex.raw(`
    CREATE INDEX messages_uuid_idx
      ON messages (uuid)
  `);
  await knex.raw(`
    CREATE INDEX messages_keyset_idx
      ON messages (conversation_id, id DESC)
      WHERE deleted_for_everyone_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX messages_client_id_uidx
      ON messages (conversation_id, sender_id, client_message_id)
      WHERE client_message_id IS NOT NULL
  `);

  await knex.raw(`
    COMMENT ON TABLE messages IS
      '100M messages — HASH(conversation_id) x32; keyset (conversation_id, id DESC)';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS messages CASCADE`);
  await knex.raw(`DROP SEQUENCE IF EXISTS messages_id_seq`);
}
