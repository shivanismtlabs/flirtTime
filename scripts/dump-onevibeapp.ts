/**
 * Dump yandexgram / onevibeapp tables to JSON for offline seeding.
 *
 *   npm run db:dump:onevibeapp
 *
 * Writes: database/seeders/onevibeapp-dump/*.json
 */
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import knex, { type Knex } from 'knex';

export const DUMP_TABLES = [
  '_users',
  '_user_details',
  '_profile_pictures',
  '_social_accounts',
  '_device_infos',
  '_notification_settings',
  '_follows',
  '_blocklists',
  '_hashtags',
  '_request_verifications',
  '_notifications',
  '_users_reports',
  'countries',
  'coin_packages',
  'gifts',
  'posts',
  'post_medias',
  'post_likes',
  'post_dislikes',
  'post_views',
  'post_shares',
  'post_comments',
  'post_comment_reactions',
  'post_gifts',
  'polls',
  'poll_options',
  'poll_votes',
  'profile_viewers',
  'help_requests',
  'user_privacy_settings',
  'follower_following_settings',
  'story_settings',
  'comment_settings',
  'message_privacy_settings',
  'wallets',
  'posts_reports',
] as const;

export function dumpDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../database/seeders/onevibeapp-dump');
}

function boolEnv(v: string | undefined, fallback = false): boolean {
  if (v == null || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function jsonSafe(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = jsonSafe(v);
    return out;
  }
  return value;
}

export async function resolveSourceSchema(db: Knex): Promise<string> {
  const forced = (process.env.SOURCE_DB_SCHEMA || '').trim();
  const found = await db.raw(
    `SELECT table_schema
     FROM information_schema.tables
     WHERE table_type = 'BASE TABLE'
       AND table_name IN ('_users', 'posts')
       AND table_schema NOT IN ('pg_catalog', 'information_schema')`,
  );
  const schemas = [...new Set((found.rows as Array<{ table_schema: string }>).map((r) => r.table_schema))];
  if (forced && schemas.includes(forced)) return forced;
  for (const schema of ['yandexgram', 'public', ...schemas]) {
    if (schemas.includes(schema)) return schema;
  }
  throw new Error('No _users/posts tables found. Check SOURCE_DB_NAME / SOURCE_DB_SCHEMA.');
}

async function main() {
  const host = process.env.SOURCE_DB_HOST ?? process.env.DB_HOST ?? '127.0.0.1';
  const port = Number(process.env.SOURCE_DB_PORT ?? process.env.DB_PORT ?? 5432);
  const user = process.env.SOURCE_DB_USER ?? process.env.DB_USER;
  const password = process.env.SOURCE_DB_PASSWORD ?? process.env.DB_PASSWORD;
  const database = process.env.SOURCE_DB_NAME || 'onevibeapp';
  const ssl = boolEnv(process.env.SOURCE_DB_SSL ?? process.env.DB_SSL, false)
    ? { rejectUnauthorized: false }
    : undefined;
  if (!user || !password) throw new Error('SOURCE_DB_USER / SOURCE_DB_PASSWORD required');

  const db = knex({ client: 'pg', connection: { host, port, user, password, database, ssl } });
  const outDir = dumpDir();
  await mkdir(outDir, { recursive: true });

  try {
    const schema = await resolveSourceSchema(db);
    console.log(`Dumping ${database}.${schema} → ${outDir}`);
    const counts: Record<string, number> = {};

    for (const table of DUMP_TABLES) {
      const exists = await db.raw(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = ? AND table_name = ?
         ) AS present`,
        [schema, table],
      );
      if (!exists.rows[0]?.present) {
        await writeFile(join(outDir, `${table}.json`), '[]\n', 'utf8');
        counts[table] = 0;
        console.log(`  ${table}: missing (empty file)`);
        continue;
      }
      const rows = await db.withSchema(schema).from(table).select('*');
      const payload = jsonSafe(rows);
      await writeFile(join(outDir, `${table}.json`), `${JSON.stringify(payload)}\n`, 'utf8');
      counts[table] = rows.length;
      console.log(`  ${table}: ${rows.length}`);
    }

    await writeFile(
      join(outDir, 'manifest.json'),
      `${JSON.stringify({ schema, database, exportedAt: new Date().toISOString(), counts }, null, 2)}\n`,
      'utf8',
    );
    console.log('Dump complete.');
  } finally {
    await db.destroy();
  }
}

const isMain = process.argv[1]?.includes('dump-onevibeapp');
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
