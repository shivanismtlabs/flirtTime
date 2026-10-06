import type { Knex } from 'knex';

/**
 * Grant blue-check (`user_details.is_verified`) wherever a non-deleted
 * Approved verification request exists. Does not unverify users who have
 * the badge without an Approved row (may be an intentional grant).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    UPDATE user_details ud
    SET is_verified = true, updated_at = now()
    WHERE ud.is_verified = false
      AND EXISTS (
        SELECT 1 FROM request_verifications rv
        WHERE rv.user_id = ud.user_id
          AND rv.deleted_at IS NULL
          AND rv.status = 'Approved'
      )
  `);
}

export async function down(_knex: Knex): Promise<void> {
  // Irreversible data repair — badge was already true for these users.
}
