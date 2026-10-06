/**
 * Seed `onevibe` (DB_*) from JSON dump (default) or live onevibeapp DB.
 *
 * Live / servers (JSON files in database/seeders/onevibeapp-dump):
 *   npm run db:seed:onevibeapp
 *   npm run db:sync:onevibeapp -- --fresh
 *
 * Local machine that HAS onevibeapp DB:
 *   npm run db:dump:onevibeapp
 *   npm run db:seed:onevibeapp -- --from-db
 *
 * Dest: DB_* (public). JSON source: database/seeders/onevibeapp-dump/*.json
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import knex, { type Knex } from 'knex';
import { dumpDir, resolveSourceSchema } from './dump-onevibeapp.ts';

const BATCH = 200;
const dumpCache = new Map<string, Record<string, unknown>[]>();

type SourceKind = 'json' | 'db';
let sourceKind: SourceKind = 'json';
let sourceSchemaName = 'public';
let liveSource: Knex | null = null;

type IdMap = Map<string, string>;

function boolEnv(v: string | undefined, fallback = false): boolean {
  if (v == null || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function pgConnection() {
  const host = process.env.DB_HOST ?? '127.0.0.1';
  const port = Number(process.env.DB_PORT ?? 5432);
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;
  const ssl = boolEnv(process.env.DB_SSL, false) ? { rejectUnauthorized: false } : undefined;
  if (!user || !password || !database) {
    throw new Error('DB_USER / DB_PASSWORD / DB_NAME required');
  }
  return { host, port, user, password, database, ssl };
}

function makeKnex(connection: ReturnType<typeof pgConnection>): Knex {
  return knex({
    client: 'pg',
    connection,
    pool: { min: 1, max: 10 },
  });
}

async function loadDump(table: string): Promise<Record<string, unknown>[]> {
  const cached = dumpCache.get(table);
  if (cached) return cached;
  const file = join(dumpDir(), `${table}.json`);
  try {
    const rows = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>[];
    dumpCache.set(table, Array.isArray(rows) ? rows : []);
  } catch {
    dumpCache.set(table, []);
  }
  return dumpCache.get(table)!;
}

function sortRows(
  rows: Record<string, unknown>[],
  col: string,
  dir = 'asc',
): Record<string, unknown>[] {
  const mul = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a[col];
    const bv = b[col];
    if (av == null && bv == null) return 0;
    if (av == null) return -1 * mul;
    if (bv == null) return 1 * mul;
    if (String(av) < String(bv)) return -1 * mul;
    if (String(av) > String(bv)) return 1 * mul;
    return 0;
  });
}

function sourceDbConnection() {
  const host = process.env.SOURCE_DB_HOST ?? process.env.DB_HOST ?? '127.0.0.1';
  const port = Number(process.env.SOURCE_DB_PORT ?? process.env.DB_PORT ?? 5432);
  const user = process.env.SOURCE_DB_USER ?? process.env.DB_USER;
  const password = process.env.SOURCE_DB_PASSWORD ?? process.env.DB_PASSWORD;
  const database = process.env.SOURCE_DB_NAME || 'onevibeapp';
  const ssl = boolEnv(process.env.SOURCE_DB_SSL ?? process.env.DB_SSL, false)
    ? { rejectUnauthorized: false }
    : undefined;
  if (!user || !password) {
    throw new Error('SOURCE_DB_USER / SOURCE_DB_PASSWORD required for live onevibeapp seed');
  }
  return { host, port, user, password, database, ssl };
}

/** Drop-in for knex source queries — live onevibeapp DB or dump JSON. */
function src(db: Knex, table: string) {
  if (sourceKind === 'db') {
    return db.withSchema(sourceSchemaName).from(table);
  }
  const run = async (orderCol?: string, orderDir?: string) => {
    let rows = await loadDump(table);
    if (orderCol) rows = sortRows(rows, orderCol, orderDir);
    return rows;
  };
  const thenable = (orderCol?: string, orderDir?: string) => ({
    orderBy(col: string, dir = 'asc') {
      return thenable(col, dir);
    },
    then(
      resolve: (value: Record<string, unknown>[]) => unknown,
      reject?: (reason: unknown) => unknown,
    ) {
      return run(orderCol, orderDir).then(resolve, reject);
    },
  });
  return {
    select(..._cols: string[]) {
      return thenable();
    },
  };
}

async function dumpHas(table: string): Promise<boolean> {
  if (sourceKind === 'db') {
    const db = liveSource;
    if (!db) return false;
    return tableExists(db, sourceSchemaName, table);
  }
  const rows = await loadDump(table);
  return rows.length > 0;
}

async function assertDumpPresent(): Promise<void> {
  const users = await loadDump('_users');
  const posts = await loadDump('posts');
  if (!users.length && !posts.length) {
    throw new Error(
      `Dump missing or empty in ${dumpDir()}\n` +
        `On a machine that HAS onevibeapp, refresh files:\n` +
        `  npm run db:dump:onevibeapp\n` +
        `Copy database/seeders/onevibeapp-dump/ to this server, then:\n` +
        `  npm run db:seed:onevibeapp`,
    );
  }
  console.log(`Dump: ${dumpDir()} (_users=${users.length}, posts=${posts.length})`);
}

async function assertLiveSource(source: Knex, database: string, schema: string): Promise<void> {
  const hasUsers = await tableExists(source, schema, '_users');
  const hasPosts = await tableExists(source, schema, 'posts');
  if (!hasUsers && !hasPosts) {
    throw new Error(
      `Source "${database}.${schema}" has no _users/posts tables.\n` +
        `Set SOURCE_DB_NAME=onevibeapp and SOURCE_DB_SCHEMA=yandexgram`,
    );
  }
  const countTable = async (table: string, exists: boolean): Promise<number> => {
    if (!exists) return 0;
    const row = (await source.withSchema(schema).from(table).count('* as count').first()) as
      | { count?: string }
      | undefined;
    return Number(row?.count ?? 0);
  };
  const users = await countTable('_users', hasUsers);
  const posts = await countTable('posts', hasPosts);
  console.log(`Source: ${database}.${schema} (_users=${users}, posts=${posts})`);
}

function asId(v: unknown): string {
  return String(v);
}

