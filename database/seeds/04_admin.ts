/**
 * Staff admin seeder.
 *
 *   npm run db:seed:admin
 *
 * Login: admin@onevibe.ai / password
 * Role:  super_admin
 */
import { randomBytes, randomUUID, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import type { Knex } from 'knex';

const scryptAsync = promisify(scrypt);

const ADMIN_EMAIL = 'admin@onevibe.ai';
const ADMIN_PASSWORD = 'password';
const ADMIN_FULL_NAME = 'Super Admin';
const ROLE_KEY = 'super_admin';

export async function seed(knex: Knex): Promise<void> {
  const role = await knex('admin_roles')
    .where({ key: ROLE_KEY })
    .whereNull('deleted_at')
    .first<{ id: string | number }>('id');

  if (!role) {
    throw new Error(
      `Role "${ROLE_KEY}" is missing — run migrations first (npm run db:migrate)`,
    );
  }

  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(ADMIN_PASSWORD, salt, 64)) as Buffer;
  const passwordHash = derived.toString('hex');

  const existing = await knex('admins')
    .where({ email: ADMIN_EMAIL })
    .whereNull('deleted_at')
    .first<{ id: string | number }>('id');

  let adminId: string | number;

  if (existing) {
    await knex('admins').where({ id: existing.id }).update({
      password: passwordHash,
      salt,
      full_name: ADMIN_FULL_NAME,
      status: 'active',
      updated_at: knex.fn.now(),
    });
    adminId = existing.id;
  } else {
    const [row] = await knex('admins')
      .insert({
        uuid: randomUUID(),
        email: ADMIN_EMAIL,
        password: passwordHash,
        salt,
        full_name: ADMIN_FULL_NAME,
        status: 'active',
      })
      .returning(['id']);
    adminId = row.id;
  }

  await knex('admin_role_assignments')
    .insert({
      admin_id: adminId,
      role_id: role.id,
      assigned_by: null,
    })
    .onConflict(['admin_id', 'role_id'])
    .ignore();

  console.log(
    `Seeded admin ${ADMIN_EMAIL} / ${ADMIN_PASSWORD} (role: ${ROLE_KEY})`,
  );
}
