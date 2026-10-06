import type { Knex } from 'knex';

/**
 * Admin staff RBAC (separate from app `users`).
 *
 * Tables:
 * - admins                  — staff login accounts (email + password)
 * - admin_roles             — named roles (e.g. super_admin, wallet_manager)
 * - admin_permissions       — fine-grained permission keys
 * - admin_role_permissions  — role ↔ permission
 * - admin_role_assignments  — admin ↔ role
 */

const PERMISSIONS: Array<{ key: string; name: string; description: string; group: string }> = [
  {
    key: 'admin.admins.read',
    name: 'View admins',
    description: 'List and view staff admin accounts',
    group: 'admin',
  },
  {
    key: 'admin.admins.manage',
    name: 'Manage admins',
    description: 'Create, update, deactivate staff admin accounts',
    group: 'admin',
  },
  {
    key: 'admin.roles.read',
    name: 'View roles',
    description: 'List roles and their permissions',
    group: 'admin',
  },
  {
    key: 'admin.roles.manage',
    name: 'Manage roles',
    description: 'Create/update roles and assign permissions',
    group: 'admin',
  },
  {
    key: 'wallet.settings.read',
    name: 'View wallet settings',
    description: 'Read payment / withdraw fee settings',
    group: 'wallet',
  },
  {
    key: 'wallet.settings.update',
    name: 'Update wallet settings',
    description: 'Update payment / withdraw fee settings',
    group: 'wallet',
  },
  {
    key: 'wallet.withdrawals.read',
    name: 'View withdrawals',
    description: 'List and view user withdraw requests',
    group: 'wallet',
  },
  {
    key: 'wallet.withdrawals.process',
    name: 'Process withdrawals',
    description: 'Approve, reject, mark paid, or cancel withdraw requests',
    group: 'wallet',
  },
];

const ROLES: Array<{
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissionKeys: string[] | '*';
}> = [
  {
    key: 'super_admin',
    name: 'Super Admin',
    description: 'Full access to all admin permissions',
    isSystem: true,
    permissionKeys: '*',
  },
  {
    key: 'wallet_manager',
    name: 'Wallet Manager',
    description: 'Manage wallet settings and process withdrawals',
    isSystem: true,
    permissionKeys: [
      'wallet.settings.read',
      'wallet.settings.update',
      'wallet.withdrawals.read',
      'wallet.withdrawals.process',
    ],
  },
  {
    key: 'wallet_viewer',
    name: 'Wallet Viewer',
    description: 'Read-only wallet settings and withdrawals',
    isSystem: true,
    permissionKeys: ['wallet.settings.read', 'wallet.withdrawals.read'],
  },
];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('admins', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table.string('email', 255).notNullable();
    table.string('password', 255).notNullable();
    table.string('salt', 255).notNullable();
    table.string('full_name', 120).notNullable();
    table.string('status', 32).notNullable().defaultTo('active'); // active | suspended | invited
    table.timestamp('last_login_at', { useTz: true }).nullable();

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['status'], 'admins_status_idx');
    table.index(['deleted_at'], 'admins_deleted_at_idx');
  });

  await knex.raw(`
    CREATE UNIQUE INDEX admins_uuid_active_uidx
      ON admins (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX admins_email_active_uidx
      ON admins (email)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    ALTER TABLE admins
      ADD CONSTRAINT admins_status_check
      CHECK (status IN ('active', 'suspended', 'invited'))
  `);
  await knex.raw(`
    COMMENT ON TABLE admins IS
      'Staff admin login accounts — separate from app users';
  `);

  await knex.schema.createTable('admin_roles', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table.string('key', 64).notNullable();
    table.string('name', 120).notNullable();
    table.string('description', 500).nullable();
    table.boolean('is_system').notNullable().defaultTo(false);
    table.boolean('is_active').notNullable().defaultTo(true);

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX admin_roles_uuid_active_uidx
      ON admin_roles (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX admin_roles_key_active_uidx
      ON admin_roles (key)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    COMMENT ON TABLE admin_roles IS
      'Named admin roles (super_admin, wallet_manager, …)';
  `);

  await knex.schema.createTable('admin_permissions', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table.string('key', 128).notNullable();
    table.string('name', 120).notNullable();
    table.string('description', 500).nullable();
    table.string('group_key', 64).notNullable().defaultTo('general');
    table.boolean('is_active').notNullable().defaultTo(true);

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['key'], 'admin_permissions_key_uidx');
  });

  await knex.raw(`
    CREATE UNIQUE INDEX admin_permissions_uuid_uidx
      ON admin_permissions (uuid)
  `);
  await knex.raw(`
    COMMENT ON TABLE admin_permissions IS
      'Fine-grained admin permission keys (wallet.withdrawals.process, …)';
  `);

  await knex.schema.createTable('admin_role_permissions', (table) => {
    table.bigIncrements('id').primary();

    table
      .bigInteger('role_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('admin_roles')
      .onDelete('CASCADE');

    table
      .bigInteger('permission_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('admin_permissions')
      .onDelete('CASCADE');

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['role_id', 'permission_id'], 'admin_role_permissions_uidx');
    table.index(['permission_id'], 'admin_role_permissions_permission_idx');
  });

  await knex.schema.createTable('admin_role_assignments', (table) => {
    table.bigIncrements('id').primary();

    table
      .bigInteger('admin_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('admins')
      .onDelete('CASCADE');

    table
      .bigInteger('role_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('admin_roles')
      .onDelete('CASCADE');

    table
      .bigInteger('assigned_by')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('admins')
      .onDelete('SET NULL');

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['admin_id', 'role_id'], 'admin_role_assignments_uidx');
    table.index(['role_id'], 'admin_role_assignments_role_idx');
  });

  await knex.raw(`
    COMMENT ON TABLE admin_role_assignments IS
      'Which roles are assigned to which staff admin';
  `);

  // Seed permissions
  const permissionRows = PERMISSIONS.map((p) => ({
    uuid: knex.raw('gen_random_uuid()'),
    key: p.key,
    name: p.name,
    description: p.description,
    group_key: p.group,
    is_active: true,
  }));
  await knex('admin_permissions').insert(permissionRows);

  const allPermissions = await knex('admin_permissions').select('id', 'key');
  const permissionIdByKey = new Map(allPermissions.map((r) => [String(r.key), Number(r.id)]));

  // Seed roles + role_permissions
  for (const role of ROLES) {
    const [inserted] = await knex('admin_roles')
      .insert({
        uuid: knex.raw('gen_random_uuid()'),
        key: role.key,
        name: role.name,
        description: role.description,
        is_system: role.isSystem,
        is_active: true,
      })
      .returning(['id']);

    const roleId = Number(inserted.id);
    const keys =
      role.permissionKeys === '*'
        ? PERMISSIONS.map((p) => p.key)
        : role.permissionKeys;

    const links = keys
      .map((key) => permissionIdByKey.get(key))
      .filter((id): id is number => typeof id === 'number')
      .map((permissionId) => ({
        role_id: roleId,
        permission_id: permissionId,
      }));

    if (links.length > 0) {
      await knex('admin_role_permissions').insert(links);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('admin_role_assignments');
  await knex.schema.dropTableIfExists('admin_role_permissions');
  await knex.schema.dropTableIfExists('admin_permissions');
  await knex.schema.dropTableIfExists('admin_roles');
  await knex.schema.dropTableIfExists('admins');
}
