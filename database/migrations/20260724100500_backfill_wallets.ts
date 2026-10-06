import type { Knex } from 'knex';

/**
 * Backfill empty wallets for existing active users (available=0, earned=0).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    INSERT INTO wallets (uuid, user_id, available_coins, earned_coins, currency, created_at, updated_at)
    SELECT gen_random_uuid(), u.id, 0, 0, 'coin', NOW(), NOW()
    FROM users u
    WHERE u.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM wallets w
        WHERE w.user_id = u.id
          AND w.deleted_at IS NULL
      )
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Keep wallets created by backfill — safe no-op (cannot distinguish seed vs later creates).
}
