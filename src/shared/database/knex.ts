import knex, { type Knex } from 'knex';
import { env, getDbConnection } from '../config/index.js';
import { status } from '../logger/index.js';

let db: Knex | null = null;

export function getDb(): Knex {
  if (!db) {
    db = knex({
      client: 'pg',
      connection: getDbConnection(),
      pool: {
        min: env.DB_POOL_MIN,
        max: env.DB_POOL_MAX,
        idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
        acquireTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
      },
    });
  }

  return db;
}

/** Ping Postgres and log ✓ / ✗ status. Public UUIDs are app-generated (no DB extensions). */
export async function connectDb(): Promise<void> {
  const target = `${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;

  try {
    await getDb().raw('select 1');
    status.ok('PostgreSQL', target);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'connection failed';
    status.fail('PostgreSQL', `${target} — ${message}`);
    throw err;
  }
}

export async function destroyDb(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
    status.ok('PostgreSQL', 'pool closed');
  }
}