function clip(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function requiredClip(v: unknown, max: number, fallback: string): string {
  return clip(v, max) ?? fallback;
}

function ts(v: unknown): Date | null {
  if (v == null || v === '' || v === 'null') return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function tsOrNow(v: unknown): Date {
  return ts(v) ?? new Date();
}

function bool(v: unknown, fallback = false): boolean {
  if (v == null) return fallback;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).toLowerCase();
  if (['1', 'true', 'yes', 't'].includes(s)) return true;
  if (['0', 'false', 'no', 'f'].includes(s)) return false;
  return fallback;
}

function isUuid(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

function lang(v: unknown): string {
  const raw = clip(v, 32);
  if (!raw) return 'en';
  const key = raw.toUpperCase();
  const map: Record<string, string> = {
    ENGLISH: 'en',
    ARABIC: 'ar',
    HINDI: 'hi',
    URDU: 'ur',
    FRENCH: 'fr',
    SPANISH: 'es',
    GERMAN: 'de',
    TURKISH: 'tr',
    RUSSIAN: 'ru',
    CHINESE: 'zh',
    PORTUGUESE: 'pt',
  };
  return (map[key] ?? raw).slice(0, 16);
}

function postType(v: unknown): 'post' | 'reel' | 'vibe' {
  const s = String(v ?? 'post').toLowerCase();
  if (s === 'reel' || s === 'reels') return 'reel';
  if (s === 'vibe' || s === 'vibes') return 'vibe';
  return 'post';
}

function fileType(v: unknown): 'image' | 'video' {
  const s = String(v ?? 'image').toLowerCase();
  if (s.includes('video') || s === 'reel') return 'video';
  return 'image';
}

function mimeFromPath(path: string, kind: 'image' | 'video'): string {
  const p = path.toLowerCase();
  if (kind === 'video') {
    if (p.endsWith('.webm')) return 'video/webm';
    if (p.endsWith('.mov')) return 'video/quicktime';
    return 'video/mp4';
  }
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.webp')) return 'image/webp';
  if (p.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function guessPlatform(deviceType: unknown): { platform: string; provider: string } {
  const s = String(deviceType ?? '').toLowerCase();
  if (s.includes('ios') || s.includes('iphone') || s.includes('ipad')) {
    return { platform: 'ios', provider: 'apns' };
  }
  if (s.includes('web')) return { platform: 'web', provider: 'web' };
  return { platform: 'android', provider: 'fcm' };
}

function mapNotifType(raw: unknown): { type: string; entityType: string | null } {
  const t = String(raw ?? 'system').toUpperCase();
  const table: Record<string, { type: string; entityType: string | null }> = {
    LIKE_POST: { type: 'like', entityType: 'post' },
    LIKE_REEL: { type: 'like', entityType: 'reel' },
    LIKE_VIBE: { type: 'like', entityType: 'vibe' },
    LIKE_STORY: { type: 'like', entityType: 'story' },
    LIKE_POST_COMMENT: { type: 'like', entityType: 'comment' },
    COMMENT_POST: { type: 'comment', entityType: 'post' },
    COMMENT_REEL: { type: 'comment', entityType: 'reel' },
    COMMENT_VIBE: { type: 'comment', entityType: 'vibe' },
    MENTIONED_IN_COMMENT: { type: 'mention', entityType: 'comment' },
    TAGGED: { type: 'mention', entityType: 'post' },
    STARTED_FOLLOWING: { type: 'follow', entityType: 'user' },
    NEW_FOLLOW_REQUEST: { type: 'follow_request', entityType: 'user' },
    ACCEPTED_FOLLOW_REQUEST: { type: 'follow_accepted', entityType: 'user' },
    GIFT: { type: 'gift', entityType: 'post' },
    SHARE_POST: { type: 'share', entityType: 'post' },
    SHARE_REEL: { type: 'share', entityType: 'reel' },
    SHARE_POST_OWNER: { type: 'share', entityType: 'post' },
    SHARE_REEL_OWNER: { type: 'share', entityType: 'reel' },
    RECEIVE_COIN: { type: 'coin_received', entityType: 'wallet' },
    RECEIVE_MONEY: { type: 'coin_received', entityType: 'wallet' },
    SEND_COIN: { type: 'coin_sent', entityType: 'wallet' },
    POLL_VOTE: { type: 'poll_vote', entityType: 'vibe' },
    NEW_POST: { type: 'system', entityType: 'post' },
    NEW_REEL: { type: 'system', entityType: 'reel' },
    NEW_VIBE: { type: 'system', entityType: 'vibe' },
  };
  return table[t] ?? { type: 'system', entityType: null };
}

function oauthProvider(channel: unknown): 'google' | 'apple' | null {
  const s = String(channel ?? '').toLowerCase();
  if (s.includes('google')) return 'google';
  if (s.includes('apple')) return 'apple';
  return null;
}

async function insertBatched(
  dest: Knex,
  table: string,
  rows: Record<string, unknown>[],
  label: string,
): Promise<number> {
  if (!rows.length) {
    console.log(`  ${label}: 0`);
    return 0;
  }
  let ok = 0;
  let skipped = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    try {
      await dest(table).insert(chunk);
      ok += chunk.length;
    } catch {
      for (const row of chunk) {
        try {
          await dest(table).insert(row);
          ok += 1;
        } catch {
          skipped += 1;
        }
      }
    }
  }
  console.log(`  ${label}: inserted ${ok}${skipped ? `, skipped ${skipped}` : ''}`);
  return ok;
}

async function existingUuidMap(dest: Knex, table: string): Promise<IdMap> {
  const rows = (await dest(table).select('id', 'uuid')) as Array<{ id: unknown; uuid: string }>;
  const map: IdMap = new Map();
  for (const r of rows) map.set(String(r.uuid), asId(r.id));
  return map;
}

async function tableExists(db: Knex, schema: string, table: string): Promise<boolean> {
  const result = await db.raw(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = ? AND table_name = ?
     ) AS present`,
    [schema, table],
  );
  return Boolean(result.rows?.[0]?.present);
}

const maps = {
  users: new Map<string, string>() as IdMap,
  posts: new Map<string, string>() as IdMap,
  comments: new Map<string, string>() as IdMap,
  hashtags: new Map<string, string>() as IdMap,
  hashtagByName: new Map<string, string>(),
  giftTypeBySourceId: new Map<string, string>(),
  polls: new Map<string, string>() as IdMap,
  pollOptions: new Map<string, string>() as IdMap,
};

async function loadUserMap(dest: Knex): Promise<void> {
  const rows = (await dest('users').select('id', 'uuid')) as Array<{ id: unknown; uuid: string }>;
  maps.users.clear();
  for (const r of rows) maps.users.set(String(r.uuid), asId(r.id));
}

async function freshWipe(dest: Knex): Promise<void> {
  console.log('Fresh wipe: truncating dest user graph…');
  await dest.raw('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
  await dest.raw(
    'TRUNCATE TABLE hashtags, gifts, coin_packages, countries RESTART IDENTITY CASCADE',
  );
  maps.users.clear();
  maps.posts.clear();
  maps.comments.clear();
  maps.hashtags.clear();
  maps.hashtagByName.clear();
  maps.giftTypeBySourceId.clear();
  maps.polls.clear();
  maps.pollOptions.clear();
}

async function syncCountries(source: Knex, dest: Knex): Promise<void> {
  const existing = await existingUuidMap(dest, 'countries');
  const rows = (await src(source, 'countries').select('*')) as Array<Record<string, unknown>>;
  const insert: Record<string, unknown>[] = [];
  for (const r of rows) {
    const uuid = isUuid(r.id) ? String(r.id) : randomUUID();
    if (existing.has(uuid)) continue;
    insert.push({
      uuid,
      name: requiredClip(r.name, 120, 'Unknown'),
      flag_url: clip(r.flag_url, 500) ?? '',
      country_code: requiredClip(r.country_code, 10, 'XX'),
      nationality: requiredClip(r.nationality, 200, requiredClip(r.name, 200, 'Unknown')),
      phone_code: requiredClip(r.phone_code, 16, '+0'),
      is_new_country_visible: bool(r.is_new_country_visible, false),
      created_at: tsOrNow(r.created_at),
      updated_at: tsOrNow(r.updated_at),
    });
  }
  await insertBatched(dest, 'countries', insert, 'countries');
}

async function syncCoinPackages(source: Knex, dest: Knex): Promise<void> {
  const existingNames = new Set(
    ((await dest('coin_packages').select('name')) as Array<{ name: string }>).map((r) =>
      r.name.toLowerCase(),
    ),
  );
  const rows = (await src(source, 'coin_packages').select('*')) as Array<Record<string, unknown>>;
  const insert: Record<string, unknown>[] = [];
  for (const r of rows) {
    const name = requiredClip(r.name, 120, `Pack ${r.id}`);
    if (existingNames.has(name.toLowerCase())) continue;
    insert.push({
      uuid: randomUUID(),
      name,
      coins: Number(r.coins) || 0,
      amount_usd_cent: Number(r.amount_usd_cent) || 0,
      bonus_coins: Number(r.bonus_coins) || 0,
      is_active: bool(r.is_active, true),
      google_product_id: clip(r.google_product_id, 255),
      ios_product_id: clip(r.ios_product_id, 255),
      sort_order: Number(r.sort_order) || 0,
      created_at: tsOrNow(r.created_at),
      updated_at: tsOrNow(r.updated_at),
    });
  }
  await insertBatched(dest, 'coin_packages', insert, 'coin_packages');
}

async function syncGifts(source: Knex, dest: Knex): Promise<void> {
  const existing = (await dest('gifts').select('id', 'uuid', 'type', 'title')) as Array<{
    id: unknown;
    uuid: string;
    type: string;
    title: string;
  }>;
  const byTitle = new Set(existing.map((g) => g.title.toLowerCase()));
  const rows = (await src(source, 'gifts').select('*')) as Array<Record<string, unknown>>;
  const insert: Record<string, unknown>[] = [];
  for (const r of rows) {
    const title = requiredClip(r.title, 120, `Gift ${r.id}`);
    const type = requiredClip(r.type, 64, title);
    const existingRow = existing.find(
      (g) => g.title.toLowerCase() === title.toLowerCase(),
    );
    const destUuid = existingRow?.uuid ?? randomUUID();
    maps.giftTypeBySourceId.set(String(r.id), destUuid);
    if (byTitle.has(title.toLowerCase())) continue;
    byTitle.add(title.toLowerCase());
    insert.push({
      uuid: destUuid,
      type,
      title,
      icon: clip(r.icon, 512) ?? '',
      amount: Number(r.amount) || 0,
      currency: clip(r.currency, 16) ?? 'coin',
      is_active: bool(r.is_active, true),
      visual_order: Number(r.visual_order) || 0,
      deleted_at: ts(r.deleted_at),
      created_at: tsOrNow(r.created_at),
      updated_at: tsOrNow(r.updated_at),
    });
  }
  await insertBatched(dest, 'gifts', insert, 'gifts');
}

async function syncUsers(source: Knex, dest: Knex): Promise<void> {
  await loadUserMap(dest);
  const rows = (await src(source, '_users').select('*').orderBy('createdAt', 'asc')) as Array<
    Record<string, unknown>
  >;
  const seenEmail = new Set<string>();
  const seenPhone = new Set<string>();
  const insert: Record<string, unknown>[] = [];

  for (const r of destUsersEmailSeed(await dest('users').select('email', 'country_code', 'phone_number', 'deleted_at'))) {
    if (r.email) seenEmail.add(r.email);
    if (r.phone) seenPhone.add(r.phone);
  }

  for (const r of rows) {
    const uuid = String(r.id);
    if (maps.users.has(uuid)) continue;
    const deletedAt = bool(r.isDeleted)
      ? ts(r.deletedAt) ?? ts(r.updatedAt) ?? new Date()
      : ts(r.deletedAt);
    let email = clip(r.email, 255)?.toLowerCase() ?? null;
    let countryCode = clip(r.country_code, 8);
    let phone = clip(r.phone_number, 32);
    if (!deletedAt) {
      if (email) {
        if (seenEmail.has(email)) email = null;
        else seenEmail.add(email);
      }
      if (countryCode && phone) {
        const key = `${countryCode}|${phone}`;
        if (seenPhone.has(key)) {
          countryCode = null;
          phone = null;
        } else {
          seenPhone.add(key);
        }
      }
    }
    insert.push({
      uuid,
      email,
      country_code: countryCode,
      phone_number: phone,
      password: clip(r.password, 255) ?? '',
      salt: clip(r.salt, 255) ?? '',
      status: clip(r.status, 32) ?? 'active',
      terms_agreed: bool(r.terms_agreed, true),
      deleted_at: deletedAt,
      created_at: tsOrNow(r.createdAt),
      updated_at: tsOrNow(r.updatedAt),
    });
  }
  await insertBatched(dest, 'users', insert, 'users');
  await loadUserMap(dest);
}

function destUsersEmailSeed(
  rows: Array<{
    email?: string | null;
    country_code?: string | null;
    phone_number?: string | null;
    deleted_at?: Date | string | null;
  }>,
): Array<{ email: string | null; phone: string | null }> {
  return rows
    .filter((r) => !r.deleted_at)
    .map((r) => ({
      email: r.email ? r.email.toLowerCase() : null,
      phone: r.country_code && r.phone_number ? `${r.country_code}|${r.phone_number}` : null,
    }));
}

function uniqueUsername(raw: unknown, uuid: string, seen: Set<string>): string {
  let base = (clip(raw, 64) ?? `user_${uuid.slice(0, 8)}`)
    .replace(/[^\w.]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  if (!base) base = `user_${uuid.slice(0, 8)}`;
  let name = base;
  let n = 2;
  while (seen.has(name.toLowerCase())) {
    const suffix = `_${n++}`;
    name = `${base.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`;
  }
  seen.add(name.toLowerCase());
  return name;
}

async function syncUserDetails(source: Knex, dest: Knex): Promise<void> {
  const existing = new Set(
    ((await dest('user_details').select('user_id')) as Array<{ user_id: unknown }>).map((r) =>
      String(r.user_id),
    ),
  );
  const seenNames = new Set(
    ((await dest('user_details').whereNull('deleted_at').select('username')) as Array<{
      username: string;
    }>).map((r) => r.username.toLowerCase()),
  );
  const details = (await src(source, '_user_details').select('*')) as Array<Record<string, unknown>>;
  const pictures = (await src(source, '_profile_pictures')
    .select('*')
    .orderBy('createdAt', 'desc')) as Array<Record<string, unknown>>;

  const picById = new Map<string, Record<string, unknown>>();
  const latestPicByUser = new Map<string, Record<string, unknown>>();
  for (const p of pictures) {
    picById.set(String(p.id), p);
    const uid = String(p.user_id);
    if (!latestPicByUser.has(uid) && p.file_path) latestPicByUser.set(uid, p);
  }

  const mediaRows: Record<string, unknown>[] = [];
  const usedMediaKeys = new Set(
    ((await dest('media').whereNull('deleted_at').select('key')) as Array<{ key: string }>).map(
      (r) => r.key,
    ),
  );
  const mediaUuidForPic = new Map<string, string>();

  for (const p of pictures) {
    const userId = maps.users.get(String(p.user_id));
    if (!userId) continue;
    const key = clip(p.file_path, 512);
    if (!key) continue;
    const uuid = String(p.id);
    mediaUuidForPic.set(uuid, uuid);
    if (usedMediaKeys.has(key)) continue;
    usedMediaKeys.add(key);
    mediaRows.push({
      uuid,
      user_id: userId,
      kind: 'image',
      key,
      content_type: mimeFromPath(key, 'image'),
      status: 'ready',
      purpose: 'avatar',
      strategy: 'put',
      deleted_at: ts(p.deletedAt),
      created_at: tsOrNow(p.createdAt),
      updated_at: tsOrNow(p.updatedAt),
    });
  }
  await insertBatched(dest, 'media', mediaRows, 'media (avatars)');

  const insert: Record<string, unknown>[] = [];
  const coveredUsers = new Set<string>();
  for (const r of details) {
    const userId = maps.users.get(String(r.user_id));
    if (!userId || existing.has(userId)) continue;
    coveredUsers.add(userId);
    const picId = r.profile_picture ? String(r.profile_picture) : null;
    const pic = (picId && picById.get(picId)) || latestPicByUser.get(String(r.user_id));
    const profilePicture = pic ? mediaUuidForPic.get(String(pic.id)) ?? null : null;
    insert.push({
      uuid: isUuid(r.id) ? String(r.id) : randomUUID(),
      user_id: userId,
      username: uniqueUsername(r.username, String(r.user_id), seenNames),
      full_name: clip(r.full_name, 120),
      profile_picture: profilePicture,
      dob: r.dob || null,
      bio: r.bio ?? null,
      gender: clip(r.gender, 32),
      nationality: clip(r.nationality, 64),
      profession: clip(r.profession, 120),
      link: r.link ?? null,
      app_language: lang(r.app_language),
      content_translation: lang(r.content_translation),
      is_private: bool(r.is_private, false),
      location_permission: bool(r.location_permission, false),
      longitude: r.longitude ?? null,
      latitude: r.latitude ?? null,
      location: clip(r.location, 255),
      living: clip(r.living_address ?? r.living, 255),
      is_verified: bool(r.verified ?? r.is_verified, false),
      deleted_at: bool(r.is_deleted) ? ts(r.updatedAt) ?? new Date() : null,
      created_at: tsOrNow(r.createdAt),
      updated_at: tsOrNow(r.updatedAt),
    });
  }

  for (const [uuid, userId] of maps.users) {
    if (existing.has(userId) || coveredUsers.has(userId)) continue;
    const pic = latestPicByUser.get(uuid);
    insert.push({
      uuid: randomUUID(),
      user_id: userId,
      username: uniqueUsername(null, uuid, seenNames),
      profile_picture: pic ? mediaUuidForPic.get(String(pic.id)) ?? null : null,
      app_language: 'en',
      content_translation: 'en',
      is_private: false,
      location_permission: false,
      is_verified: false,
    });
  }
  await insertBatched(dest, 'user_details', insert, 'user_details');
}

async function syncUserStats(dest: Knex): Promise<void> {
  const existing = new Set(
    ((await dest('user_stats').select('user_id')) as Array<{ user_id: unknown }>).map((r) =>
      String(r.user_id),
    ),
  );
  const insert = [...maps.users.values()]
    .filter((id) => !existing.has(id))
    .map((user_id) => ({ user_id, post_count: 0, reel_count: 0, follower_count: 0, following_count: 0 }));
  await insertBatched(dest, 'user_stats', insert, 'user_stats (placeholders)');
}

async function syncOauth(source: Knex, dest: Knex): Promise<void> {
  const rows = (await src(source, '_social_accounts').select('*')) as Array<Record<string, unknown>>;
  const insert: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const userId = maps.users.get(String(r.user_id));
    const provider = oauthProvider(r.social_channel);
    const providerUserId = clip(r.social_id, 255);
    if (!userId || !provider || !providerUserId) continue;
    const key = `${provider}:${providerUserId}`;
    const userKey = `${userId}:${provider}`;
    if (seen.has(key) || seen.has(userKey)) continue;
    seen.add(key);
    seen.add(userKey);
    insert.push({
      uuid: isUuid(r.id) ? String(r.id) : randomUUID(),
      user_id: userId,
      provider,
      provider_user_id: providerUserId,
      email_verified: bool(r.verified, false),
      created_at: tsOrNow(r.createdAt),
      updated_at: tsOrNow(r.updatedAt),
    });
  }
  await insertBatched(dest, 'user_oauth_accounts', insert, 'user_oauth_accounts');
}

async function syncDevices(source: Knex, dest: Knex): Promise<void> {
  const rows = (await src(source, '_device_infos').select('*')) as Array<Record<string, unknown>>;
  const seenToken = new Set<string>();
  const seenDeviceId = new Set<string>();
  const insert: Record<string, unknown>[] = [];
  for (const r of rows) {
    const userId = maps.users.get(String(r.user_id));
    const token = clip(r.device_token, 4000);
    if (!userId || !token || seenToken.has(token)) continue;
    seenToken.add(token);
    let deviceId = clip(r.device_id, 255);
    if (deviceId) {
      if (seenDeviceId.has(deviceId)) deviceId = null;
      else seenDeviceId.add(deviceId);
    }
    const { platform, provider } = guessPlatform(r.device_type);
    insert.push({
      uuid: isUuid(r.id) ? String(r.id) : randomUUID(),
      user_id: userId,
      device_token: token,
      provider,
      platform,
      app_version: clip(r.app_version, 32),
      os_version: clip(r.os_version, 32),
      device_model: clip(r.device_name, 128),
      device_name: clip(r.device_name, 128),
      is_active: bool(r.is_active, true),
      notifications_enabled: true,
      last_seen_at: ts(r.last_active_at),
      device_id: deviceId,
      voip_token: clip(r.voipToken, 4000),
      ip_address: clip(r.ip_address, 64),
      created_at: tsOrNow(r.createdAt),
      updated_at: tsOrNow(r.updatedAt),
      deleted_at: ts(r.revoked_at),
    });
  }
  await insertBatched(dest, 'device_infos', insert, 'device_infos');
}

async function syncNotificationSettings(source: Knex, dest: Knex): Promise<void> {
  const existing = new Set(
    ((await dest('notification_settings').select('user_id')) as Array<{ user_id: unknown }>).map(
      (r) => String(r.user_id),
    ),
  );
  const rows = (await src(source, '_notification_settings').select('*')) as Array<
    Record<string, unknown>
  >;
  const insert: Record<string, unknown>[] = [];
  const covered = new Set<string>();
  const copyBool = (row: Record<string, unknown>, key: string, fallback = true) =>
    bool(row[key], fallback);

  for (const r of rows) {
    const userId = maps.users.get(String(r.user_id));
    if (!userId || existing.has(userId) || covered.has(userId)) continue;
    covered.add(userId);
    insert.push({
      user_id: userId,
      push_enabled: copyBool(r, 'notification', true),
      likes_enabled: copyBool(r, 'like_post', true),
      comments_enabled: copyBool(r, 'comment_post', true),
      follows_enabled: copyBool(r, 'follow_request', true),
      mentions_enabled: copyBool(r, 'mention', true),
      gifts_enabled: copyBool(r, 'gift_post', true),
      notification: copyBool(r, 'notification', true),
      like_post: copyBool(r, 'like_post'),
      comment_post: copyBool(r, 'comment_post'),
      share_post: copyBool(r, 'share_post', false),
      dislike_post: copyBool(r, 'dislike_post'),
      gift_post: copyBool(r, 'gift_post'),
      like_reel: copyBool(r, 'like_reel'),
      comment_reel: copyBool(r, 'comment_reel'),
      share_reel: copyBool(r, 'share_reel', false),
      dislike_reel: copyBool(r, 'dislike_reel'),
      gift_reel: copyBool(r, 'gift_reel'),
      like_vibe: copyBool(r, 'like_vibe'),
      comment_vibe: copyBool(r, 'comment_vibe'),
      share_vibe: copyBool(r, 'share_vibe', false),
      dislike_vibe: copyBool(r, 'dislike_vibe'),
      gift_vibe: copyBool(r, 'gift_vibe'),
      poll_vibe: copyBool(r, 'poll_vibe'),
      like_story: copyBool(r, 'like_story'),
      message_story: copyBool(r, 'message_story'),
      share_story: copyBool(r, 'share_story', false),
      post_from_follower: copyBool(r, 'post_from_follower'),
      follow_request: copyBool(r, 'follow_request'),
      msg_show_notifications: copyBool(r, 'msg_show_notifications'),
      msg_show_likes: copyBool(r, 'msg_show_likes'),
      msg_show_comments: copyBool(r, 'msg_show_comments'),
      group_show_notifications: copyBool(r, 'group_show_notifications'),
      channel_show_notifications: copyBool(r, 'channel_show_notifications'),
      in_app_notifications: copyBool(r, 'in_app_notifications'),
      show_preview: copyBool(r, 'show_preview'),
      new_chat_message: copyBool(r, 'new_chat_message'),
      created_at: tsOrNow(r.createdAt),
      updated_at: tsOrNow(r.updatedAt),
    });
  }
  for (const userId of maps.users.values()) {
    if (existing.has(userId) || covered.has(userId)) continue;
    insert.push({ user_id: userId });
  }
  await insertBatched(dest, 'notification_settings', insert, 'notification_settings');
}

async function syncFollows(source: Knex, dest: Knex): Promise<void> {
  const rows = (await src(source, '_follows').select('*')) as Array<Record<string, unknown>>;
  const insert: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const follower = maps.users.get(String(r.follower_user_id));
    const following = maps.users.get(String(r.following_user_id));
    if (!follower || !following || follower === following) continue;
    const key = `${follower}|${following}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const status = String(r.status ?? 'follow').toLowerCase() === 'requested' ? 'requested' : 'follow';
    insert.push({
      follower_id: follower,
      following_id: following,
      status,
      requested_at: ts(r.requested_at),
      followed_at: ts(r.followed_at) ?? (status === 'follow' ? tsOrNow(r.createdAt) : null),
      created_at: tsOrNow(r.createdAt),
      updated_at: tsOrNow(r.updatedAt),
    });
  }
  await insertBatched(dest, 'follows', insert, 'follows');
}

async function syncBlocks(source: Knex, dest: Knex): Promise<void> {
  const rows = (await src(source, '_blocklists').select('*')) as Array<Record<string, unknown>>;
  const insert: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const blocker = maps.users.get(String(r.user_id));
    const blocked = maps.users.get(String(r.block_user_id));
    if (!blocker || !blocked || blocker === blocked) continue;
    const key = `${blocker}|${blocked}`;
    if (seen.has(key)) continue;
    seen.add(key);
    insert.push({
      blocker_id: blocker,
      blocked_id: blocked,
      created_at: tsOrNow(r.createdAt),
      updated_at: tsOrNow(r.updatedAt),
    });
  }
  await insertBatched(dest, 'blocks', insert, 'blocks');
}

async function syncHashtags(source: Knex, dest: Knex): Promise<void> {
  maps.hashtags = await existingUuidMap(dest, 'hashtags');
  const existingNames = (await dest('hashtags').select('id', 'name')) as Array<{
    id: unknown;
    name: string;
  }>;
  for (const h of existingNames) {
    maps.hashtagByName.set(h.name.toLowerCase(), asId(h.id));
  }
  const rows = (await src(source, '_hashtags').select('*')) as Array<Record<string, unknown>>;
  const insert: Record<string, unknown>[] = [];
  for (const r of rows) {
    const name = (clip(r.hashtag, 100) ?? '').replace(/^#/, '').trim();
    if (!name) continue;
    const uuid = String(r.id);
    if (maps.hashtags.has(uuid) || maps.hashtagByName.has(name.toLowerCase())) continue;
    insert.push({
      uuid,
      name,
      post_count: 0,
      deleted_at: ts(r.deletedAt),
      created_at: tsOrNow(r.createdAt),
      updated_at: tsOrNow(r.updatedAt),
    });
  }
  await insertBatched(dest, 'hashtags', insert, 'hashtags');
  maps.hashtags = await existingUuidMap(dest, 'hashtags');
  const all = (await dest('hashtags').select('id', 'name', 'uuid')) as Array<{
    id: unknown;
    name: string;
    uuid: string;
  }>;
  maps.hashtagByName.clear();
  for (const h of all) {
    maps.hashtags.set(h.uuid, asId(h.id));
    maps.hashtagByName.set(h.name.toLowerCase(), asId(h.id));
  }
}

async function syncPosts(source: Knex, dest: Knex): Promise<void> {
  maps.posts = await existingUuidMap(dest, 'posts');
  const rows = (await src(source, 'posts').select('*').orderBy('created_at', 'asc')) as Array<
    Record<string, unknown>
  >;
  const insert: Record<string, unknown>[] = [];
  const parents: Array<{ uuid: string; parent: string | null; main: string | null }> = [];
  for (const r of rows) {
    const uuid = String(r.id);
    const userId = maps.users.get(String(r.user_id));
    if (!userId) continue;
    parents.push({
      uuid,
      parent: r.parent_id ? String(r.parent_id) : null,
      main: r.main_parent_id ? String(r.main_parent_id) : null,
    });
    if (maps.posts.has(uuid)) continue;
    insert.push({
      uuid,
      user_id: userId,
      caption: r.caption ?? null,
      lang: clip(r.lang, 16),
      type: postType(r.type),
      privacy: clip(r.privacy, 32) ?? 'public',
      longitude: r.longitude ?? null,
      latitude: r.latitude ?? null,
      location: clip(r.location, 255),
      enable_comments: bool(r.enable_comments, true),
      enable_likes: bool(r.enable_likes, true),
      is_pinned: bool(r.is_pinned, false),
      is_archived: bool(r.is_archived, false),
      is_draft: bool(r.is_draft, false),
      deleted_at: ts(r.deleted_at),
      created_at: tsOrNow(r.created_at),
      updated_at: tsOrNow(r.updated_at),
      expired_at: ts(r.expired_at),
      parent_id: null,
      main_parent_id: null,
    });
  }
  await insertBatched(dest, 'posts', insert, 'posts');
  maps.posts = await existingUuidMap(dest, 'posts');

  let commentFlags = 0;
  for (const r of rows) {
    const id = maps.posts.get(String(r.id));
    if (!id) continue;
    await dest('posts').where({ id }).update({
      enable_comments: bool(r.enable_comments, true),
      enable_likes: bool(r.enable_likes, true),
    });
    commentFlags += 1;
  }
  if (commentFlags) console.log(`  posts comment/like flags: ${commentFlags}`);

  let linked = 0;
  for (const p of parents) {
    const id = maps.posts.get(p.uuid);
    if (!id) continue;
    const parentId = p.parent && isUuid(p.parent) ? maps.posts.get(p.parent) : null;
    // OneVibe: main_parent_id is the thread root (bigint). Linkgram uses "0" for roots.
    let mainId = p.main && isUuid(p.main) ? maps.posts.get(p.main) : null;
    if (parentId && !mainId) mainId = parentId;
    if (!parentId && !mainId) continue;
    await dest('posts').where({ id }).update({
      parent_id: parentId ?? null,
      main_parent_id: mainId ?? null,
    });
    linked += 1;
  }
  if (linked) console.log(`  posts parent links: ${linked}`);
}

async function syncPostMedias(source: Knex, dest: Knex): Promise<void> {
  const existing = await existingUuidMap(dest, 'post_medias');
  const rows = (await src(source, 'post_medias').select('*')) as Array<Record<string, unknown>>;
  const insert: Record<string, unknown>[] = [];
  for (const r of rows) {
    const uuid = String(r.id);
    const postId = maps.posts.get(String(r.post_id));
    const path = clip(r.file_path, 8000);
    if (!postId || !path || existing.has(uuid)) continue;
    insert.push({
      uuid,
      post_id: postId,
      media_id: null,
      file_path: path,
      file_type: fileType(r.file_type),
      thumbnail: r.thumbnail ?? null,
      position: Number(r.position) || 0,
      meta: r.meta ?? r.file_meta ?? null,
      stream_id: isUuid(r.stream_id) ? r.stream_id : null,
      is_stream_available: bool(r.is_stream_available, false),
      deleted_at: ts(r.deleted_at),
      created_at: tsOrNow(r.created_at),
      updated_at: tsOrNow(r.updated_at),
    });
  }
  await insertBatched(dest, 'post_medias', insert, 'post_medias');
}

async function syncPostStats(source: Knex, dest: Knex): Promise<void> {
  const existing = new Set(
    ((await dest('post_stats').select('post_id')) as Array<{ post_id: unknown }>).map((r) =>
      String(r.post_id),
    ),
  );
  const rows = (await src(source, 'posts').select(
    'id',
    'likes_count',
    'dislikes_count',
    'comments_count',
    'shares_count',
    'views_count',
    'repost_count',
    'gift_counts',
    'created_at',
    'updated_at',
  )) as Array<Record<string, unknown>>;
  const insert: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const postId = maps.posts.get(String(r.id));
    if (!postId || existing.has(postId) || seen.has(postId)) continue;
    seen.add(postId);
    insert.push({
      post_id: postId,
      likes_count: Number(r.likes_count) || 0,
      dislikes_count: Number(r.dislikes_count) || 0,
      comments_count: Number(r.comments_count) || 0,
      shares_count: Number(r.shares_count) || 0,
      views_count: Number(r.views_count) || 0,
      saves_count: 0,
      reposts_count: Number(r.repost_count) || 0,
      gifts_count: Number(r.gift_counts) || 0,
      created_at: tsOrNow(r.created_at),
      updated_at: tsOrNow(r.updated_at),
    });
  }
  for (const postId of maps.posts.values()) {
    if (existing.has(postId) || seen.has(postId)) continue;
    insert.push({ post_id: postId });
  }
  await insertBatched(dest, 'post_stats', insert, 'post_stats');
}

async function syncPairTable(
  source: Knex,
  dest: Knex,
  srcTable: string,
  destTable: string,
  mapRow: (r: Record<string, unknown>) => Record<string, unknown> | null,
): Promise<void> {
  const rows = (await src(source, srcTable).select('*')) as Array<Record<string, unknown>>;
  const insert: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const mapped = mapRow(r);
    if (!mapped) continue;
    const key = JSON.stringify(mapped);
    if (seen.has(key)) continue;
    seen.add(key);
    insert.push(mapped);
  }
  await insertBatched(dest, destTable, insert, destTable);
}

async function syncEngagement(source: Knex, dest: Knex): Promise<void> {
  await syncPairTable(source, dest, 'post_likes', 'post_likes', (r) => {
    const postId = maps.posts.get(String(r.post_id));
    const userId = maps.users.get(String(r.user_id));
    if (!postId || !userId) return null;
    return { post_id: postId, user_id: userId, created_at: tsOrNow(r.created_at) };
  });
  await syncPairTable(source, dest, 'post_dislikes', 'post_dislikes', (r) => {
    const postId = maps.posts.get(String(r.post_id));
    const userId = maps.users.get(String(r.user_id));
    if (!postId || !userId) return null;
    return { post_id: postId, user_id: userId, created_at: tsOrNow(r.created_at) };
  });
  await syncPairTable(source, dest, 'post_views', 'post_views', (r) => {
    const postId = maps.posts.get(String(r.post_id));
    const userId = maps.users.get(String(r.user_id));
    if (!postId || !userId) return null;
    return { post_id: postId, user_id: userId, created_at: tsOrNow(r.created_at) };
  });
  await syncPairTable(source, dest, 'post_shares', 'post_shares', (r) => {
    const postId = maps.posts.get(String(r.post_id));
    const userId = maps.users.get(String(r.user_id));
    if (!postId || !userId) return null;
    return {
      post_id: postId,
      user_id: userId,
      channel: 'external',
      meta: r.to_user_id ? { toUserId: String(r.to_user_id) } : null,
      created_at: tsOrNow(r.created_at),
    };
  });
}

type PendingComment = {
  uuid: string;
  postId: string;
  userId: string;
  parentUuid: string | null;
  body: string;
  likes_count: number;
  replies_count: number;
  lang: string;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

/** Linkgram thread root: main_parent_id UUID, else parent_id. "0" means this row is root. */
function vibeRootUuid(r: Record<string, unknown>): string | null {
  const main = r.main_parent_id != null ? String(r.main_parent_id) : '';
  if (isUuid(main)) return main;
  const parent = r.parent_id != null ? String(r.parent_id) : '';
  return isUuid(parent) ? parent : null;
}

/**
 * OneVibe comments are 2-level (root + replies under that root).
 * Linkgram uses parent_id (immediate) + base_comment_id (thread root).
 */
function onevibeCommentParentUuid(r: Record<string, unknown>): string | null {
  const own = String(r.id);
  const base = r.base_comment_id != null ? String(r.base_comment_id) : '';
  const parent = r.parent_id != null ? String(r.parent_id) : '';
  if (isUuid(base) && base !== own) return base;
  if (isUuid(parent) && parent !== own) return parent;
  return null;
}

async function upsertCommentRows(
  dest: Knex,
  pending: PendingComment[],
  hasLang: boolean,
  label: string,
): Promise<{ inserted: number; updated: number; firstError: string | null }> {
  let inserted = 0;
  let updated = 0;
  let firstError: string | null = null;
  const queue = [...pending];
  for (let pass = 0; pass < 32 && queue.length; pass++) {
    const deferred: PendingComment[] = [];
    for (const item of queue) {
      const parentId = item.parentUuid ? maps.comments.get(item.parentUuid) ?? null : null;
      if (item.parentUuid && !parentId) {
        const parentInDump = pending.some((q) => q.uuid === item.parentUuid);
        if (parentInDump && pass < 30) {
          deferred.push(item);
          continue;
        }
      }
      const payload: Record<string, unknown> = {
        post_id: item.postId,
        user_id: item.userId,
        parent_id: parentId,
        body: item.body,
        likes_count: item.likes_count,
        replies_count: item.replies_count,
        deleted_at: item.deleted_at,
        created_at: item.created_at,
        updated_at: item.updated_at,
      };
      if (hasLang) payload.lang = item.lang;
      const existingId = maps.comments.get(item.uuid);
      if (existingId) {
        const { created_at: _createdAt, ...patch } = payload;
        await dest('post_comments').where({ id: existingId }).update(patch);
        updated += 1;
      } else {
        try {
          const [row] = (await dest('post_comments')
            .insert({ uuid: item.uuid, ...payload })
            .returning(['id'])) as Array<{ id: unknown }>;
          maps.comments.set(item.uuid, asId(row.id));
          inserted += 1;
        } catch (err) {
          if (!firstError) firstError = err instanceof Error ? err.message : String(err);
          deferred.push(item);
        }
      }
    }
    if (deferred.length === queue.length) {
      for (const item of deferred) {
        const existingId = maps.comments.get(item.uuid);
        const payload: Record<string, unknown> = {
          post_id: item.postId,
          user_id: item.userId,
          parent_id: null,
          body: item.body,
          likes_count: item.likes_count,
          replies_count: item.replies_count,
          deleted_at: item.deleted_at,
          created_at: item.created_at,
          updated_at: item.updated_at,
        };
        if (hasLang) payload.lang = item.lang;
        if (existingId) {
          const { created_at: _createdAt, ...patch } = payload;
          await dest('post_comments').where({ id: existingId }).update(patch);
          updated += 1;
        } else {
          try {
            const [row] = (await dest('post_comments')
              .insert({ uuid: item.uuid, ...payload })
              .returning(['id'])) as Array<{ id: unknown }>;
            maps.comments.set(item.uuid, asId(row.id));
            inserted += 1;
          } catch (err) {
            if (!firstError) firstError = err instanceof Error ? err.message : String(err);
          }
        }
      }
      break;
    }
    queue.length = 0;
    queue.push(...deferred);
  }
  console.log(`  ${label}: inserted ${inserted}, updated ${updated}`);
  if (firstError) console.warn(`  ${label} first error: ${firstError}`);
  return { inserted, updated, firstError };
}

async function syncComments(source: Knex, dest: Knex): Promise<void> {
  maps.comments = await existingUuidMap(dest, 'post_comments');
  const hasLang = await dest.schema.hasColumn('post_comments', 'lang');
  const rows = (await src(source, 'post_comments').select('*').orderBy('created_at', 'asc')) as Array<
    Record<string, unknown>
  >;
  console.log(`  post_comments dump: ${rows.length}`);

  const pending: PendingComment[] = [];
  let skippedPost = 0;
  let skippedUser = 0;
  for (const r of rows) {
    const uuid = String(r.id);
    const postId = maps.posts.get(String(r.post_id));
    const userId = maps.users.get(String(r.user_id));
    if (!postId) {
      skippedPost += 1;
      continue;
    }
    if (!userId) {
      skippedUser += 1;
      continue;
    }
    pending.push({
      uuid,
      postId,
      userId,
      parentUuid: onevibeCommentParentUuid(r),
      body: String(r.content ?? r.body ?? '').trim() || '.',
      likes_count: Number(r.likes_count) || 0,
      replies_count: Number(r.replies_count) || 0,
      lang: lang(r.lang),
      deleted_at: bool(r.is_hide) ? ts(r.updated_at) ?? new Date() : null,
      created_at: tsOrNow(r.created_at),
      updated_at: tsOrNow(r.updated_at),
    });
  }

  await upsertCommentRows(dest, pending, hasLang, 'post_comments');
  if (skippedPost || skippedUser) {
    console.log(`  post_comments skipped post=${skippedPost} user=${skippedUser}`);
  }

  // Linkgram vibe "comments" are child posts (parent_id). OneVibe lists them as post_comments.
  const dumpPosts = (await src(source, 'posts').select('*')) as Array<Record<string, unknown>>;
  const vibePending: PendingComment[] = [];
  const vibeCommentUuids = new Set<string>();
  let skippedVibePost = 0;
  let skippedVibeUser = 0;
  let skippedVibeEmpty = 0;
  for (const r of dumpPosts) {
    if (postType(r.type) !== 'vibe') continue;
    const uuid = String(r.id);
    const parentUuid = r.parent_id != null ? String(r.parent_id) : '';
    if (!isUuid(parentUuid)) continue;
    const rootUuid = vibeRootUuid(r) ?? parentUuid;
    const postId = maps.posts.get(rootUuid);
    const userId = maps.users.get(String(r.user_id));
    if (!postId) {
      skippedVibePost += 1;
      continue;
    }
    if (!userId) {
      skippedVibeUser += 1;
      continue;
    }
    const body = String(r.caption ?? r.content ?? '').trim();
    if (!body) {
      skippedVibeEmpty += 1;
      continue;
    }
    vibeCommentUuids.add(uuid);
    vibePending.push({
      uuid,
      postId,
      userId,
      parentUuid: parentUuid === rootUuid ? null : parentUuid,
      body,
      likes_count: Number(r.likes_count) || 0,
      replies_count: 0,
      lang: lang(r.lang),
      deleted_at: ts(r.deleted_at),
      created_at: tsOrNow(r.created_at),
      updated_at: tsOrNow(r.updated_at),
    });
  }
  console.log(`  vibe-as-comments dump: ${vibePending.length}`);
  if (vibePending.length) {
    await upsertCommentRows(dest, vibePending, hasLang, 'vibe comments (from child vibes)');
  }
  if (skippedVibePost || skippedVibeUser || skippedVibeEmpty) {
    console.log(
      `  vibe comments skipped post=${skippedVibePost} user=${skippedVibeUser} empty=${skippedVibeEmpty}`,
    );
  }

  maps.comments = await existingUuidMap(dest, 'post_comments');

  await dest.raw(`
    UPDATE post_comments c SET
      replies_count = COALESCE((
        SELECT COUNT(*) FROM post_comments r
        WHERE r.parent_id = c.id AND r.deleted_at IS NULL
      ), 0)
  `);

  if (await dumpHas('post_comment_reactions')) {
    await syncPairTable(source, dest, 'post_comment_reactions', 'comment_likes', (r) => {
      const commentId = maps.comments.get(String(r.comment_id ?? r.post_comment_id));
      const userId = maps.users.get(String(r.user_id));
      if (!commentId || !userId) return null;
      return { comment_id: commentId, user_id: userId, created_at: tsOrNow(r.created_at) };
    });
  }

  if (vibeCommentUuids.size && (await dumpHas('post_likes'))) {
    await syncPairTable(source, dest, 'post_likes', 'comment_likes', (r) => {
      const sourcePost = String(r.post_id);
      if (!vibeCommentUuids.has(sourcePost)) return null;
      const commentId = maps.comments.get(sourcePost);
      const userId = maps.users.get(String(r.user_id));
      if (!commentId || !userId) return null;
      return { comment_id: commentId, user_id: userId, created_at: tsOrNow(r.created_at) };
    });
  }
}

async function syncHashtagLinks(source: Knex, dest: Knex): Promise<void> {
  const rows = (await src(source, 'posts').select('id', 'tags', 'caption')) as Array<{
    id: string;
    tags: unknown;
    caption: string | null;
  }>;
  const tagInsert: Record<string, unknown>[] = [];
  const userTagInsert: Record<string, unknown>[] = [];
  const seenTag = new Set<string>();
  const seenUser = new Set<string>();

  const ensureHashtag = async (name: string): Promise<string | null> => {
    const key = name.replace(/^#/, '').trim().toLowerCase().slice(0, 100);
    if (!key) return null;
    const existing = maps.hashtagByName.get(key);
    if (existing) return existing;
    try {
      const [row] = (await dest('hashtags')
        .insert({ uuid: randomUUID(), name: key, post_count: 0 })
        .returning(['id'])) as Array<{ id: unknown }>;
      const id = asId(row.id);
      maps.hashtagByName.set(key, id);
      return id;
    } catch {
      const found = (await dest('hashtags').whereRaw('lower(name) = ?', [key]).first()) as
        | { id: unknown }
        | undefined;
      if (!found) return null;
      const id = asId(found.id);
      maps.hashtagByName.set(key, id);
      return id;
    }
  };

  for (const r of rows) {
    const postId = maps.posts.get(String(r.id));
    if (!postId) continue;
    const tags = Array.isArray(r.tags) ? r.tags : [];
    for (const tag of tags) {
      const value = String(tag ?? '').trim();
      if (!value) continue;
      if (isUuid(value)) {
        const userId = maps.users.get(value);
        if (!userId) continue;
        const key = `${postId}|${userId}`;
        if (seenUser.has(key)) continue;
        seenUser.add(key);
        userTagInsert.push({ post_id: postId, user_id: userId });
        continue;
      }
      const hid = await ensureHashtag(value);
      if (!hid) continue;
      const key = `${postId}|${hid}`;
      if (seenTag.has(key)) continue;
      seenTag.add(key);
      tagInsert.push({ post_id: postId, hashtag_id: hid });
    }
    const caption = String(r.caption ?? '');
    for (const match of caption.matchAll(/#([A-Za-z0-9_]{2,100})/g)) {
      const hid = await ensureHashtag(match[1]!);
      if (!hid) continue;
      const key = `${postId}|${hid}`;
      if (seenTag.has(key)) continue;
      seenTag.add(key);
      tagInsert.push({ post_id: postId, hashtag_id: hid });
    }
  }
  await insertBatched(dest, 'post_hashtags', tagInsert, 'post_hashtags');
  await insertBatched(dest, 'post_user_tags', userTagInsert, 'post_user_tags');
}

async function syncPolls(source: Knex, dest: Knex): Promise<void> {
  maps.polls = await existingUuidMap(dest, 'post_polls');
  const polls = (await src(source, 'polls').select('*')) as Array<Record<string, unknown>>;
  const insert: Record<string, unknown>[] = [];
  for (const r of polls) {
    const uuid = String(r.id);
    const postId = maps.posts.get(String(r.post_id));
    if (!postId || maps.polls.has(uuid)) continue;
    insert.push({
      uuid,
      post_id: postId,
      total_votes: Number(r.total_votes) || 0,
      created_at: tsOrNow(r.created_at),
      updated_at: tsOrNow(r.updated_at),
    });
  }
  await insertBatched(dest, 'post_polls', insert, 'post_polls');
  maps.polls = await existingUuidMap(dest, 'post_polls');

  maps.pollOptions = await existingUuidMap(dest, 'post_poll_options');
  const options = (await src(source, 'poll_options').select('*')) as Array<Record<string, unknown>>;
  const optInsert: Record<string, unknown>[] = [];
  for (const r of options) {
    const uuid = String(r.id);
    const pollId = maps.polls.get(String(r.poll_id));
    if (!pollId || maps.pollOptions.has(uuid)) continue;
    optInsert.push({
      uuid,
      poll_id: pollId,
      option_text: requiredClip(r.option_text, 255, 'Option'),
      position: Number(r.position) || 0,
      votes_count: Number(r.votes_count) || 0,
      created_at: tsOrNow(r.created_at),
      updated_at: tsOrNow(r.updated_at),
    });
  }
  await insertBatched(dest, 'post_poll_options', optInsert, 'post_poll_options');
  maps.pollOptions = await existingUuidMap(dest, 'post_poll_options');

  await syncPairTable(source, dest, 'poll_votes', 'post_poll_votes', (r) => {
    const pollId = maps.polls.get(String(r.poll_id));
    const optionId = maps.pollOptions.get(String(r.poll_option_id));
    const userId = maps.users.get(String(r.user_id));
    if (!pollId || !optionId || !userId) return null;
    return { poll_id: pollId, option_id: optionId, user_id: userId, created_at: tsOrNow(r.created_at) };
  });
}

async function syncPostGifts(source: Knex, dest: Knex): Promise<void> {
  const existing = await existingUuidMap(dest, 'post_gifts');
  const rows = (await src(source, 'post_gifts').select('*')) as Array<Record<string, unknown>>;
  const insert: Record<string, unknown>[] = [];
  for (const r of rows) {
    const uuid = String(r.id);
    const postId = maps.posts.get(String(r.post_id));
    const userId = maps.users.get(String(r.sender_id));
    if (!postId || !userId || existing.has(uuid)) continue;
    const giftType = maps.giftTypeBySourceId.get(String(r.gift_id));
    insert.push({
      uuid,
      post_id: postId,
      user_id: userId,
      gift_type: giftType ?? `gift_${r.gift_id}`,
      quantity: 1,
      amount: r.coins_used ?? r.gift_amount_usd ?? null,
      currency: 'coin',
      meta: {
        receiverId: r.receiver_id ?? null,
        sourceGiftId: r.gift_id ?? null,
      },
      created_at: tsOrNow(r.created_at),
      updated_at: tsOrNow(r.created_at),
    });
  }
  await insertBatched(dest, 'post_gifts', insert, 'post_gifts');
}

async function syncProfileViewers(source: Knex, dest: Knex): Promise<void> {
  const existing = await existingUuidMap(dest, 'profile_viewers');
  const rows = (await src(source, 'profile_viewers').select('*')) as Array<Record<string, unknown>>;
  const insert: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const uuid = String(r.id);
    const userId = maps.users.get(String(r.user_id));
    const viewerId = maps.users.get(String(r.viewer_id));
    if (!userId || !viewerId || existing.has(uuid)) continue;
    const pair = `${userId}|${viewerId}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    insert.push({
      uuid,
      user_id: userId,
      viewer_id: viewerId,
      created_at: tsOrNow(r.created_at),
      updated_at: tsOrNow(r.updated_at),
    });
  }
  await insertBatched(dest, 'profile_viewers', insert, 'profile_viewers');
}

async function syncHelpRequests(source: Knex, dest: Knex): Promise<void> {
  const existing = await existingUuidMap(dest, 'help_requests');
  const rows = (await src(source, 'help_requests').select('*')) as Array<Record<string, unknown>>;
  const insert: Record<string, unknown>[] = [];
  for (const r of rows) {
    const uuid = String(r.id);
    const userId = maps.users.get(String(r.user_id));
    if (!userId || existing.has(uuid)) continue;
    insert.push({
      uuid,
      user_id: userId,
      name: requiredClip(r.name, 120, 'User'),
      mobile: requiredClip(r.mobile, 32, '-'),
      email: requiredClip(r.email, 255, 'unknown@invalid.local'),
      type: requiredClip(r.type, 64, 'other'),
      description: String(r.description ?? '').trim() || '-',
      created_at: tsOrNow(r.created_at),
      updated_at: tsOrNow(r.updated_at),
    });
  }
  await insertBatched(dest, 'help_requests', insert, 'help_requests');
}

async function syncVerifications(source: Knex, dest: Knex): Promise<void> {
  const existing = await existingUuidMap(dest, 'request_verifications');
  const rows = (await src(source, '_request_verifications')
    .select('*')
    .orderBy('createdAt', 'asc')) as Array<Record<string, unknown>>;
  const pendingByUser = new Set<string>();
  const insert: Record<string, unknown>[] = [];
  for (const r of rows) {
    const uuid = String(r.id);
    const userId = maps.users.get(String(r.user_id));
    if (!userId || existing.has(uuid)) continue;
    let status = clip(r.status, 32) ?? 'Submitted';
    if (!['Submitted', 'Viewed', 'Approved', 'Rejected'].includes(status)) {
      status = 'Submitted';
    }
    if ((status === 'Submitted' || status === 'Viewed') && pendingByUser.has(userId)) {
      continue;
    }
    if (status === 'Submitted' || status === 'Viewed') pendingByUser.add(userId);
    insert.push({
      uuid,
      user_id: userId,
      full_name: requiredClip(r.full_name, 120, 'User'),
      document_type: requiredClip(r.document_type, 64, 'id'),
      document_url: String(r.document_url ?? '').trim() || '-',
      category: requiredClip(r.category, 64, 'other'),
      nationality_code: requiredClip(r.nationality, 16, 'XX'),
      nationality_name: requiredClip(r.nationality, 120, ''),
      audience: r.audience ?? null,
      also_known_as: clip(r.industry_type, 255),
      links: r.links ?? [],
      status,
      comments: r.comments ?? null,
      submitted_at: ts(r.submitted_at) ?? tsOrNow(r.createdAt),
      approved_at: ts(r.approved_at),
      approved_by: clip(r.approved_by, 120),
      rejected_at: ts(r.rejected_at),
      rejected_by: clip(r.rejected_by, 120),
      deleted_at: ts(r.deletedAt),
      created_at: tsOrNow(r.createdAt),
      updated_at: tsOrNow(r.updatedAt),
    });
  }
  await insertBatched(dest, 'request_verifications', insert, 'request_verifications');
}

async function syncVerifiedBadgesFromRequests(dest: Knex): Promise<void> {
  const updated = await dest.raw(`
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
  const n = Number(updated?.rowCount ?? 0);
  if (n) console.log(`  user_details is_verified backfill: ${n}`);
}

async function syncSettings(source: Knex, dest: Knex): Promise<void> {
  const privacy = (await src(source, 'user_privacy_settings').select('*')) as Array<
    Record<string, unknown>
  >;
  const visInsert: Record<string, unknown>[] = [];
  const visSeen = new Set(
    ((await dest('user_visibility_settings').select('user_id')) as Array<{ user_id: unknown }>).map(
      (r) => String(r.user_id),
    ),
  );
  for (const r of privacy) {
    const userId = maps.users.get(String(r.user_id));
    if (!userId || visSeen.has(userId)) continue;
    visSeen.add(userId);
    visInsert.push({
      uuid: isUuid(r.id) ? String(r.id) : randomUUID(),
      user_id: userId,
      online_visibility: clip(r.online_visibility, 32) ?? 'everyone',
      last_seen_visibility: clip(r.last_seen_visibility, 32) ?? 'everyone',
      blocked_users: r.blocked_users ?? [],
      created_at: tsOrNow(r.created_at),
      updated_at: tsOrNow(r.updated_at),
    });
  }
  await insertBatched(dest, 'user_visibility_settings', visInsert, 'user_visibility_settings');

  const ff = (await src(source, 'follower_following_settings').select('*')) as Array<
    Record<string, unknown>
  >;
  const ffInsert: Record<string, unknown>[] = [];
  const ffSeen = new Set(
    (
      (await dest('followers_following_privacy_settings').select('user_id')) as Array<{
        user_id: unknown;
      }>
    ).map((r) => String(r.user_id)),
  );
  for (const r of ff) {
    const userId = maps.users.get(String(r.user_id));
    if (!userId || ffSeen.has(userId)) continue;
    ffSeen.add(userId);
    ffInsert.push({
      uuid: isUuid(r.id) ? String(r.id) : randomUUID(),
      user_id: userId,
      hide_followers_and_following: bool(r.hide_followers_and_following, false),
      created_at: tsOrNow(r.created_at),
      updated_at: tsOrNow(r.updated_at),
    });
  }
  await insertBatched(dest, 'followers_following_privacy_settings', ffInsert, 'followers_following_privacy_settings');

  const stories = (await src(source, 'story_settings').select('*')) as Array<Record<string, unknown>>;
  const stInsert: Record<string, unknown>[] = [];
  const stSeen = new Set(
    ((await dest('story_settings').select('user_id')) as Array<{ user_id: unknown }>).map((r) =>
      String(r.user_id),
    ),
  );
  for (const r of stories) {
    const userId = maps.users.get(String(r.user_id));
    if (!userId || stSeen.has(userId)) continue;
    stSeen.add(userId);
    const only = Array.isArray(r.only_share_with_people)
      ? (r.only_share_with_people as string[])
          .map((id) => maps.users.get(String(id)))
          .filter(Boolean)
      : [];
    stInsert.push({
      uuid: isUuid(r.id) ? String(r.id) : randomUUID(),
      user_id: userId,
      view_stories_permission: clip(r.view_stories_permission, 50) ?? 'everyone',
      only_share_with_peoples: only,
      save_to_camera_roll: bool(r.save_to_camera_roll, true),
      message_replies_permission: clip(r.message_replies_permission, 50) ?? 'everyone',
      save_to_archive: bool(r.save_to_archive, true),
      allow_sharing: bool(r.allow_sharing, true),
      created_at: tsOrNow(r.created_at),
      updated_at: tsOrNow(r.updated_at),
    });
  }
  await insertBatched(dest, 'story_settings', stInsert, 'story_settings');

  if (await dumpHas( 'comment_settings')) {
    const cs = (await src(source, 'comment_settings').select('*')) as Array<Record<string, unknown>>;
    const csInsert: Record<string, unknown>[] = [];
    const csSeen = new Set(
      ((await dest('comment_settings').select('user_id')) as Array<{ user_id: unknown }>).map((r) =>
        String(r.user_id),
      ),
    );
    let csUpdated = 0;
    for (const r of cs) {
      const userId = maps.users.get(String(r.user_id));
      if (!userId) continue;
      const patch = {
        allow_comments_permission: clip(r.allow_comments_permission, 50) ?? 'everyone',
        hide_offensive_comments: bool(r.hide_offensive_comments, true),
        enable_manual_filters: bool(r.enable_manual_filters, false),
        updated_at: tsOrNow(r.updated_at),
      };
      if (csSeen.has(userId)) {
        await dest('comment_settings').where({ user_id: userId }).update(patch);
        csUpdated += 1;
        continue;
      }
      csSeen.add(userId);
      csInsert.push({
        uuid: isUuid(r.id) ? String(r.id) : randomUUID(),
        user_id: userId,
        ...patch,
        created_at: tsOrNow(r.created_at),
      });
    }
    await insertBatched(dest, 'comment_settings', csInsert, 'comment_settings');
    if (csUpdated) console.log(`  comment_settings updated: ${csUpdated}`);
  }

  if (await dumpHas( 'message_privacy_settings')) {
    const ms = (await src(source, 'message_privacy_settings').select('*')) as Array<
      Record<string, unknown>
    >;
    const msInsert: Record<string, unknown>[] = [];
    const msSeen = new Set(
      ((await dest('message_privacy_settings').select('user_id')) as Array<{ user_id: unknown }>).map(
        (r) => String(r.user_id),
      ),
    );
    for (const r of ms) {
      const userId = maps.users.get(String(r.user_id));
      if (!userId || msSeen.has(userId)) continue;
      msSeen.add(userId);
      msInsert.push({
        uuid: isUuid(r.id) ? String(r.id) : randomUUID(),
        user_id: userId,
        message_privacy: bool(r.message_privacy, true),
        allow_message_requests: clip(r.allow_message_requests, 50) ?? 'everyone',
        allow_group_adds: clip(r.allow_group_adds, 50) ?? 'everyone',
        read_receipts: bool(r.read_receipts, true),
        created_at: tsOrNow(r.created_at),
        updated_at: tsOrNow(r.updated_at),
      });
    }
    await insertBatched(dest, 'message_privacy_settings', msInsert, 'message_privacy_settings');
  }
}

async function syncWallets(source: Knex, dest: Knex): Promise<void> {
  const existing = new Set(
    ((await dest('wallets').select('user_id')) as Array<{ user_id: unknown }>).map((r) =>
      String(r.user_id),
    ),
  );
  const rows = (await src(source, 'wallets').select('*')) as Array<Record<string, unknown>>;
  const insert: Record<string, unknown>[] = [];
  const covered = new Set<string>();
  for (const r of rows) {
    const userId = maps.users.get(String(r.user_id));
    if (!userId || existing.has(userId) || covered.has(userId)) continue;
    covered.add(userId);
    const available = Math.max(0, Number(r.balance_usd_cents) || 0);
    const earned = Math.max(0, Number(r.withdrawable_balance_cents) || Number(r.pending_usd_cents) || 0);
    insert.push({
      uuid: isUuid(r.id) ? String(r.id) : randomUUID(),
      user_id: userId,
      available_coins: available,
      earned_coins: earned,
      currency: clip(r.currency, 16) ?? 'coin',
      created_at: tsOrNow(r.created_at),
      updated_at: tsOrNow(r.updated_at),
    });
  }
  for (const userId of maps.users.values()) {
    if (existing.has(userId) || covered.has(userId)) continue;
    insert.push({
      uuid: randomUUID(),
      user_id: userId,
      available_coins: 0,
      earned_coins: 0,
      currency: 'coin',
    });
  }
  await insertBatched(dest, 'wallets', insert, 'wallets');
}

async function syncNotifications(source: Knex, dest: Knex): Promise<void> {
  const existing = await existingUuidMap(dest, 'notifications');
  const rows = (await src(source, '_notifications').select('*')) as Array<Record<string, unknown>>;
  const insert: Record<string, unknown>[] = [];
  for (const r of rows) {
    const uuid = String(r.id);
    const userId = maps.users.get(String(r.user_id));
    if (!userId || existing.has(uuid)) continue;
    const mapped = mapNotifType(r.type);
    const actorId = r.contextual_user_id ? maps.users.get(String(r.contextual_user_id)) : null;
    const postId = r.post_id ? maps.posts.get(String(r.post_id)) : null;
    const commentId = r.comment_id ? maps.comments.get(String(r.comment_id)) : null;
    insert.push({
      uuid,
      user_id: userId,
      actor_id: actorId ?? null,
      type: mapped.type,
      entity_type: mapped.entityType,
      entity_id: commentId ?? postId ?? null,
      is_read: bool(r.read, false),
      created_at: tsOrNow(r.createdAt),
      updated_at: tsOrNow(r.updatedAt),
    });
  }
  await insertBatched(dest, 'notifications', insert, 'notifications');
}

async function syncReports(source: Knex, dest: Knex): Promise<void> {
  if (await dumpHas( 'posts_reports')) {
    const existing = await existingUuidMap(dest, 'post_reports');
    const rows = (await src(source, 'posts_reports').select('*')) as Array<Record<string, unknown>>;
    const insert: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const uuid = String(r.id);
      const postId = maps.posts.get(String(r.post_id));
      const reporterId = maps.users.get(String(r.reported_by));
      if (!postId || !reporterId || existing.has(uuid)) continue;
      const pair = `${reporterId}|${postId}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      insert.push({
        uuid,
        reporter_id: reporterId,
        post_id: postId,
        reason: clip(r.reason ?? r.type, 64),
        details: r.reason ?? null,
        status: 'open',
        deleted_at: ts(r.deletedAt),
        created_at: tsOrNow(r.createdAt),
        updated_at: tsOrNow(r.updatedAt),
      });
    }
    await insertBatched(dest, 'post_reports', insert, 'post_reports');
  }

  if (await dumpHas( '_users_reports')) {
    const existing = await existingUuidMap(dest, 'user_reports');
    const rows = (await src(source, '_users_reports').select('*')) as Array<Record<string, unknown>>;
    const insert: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const uuid = String(r.id);
      const reporterId = maps.users.get(String(r.reported_by));
      const reportedId = maps.users.get(String(r.user_id));
      if (!reporterId || !reportedId || reporterId === reportedId || existing.has(uuid)) continue;
      const pair = `${reporterId}|${reportedId}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      insert.push({
        uuid,
        reporter_id: reporterId,
        reported_user_id: reportedId,
        reason: clip(r.reason ?? r.type, 64) ?? 'OTHER',
        details: r.reason ?? null,
        status: 'open',
        created_at: tsOrNow(r.createdAt),
        updated_at: tsOrNow(r.updatedAt),
      });
    }
    await insertBatched(dest, 'user_reports', insert, 'user_reports');
  }
}

async function syncUserFeed(dest: Knex): Promise<void> {
  console.log('  building user_feed…');
  const posts = (await dest('posts')
    .whereNull('deleted_at')
    .where({ is_draft: false, is_archived: false })
    .select('id', 'user_id', 'type', 'privacy', 'created_at')) as Array<{
    id: unknown;
    user_id: unknown;
    type: string;
    privacy: string;
    created_at: Date;
  }>;
  const follows = (await dest('follows')
    .whereNull('deleted_at')
    .where({ status: 'follow' })
    .select('follower_id', 'following_id')) as Array<{
    follower_id: unknown;
    following_id: unknown;
  }>;
  const followersOf = new Map<string, string[]>();
  for (const f of follows) {
    const author = String(f.following_id);
    const list = followersOf.get(author) ?? [];
    list.push(String(f.follower_id));
    followersOf.set(author, list);
  }

  const insert: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const push = (userId: string, postId: string, authorId: string, type: string, source: string, createdAt: Date) => {
    const key = `${userId}|${postId}`;
    if (seen.has(key)) return;
    seen.add(key);
    const contentType = postType(type);
    insert.push({
      user_id: userId,
      post_id: postId,
      author_id: authorId,
      content_type: contentType,
      source,
      created_at: createdAt,
    });
  };

  for (const p of posts) {
    const postId = String(p.id);
    const authorId = String(p.user_id);
    push(authorId, postId, authorId, p.type, 'own', p.created_at);
    if (p.privacy === 'public' || p.privacy === 'followers') {
      for (const follower of followersOf.get(authorId) ?? []) {
        push(follower, postId, authorId, p.type, 'follow', p.created_at);
      }
    }
  }
  await insertBatched(dest, 'user_feed', insert, 'user_feed');
}

async function recountStats(dest: Knex): Promise<void> {
  console.log('  recounting user_stats / post_stats / hashtags…');
  await dest.raw(`
    UPDATE user_stats us SET
      post_count = COALESCE((
        SELECT COUNT(*) FROM posts
        WHERE user_id = us.user_id AND type = 'post' AND deleted_at IS NULL AND is_draft = false
      ), 0),
      reel_count = COALESCE((
        SELECT COUNT(*) FROM posts
        WHERE user_id = us.user_id AND type = 'reel' AND deleted_at IS NULL AND is_draft = false
      ), 0),
      follower_count = COALESCE((
        SELECT COUNT(*) FROM follows
        WHERE following_id = us.user_id AND deleted_at IS NULL AND status = 'follow'
      ), 0),
      following_count = COALESCE((
        SELECT COUNT(*) FROM follows
        WHERE follower_id = us.user_id AND deleted_at IS NULL AND status = 'follow'
      ), 0),
      updated_at = NOW()
  `);

  await dest.raw(`
    UPDATE post_stats ps SET
      likes_count = COALESCE((SELECT COUNT(*) FROM post_likes WHERE post_id = ps.post_id AND deleted_at IS NULL), 0),
      dislikes_count = COALESCE((SELECT COUNT(*) FROM post_dislikes WHERE post_id = ps.post_id AND deleted_at IS NULL), 0),
      comments_count = COALESCE((SELECT COUNT(*) FROM post_comments WHERE post_id = ps.post_id AND deleted_at IS NULL), 0),
      shares_count = COALESCE((SELECT COUNT(*) FROM post_shares WHERE post_id = ps.post_id AND deleted_at IS NULL), 0),
      views_count = COALESCE((SELECT COUNT(*) FROM post_views WHERE post_id = ps.post_id), 0),
      gifts_count = COALESCE((SELECT COUNT(*) FROM post_gifts WHERE post_id = ps.post_id AND deleted_at IS NULL), 0),
      updated_at = NOW()
  `);

  await dest.raw(`
    UPDATE hashtags h SET post_count = COALESCE(x.n, 0), updated_at = NOW()
    FROM (
      SELECT hashtag_id, COUNT(*) n FROM post_hashtags GROUP BY hashtag_id
    ) x
    WHERE h.id = x.hashtag_id
  `);
  console.log('  recount done');
}

async function assertDestMigrated(dest: Knex, destName: string): Promise<void> {
  const required = [
    'users',
    'user_details',
    'countries',
    'posts',
    'post_medias',
    'follows',
    'wallets',
    'notifications',
    'user_feed',
  ];
  const missing: string[] = [];
  for (const table of required) {
    if (!(await tableExists(dest, 'public', table))) missing.push(table);
  }
  if (!missing.length) return;
  throw new Error(
    `Dest database "${destName}" is missing tables: ${missing.join(', ')}.\n` +
      `Run migrations first on this same .env (DB_NAME=${destName}):\n` +
      `  npm run db:migrate\n` +
      `Then sync:\n` +
      `  npm run db:sync:onevibeapp`,
  );
}

export type OnevibeappSyncOptions = {
  dest?: Knex;
  fresh?: boolean;
  fromDb?: boolean;
};

export async function runOnevibeappSync(options: OnevibeappSyncOptions = {}): Promise<void> {
  const fresh = options.fresh ?? process.argv.includes('--fresh');
  const fromDb = options.fromDb ?? process.argv.includes('--from-db');

  sourceKind = fromDb ? 'db' : 'json';
  const destOwned = !options.dest;
  const destConn = pgConnection();
  const dest = options.dest ?? makeKnex(destConn);
  let source: Knex = dest;
  let sourceOwned = false;
  const started = Date.now();

  console.log(`Dest: ${destConn.user}@${destConn.host}:${destConn.port}/${destConn.database}`);
  if (fresh) console.log('Mode: --fresh (wipe dest user data first)');

  try {
    await dest.raw('select 1');
    await assertDestMigrated(dest, destConn.database);

    if (sourceKind === 'db') {
      const srcConn = sourceDbConnection();
      if (
        srcConn.database === destConn.database &&
        srcConn.host === destConn.host &&
        srcConn.port === destConn.port
      ) {
        throw new Error(
          `SOURCE_DB_NAME (${srcConn.database}) is the same as DB_NAME. Set SOURCE_DB_NAME=onevibeapp`,
        );
      }
      source = makeKnex(srcConn);
      sourceOwned = true;
      liveSource = source;
      await source.raw('select 1');
      sourceSchemaName = (process.env.SOURCE_DB_SCHEMA || '').trim() || (await resolveSourceSchema(source));
      console.log(`Source: ${srcConn.user}@${srcConn.host}:${srcConn.port}/${srcConn.database}`);
      await assertLiveSource(source, srcConn.database, sourceSchemaName);
    } else {
      liveSource = null;
      await assertDumpPresent();
    }

    if (fresh) await freshWipe(dest);

    await syncCountries(source, dest);
    await syncCoinPackages(source, dest);
    await syncGifts(source, dest);
    await syncUsers(source, dest);
    await syncUserDetails(source, dest);
    await syncUserStats(dest);
    await syncOauth(source, dest);
    await syncDevices(source, dest);
    await syncNotificationSettings(source, dest);
    await syncFollows(source, dest);
    await syncBlocks(source, dest);
    await syncHashtags(source, dest);
    await syncPosts(source, dest);
    await syncPostMedias(source, dest);
    await syncPostStats(source, dest);
    await syncEngagement(source, dest);
    await syncComments(source, dest);
    await syncHashtagLinks(source, dest);
    await syncPolls(source, dest);
    await syncPostGifts(source, dest);
    await syncProfileViewers(source, dest);
    await syncHelpRequests(source, dest);
    await syncVerifications(source, dest);
    await syncVerifiedBadgesFromRequests(dest);
    await syncSettings(source, dest);
    await syncWallets(source, dest);
    await syncNotifications(source, dest);
    await syncReports(source, dest);
    await syncUserFeed(dest);
    await recountStats(dest);

    const users = await dest('users').count<{ count: string }>('id as count').first();
    const posts = await dest('posts').count<{ count: string }>('id as count').first();
    const comments = await dest('post_comments').count<{ count: string }>('id as count').first();
    console.log(
      `\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s — dest users=${users?.count ?? 0}, posts=${posts?.count ?? 0}, comments=${comments?.count ?? 0}`,
    );
  } finally {
    liveSource = null;
    if (sourceOwned) await source.destroy();
    if (destOwned) await dest.destroy();
  }
}

const isCli = process.argv[1]?.includes('sync-from-onevibeapp');
if (isCli) {
  runOnevibeappSync().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
