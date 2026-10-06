import type { Knex } from 'knex';

/**
 * Other Post Activity (`share_post`) and Other Vibe Activity (`share_vibe`)
 * should be off for newly registered users. Do not rewrite existing rows.
 */
const COLUMNS = ['share_post', 'share_vibe'] as const;

export async function up(knex: Knex): Promise<void> {
  for (const col of COLUMNS) {
    await knex.raw(
      `ALTER TABLE notification_settings ALTER COLUMN ${col} SET DEFAULT false`,
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const col of COLUMNS) {
    await knex.raw(
      `ALTER TABLE notification_settings ALTER COLUMN ${col} SET DEFAULT true`,
    );
  }
}
