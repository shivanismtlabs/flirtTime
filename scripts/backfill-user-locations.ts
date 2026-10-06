/**
 * Backfill lat/lng for users missing location so people-search radius filter works.
 * Hub: Indore (matches typical device test coords).
 */
import knex from 'knex';
import cfg from '../knexfile.ts';

const db = knex(cfg.development);
const hubLat = 22.748;
const hubLng = 75.89;

const rows = await db('user_details')
  .whereNull('deleted_at')
  .where((qb) => {
    qb.whereNull('latitude').orWhereNull('longitude');
  })
  .select('id');

console.log(`Backfilling ${rows.length} users…`);

for (let i = 0; i < rows.length; i++) {
  const angle = (i * 2.399) % (Math.PI * 2);
  const radiusDeg = 0.02 + (i % 17) * 0.012;
  await db('user_details')
    .where({ id: rows[i]!.id })
    .update({
      location_permission: true,
      latitude: hubLat + Math.cos(angle) * radiusDeg,
      longitude: hubLng + Math.sin(angle) * radiusDeg,
      updated_at: db.fn.now(),
    });
}

const distSql = `(6371 * 2 * ASIN(SQRT(
  POWER(SIN(RADIANS(latitude - ?::float8) / 2), 2) +
  COS(RADIANS(?::float8)) * COS(RADIANS(latitude)) *
  POWER(SIN(RADIANS(longitude - ?::float8) / 2), 2)
)))`;

const within = await db('user_details')
  .whereNull('deleted_at')
  .whereNotNull('latitude')
  .whereNotNull('longitude')
  .whereRaw(`${distSql} <= ?`, [hubLat, hubLat, hubLng, 25])
  .count('* as c')
  .first();

const indianNear = await db('user_details')
  .whereNull('deleted_at')
  .whereRaw('LOWER(TRIM(nationality)) = ?', ['indian'])
  .whereNotNull('latitude')
  .whereNotNull('longitude')
  .whereRaw(`${distSql} <= ?`, [hubLat, hubLat, hubLng, 25])
  .count('* as c')
  .first();

console.log('within 25km of Indore', within?.c);
console.log('Indian within 25km', indianNear?.c);
await db.destroy();
