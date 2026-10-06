import type { Knex } from 'knex';
import 'dotenv/config';

function dbConnection(): Knex.StaticConnectionConfig {
  const ssl =
    ['1', 'true', 'yes', 'on'].includes(String(process.env.DB_SSL ?? 'false').toLowerCase())
      ? { rejectUnauthorized: false }
      : undefined;

  return {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl,
  };
}

const shared: Knex.Config = {
  client: 'pg',
  connection: dbConnection(),
  pool: {
    min: Number(process.env.DB_POOL_MIN ?? 2),
    max: Number(process.env.DB_POOL_MAX ?? 20),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30_000),
    acquireTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 10_000),
  },
  migrations: {
    directory: './database/migrations',
    extension: 'ts',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './database/seeds',
    extension: 'ts',
  },
};

const config: Record<string, Knex.Config> = {
  development: { ...shared },
  staging: { ...shared },
  production: {
    ...shared,
    pool: {
      min: Number(process.env.DB_POOL_MIN ?? 5),
      max: Number(process.env.DB_POOL_MAX ?? 50),
      idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30_000),
      acquireTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 10_000),
    },
  },
};

export default config;
