import type { Knex } from 'knex';

/**
 * Retarget admin audit FKs from `users` → `admins`
 * (staff accounts are separate from app users).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE payment_settings
      DROP CONSTRAINT IF EXISTS payment_settings_updated_by_foreign
  `);
  await knex.raw(`
    UPDATE payment_settings SET updated_by = NULL WHERE updated_by IS NOT NULL
  `);
  await knex.raw(`
    ALTER TABLE payment_settings
      ADD CONSTRAINT payment_settings_updated_by_foreign
      FOREIGN KEY (updated_by) REFERENCES admins(id) ON DELETE SET NULL
  `);

  await knex.raw(`
    ALTER TABLE wallet_withdrawals
      DROP CONSTRAINT IF EXISTS wallet_withdrawals_processed_by_foreign
  `);
  await knex.raw(`
    UPDATE wallet_withdrawals SET processed_by = NULL WHERE processed_by IS NOT NULL
  `);
  await knex.raw(`
    ALTER TABLE wallet_withdrawals
      ADD CONSTRAINT wallet_withdrawals_processed_by_foreign
      FOREIGN KEY (processed_by) REFERENCES admins(id) ON DELETE SET NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE payment_settings
      DROP CONSTRAINT IF EXISTS payment_settings_updated_by_foreign
  `);
  await knex.raw(`
    UPDATE payment_settings SET updated_by = NULL WHERE updated_by IS NOT NULL
  `);
  await knex.raw(`
    ALTER TABLE payment_settings
      ADD CONSTRAINT payment_settings_updated_by_foreign
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
  `);

  await knex.raw(`
    ALTER TABLE wallet_withdrawals
      DROP CONSTRAINT IF EXISTS wallet_withdrawals_processed_by_foreign
  `);
  await knex.raw(`
    UPDATE wallet_withdrawals SET processed_by = NULL WHERE processed_by IS NOT NULL
  `);
  await knex.raw(`
    ALTER TABLE wallet_withdrawals
      ADD CONSTRAINT wallet_withdrawals_processed_by_foreign
      FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL
  `);
}
