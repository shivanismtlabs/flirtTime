import type { Knex } from 'knex';

/** Per-user saved translation of a chat message (one row per user+message). */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('message_translations', (table) => {
    table.bigIncrements('id').primary();

    table
      .bigInteger('conversation_id')
      .unsigned()
      .notNullable();

    table
      .bigInteger('message_id')
      .unsigned()
      .notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.string('target_language', 16).notNullable();
    table.string('source_language', 16).nullable();
    table.text('translated_text').notNullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['message_id', 'user_id'], {
      indexName: 'message_translations_message_user_uidx',
    });
    table.index(['conversation_id', 'user_id'], 'message_translations_conv_user_idx');
  });

  await knex.raw(`
    ALTER TABLE message_translations
      ADD CONSTRAINT message_translations_message_fkey
      FOREIGN KEY (conversation_id, message_id)
      REFERENCES messages (conversation_id, id)
      ON DELETE CASCADE
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('message_translations');
}
