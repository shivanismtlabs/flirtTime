import type { Knex } from 'knex';

/** Membership — lean edge; fan-out reads active users only */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('conversation_participants', (table) => {
    table.bigIncrements('id').primary();

    table
      .bigInteger('conversation_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('conversations')
      .onDelete('CASCADE');

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.string('role', 16).notNullable().defaultTo('member'); // admin | member
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('joined_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('left_at', { useTz: true }).nullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE conversation_participants
      ADD CONSTRAINT conversation_participants_role_check
      CHECK (role IN ('admin', 'member'))
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX conversation_participants_pair_uidx
      ON conversation_participants (conversation_id, user_id)
  `);
  await knex.raw(`
    CREATE INDEX conversation_participants_user_active_idx
      ON conversation_participants (user_id, conversation_id)
      WHERE is_active = true
  `);
  await knex.raw(`
    CREATE INDEX conversation_participants_fanout_idx
      ON conversation_participants (conversation_id, user_id)
      WHERE is_active = true
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('conversation_participants');
}
