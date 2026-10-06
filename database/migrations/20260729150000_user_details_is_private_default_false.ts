import type { Knex } from 'knex';

/**
 * New registrations should be public by default (Linkgram / product default).
 * Does not change existing users' privacy settings.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE user_details
    ALTER COLUMN is_private SET DEFAULT false
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE user_details
    ALTER COLUMN is_private SET DEFAULT true
  `);
}
