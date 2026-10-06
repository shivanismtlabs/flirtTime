import type { Knex } from 'knex';

/**
 * device_infos — add stable device_id (upsert key), voip + IP for Linkgram parity.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('device_infos', (table) => {
    table.string('device_id', 255).nullable();
    table.text('voip_token').nullable();
    table.string('ip_address', 64).nullable();
  });

  await knex.raw(`
    CREATE UNIQUE INDEX device_infos_device_id_active_uidx
      ON device_infos (device_id)
      WHERE deleted_at IS NULL AND device_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS device_infos_device_id_active_uidx`);
  await knex.schema.alterTable('device_infos', (table) => {
    table.dropColumn('device_id');
    table.dropColumn('voip_token');
    table.dropColumn('ip_address');
  });
}
