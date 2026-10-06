import type { Knex } from 'knex';

/**
 * Chat polls — scale for large vote tables:
 * - Summary counts on poll/options (BIGINT)
 * - Votes append-only; list path never loads voters
 * - Composite FK to HASH-partitioned messages
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE chat_polls (
      id BIGSERIAL PRIMARY KEY,
      uuid UUID NOT NULL,
      conversation_id BIGINT NOT NULL,
      message_id BIGINT NOT NULL,
      question TEXT NOT NULL,
      allow_multiple BOOLEAN NOT NULL DEFAULT false,
      is_anonymous BOOLEAN NOT NULL DEFAULT false,
      closes_at TIMESTAMPTZ NULL,
      is_closed BOOLEAN NOT NULL DEFAULT false,
      total_votes BIGINT NOT NULL DEFAULT 0,
      version INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT chat_polls_message_fkey
        FOREIGN KEY (conversation_id, message_id)
        REFERENCES messages (conversation_id, id)
        ON DELETE CASCADE,
      CONSTRAINT chat_polls_message_uidx UNIQUE (conversation_id, message_id)
    )
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX chat_polls_uuid_uidx ON chat_polls (uuid)
  `);
  await knex.raw(`
    CREATE INDEX chat_polls_conversation_idx
      ON chat_polls (conversation_id, created_at DESC)
  `);

  await knex.raw(`
    CREATE TABLE chat_poll_options (
      id BIGSERIAL PRIMARY KEY,
      uuid UUID NOT NULL,
      poll_id BIGINT NOT NULL
        REFERENCES chat_polls(id) ON DELETE CASCADE,
      option_text VARCHAR(100) NOT NULL,
      position INT NOT NULL DEFAULT 0,
      votes_count BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT chat_poll_options_poll_position_uidx UNIQUE (poll_id, position)
    )
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX chat_poll_options_uuid_uidx ON chat_poll_options (uuid)
  `);
  await knex.raw(`
    CREATE INDEX chat_poll_options_poll_idx
      ON chat_poll_options (poll_id, position)
  `);

  await knex.raw(`
    CREATE TABLE chat_poll_votes (
      id BIGSERIAL PRIMARY KEY,
      poll_id BIGINT NOT NULL
        REFERENCES chat_polls(id) ON DELETE CASCADE,
      option_id BIGINT NOT NULL
        REFERENCES chat_poll_options(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT chat_poll_votes_unique_option UNIQUE (poll_id, option_id, user_id)
    )
  `);

  await knex.raw(`
    CREATE INDEX chat_poll_votes_poll_user_idx
      ON chat_poll_votes (poll_id, user_id)
  `);
  await knex.raw(`
    CREATE INDEX chat_poll_votes_option_created_idx
      ON chat_poll_votes (option_id, created_at DESC, id DESC)
  `);

  await knex.raw(`
    COMMENT ON TABLE chat_polls IS
      'Chat poll summary; votes live in chat_poll_votes; list APIs use counts only';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('chat_poll_votes');
  await knex.schema.dropTableIfExists('chat_poll_options');
  await knex.schema.dropTableIfExists('chat_polls');
}
