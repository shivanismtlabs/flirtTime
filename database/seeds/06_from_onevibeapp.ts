/**
 * Seed dest `onevibe` (DB_*) from JSON dump files.
 *
 *   npm run db:seed:onevibeapp
 *   npm run db:seed:onevibeapp -- --no-fresh
 *
 * Source: database/seeders/onevibeapp-dump/*.json
 * Default is --fresh (wipes dest user data first).
 *
 * Local only (needs onevibeapp DB): npm run db:seed:onevibeapp -- --from-db
 * Skipped during plain `npm run db:seed` so catalog seeds stay safe.
 */
import type { Knex } from 'knex';
import { runOnevibeappSync } from '../../scripts/sync-from-onevibeapp.ts';

function isExplicitlyRequested(): boolean {
  return (
    process.env.SEED_FROM_ONEVIBEAPP === '1' ||
    process.argv.some((arg) => arg.includes('06_from_onevibeapp'))
  );
}

export async function seed(knex: Knex): Promise<void> {
  if (!isExplicitlyRequested()) {
    console.log('Skipping onevibeapp import — run npm run db:seed:onevibeapp');
    return;
  }
  const fresh = !process.argv.includes('--no-fresh');
  const fromDb = process.argv.includes('--from-db');
  await runOnevibeappSync({ dest: knex, fromDb, fresh });
}
