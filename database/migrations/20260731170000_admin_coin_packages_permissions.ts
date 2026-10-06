import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';

/**
 * Admin RBAC for coin packages management.
 */

const PERMS = [
  {
    key: 'coin_packages.read',
    name: 'View coin packages',
    description: 'List and view store coin packages',
    group: 'coin_packages',
  },
  {
    key: 'coin_packages.manage',
    name: 'Manage coin packages',
    description: 'Create, update, and deactivate coin packages',
    group: 'coin_packages',
  },
] as const;

export async function up(knex: Knex): Promise<void> {
  for (const p of PERMS) {
    const existing = await knex('admin_permissions').where({ key: p.key }).first('id');
    if (existing) continue;
    const [row] = await knex('admin_permissions')
      .insert({
        uuid: randomUUID(),
        key: p.key,
        name: p.name,
        description: p.description,
        group_key: p.group,
        is_active: true,
      })
      .returning('id');

    const superAdmin = await knex('admin_roles')
      .where({ key: 'super_admin' })
      .first('id');
    if (superAdmin && row?.id) {
      const linked = await knex('admin_role_permissions')
        .where({ role_id: superAdmin.id, permission_id: row.id })
        .first('id');
      if (!linked) {
        await knex('admin_role_permissions').insert({
          role_id: superAdmin.id,
          permission_id: row.id,
        });
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const keys = PERMS.map((p) => p.key);
  const rows = await knex('admin_permissions').whereIn('key', keys).select('id');
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    await knex('admin_role_permissions').whereIn('permission_id', ids).del();
    await knex('admin_permissions').whereIn('id', ids).del();
  }
}
