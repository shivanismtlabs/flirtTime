import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';

/**
 * Broad wallet admin permissions for the Wallet menu modules.
 */

const PERMS = [
  {
    key: 'wallet.read',
    name: 'View wallet module',
    description:
      'View wallet dashboard, wallets, transactions, deposits, transfers, reports',
    group: 'wallet',
  },
  {
    key: 'wallet.manage',
    name: 'Manage wallets',
    description: 'Manual credit/debit, freeze, adjustments, and wallet ops',
    group: 'wallet',
  },
] as const;

const ROLE_KEYS_TO_GRANT: Record<string, string[]> = {
  wallet_manager: ['wallet.read', 'wallet.manage'],
  wallet_viewer: ['wallet.read'],
};

export async function up(knex: Knex): Promise<void> {
  for (const p of PERMS) {
    const existing = await knex('admin_permissions')
      .where({ key: p.key })
      .first('id');
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

  for (const [roleKey, keys] of Object.entries(ROLE_KEYS_TO_GRANT)) {
    const role = await knex('admin_roles').where({ key: roleKey }).first('id');
    if (!role) continue;
    for (const key of keys) {
      const perm = await knex('admin_permissions').where({ key }).first('id');
      if (!perm) continue;
      const linked = await knex('admin_role_permissions')
        .where({ role_id: role.id, permission_id: perm.id })
        .first('id');
      if (!linked) {
        await knex('admin_role_permissions').insert({
          role_id: role.id,
          permission_id: perm.id,
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
