import type { Knex } from 'knex';

/** Attachments — composite FK to HASH-partitioned messages */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE message_medias (
      id BIGSERIAL PRIMARY KEY,
      uuid UUID NOT NULL,
      conversation_id BIGINT NOT NULL,
      message_id BIGINT NOT NULL,
      media_id BIGINT NULL
        REFERENCES media(id) ON DELETE SET NULL,
      kind VARCHAR(16) NOT NULL,
      file_path TEXT NOT NULL,
      thumbnail_path TEXT NULL,
      file_name VARCHAR(255) NULL,
      mime_type VARCHAR(128) NULL,
      size_bytes BIGINT NULL,
      duration_ms INT NULL,
      width INT NULL,
      height INT NULL,
      position INT NOT NULL DEFAULT 0,
      meta JSONB NULL,
      deleted_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT message_medias_kind_check
        CHECK (kind IN ('image', 'video', 'audio', 'voice', 'file')),
      CONSTRAINT message_medias_message_fkey
        FOREIGN KEY (conversation_id, message_id)
        REFERENCES messages (conversation_id, id)
        ON DELETE CASCADE
    )
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX message_medias_uuid_active_uidx
      ON message_medias (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX message_medias_message_idx
      ON message_medias (conversation_id, message_id, position)
      WHERE deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('message_medias');
}
