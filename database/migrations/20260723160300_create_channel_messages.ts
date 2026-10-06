import type { Knex } from 'knex';

/**
 * channel_messages — HASH partitioned by channel_id (32 parts)
 * Admin/owner posts only (enforced in app before insert)
 * Soft reply_to (no FK) — faster inserts
 * Soft delete for admin moderation
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE SEQUENCE IF NOT EXISTS channel_messages_id_seq`);

  await knex.raw(`
    CREATE TABLE channel_messages (
      id BIGINT NOT NULL DEFAULT nextval('channel_messages_id_seq'),
      uuid UUID NOT NULL,
      channel_id BIGINT NOT NULL
        REFERENCES channels(id) ON DELETE CASCADE,
      sender_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(32) NOT NULL DEFAULT 'text',
      body TEXT NULL,
      reply_to_id BIGINT NULL,
      client_message_id VARCHAR(64) NULL,
      is_edited BOOLEAN NOT NULL DEFAULT false,
      edited_at TIMESTAMPTZ NULL,
      deleted_at TIMESTAMPTZ NULL,
      deleted_by BIGINT NULL
        REFERENCES users(id) ON DELETE SET NULL,
      meta JSONB NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (channel_id, id)
    ) PARTITION BY HASH (channel_id)
  `);

  for (let i = 0; i < 32; i += 1) {
    await knex.raw(`
      CREATE TABLE channel_messages_p${i}
        PARTITION OF channel_messages
        FOR VALUES WITH (MODULUS 32, REMAINDER ${i})
    `);
  }

  await knex.raw(`ALTER SEQUENCE channel_messages_id_seq OWNED BY channel_messages.id`);

  await knex.raw(`
    CREATE INDEX channel_messages_uuid_idx
      ON channel_messages (uuid)
  `);
  await knex.raw(`
    CREATE INDEX channel_messages_keyset_idx
      ON channel_messages (channel_id, id DESC)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX channel_messages_client_id_uidx
      ON channel_messages (channel_id, sender_id, client_message_id)
      WHERE client_message_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE INDEX channel_messages_sender_idx
      ON channel_messages (channel_id, sender_id, id DESC)
      WHERE deleted_at IS NULL
  `);

  await knex.raw(`
    COMMENT ON TABLE channel_messages IS
      '50M channel posts — HASH(channel_id) x32; owner/admin write only';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS channel_messages CASCADE`);
  await knex.raw(`DROP SEQUENCE IF EXISTS channel_messages_id_seq`);
}
