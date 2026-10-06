import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { newPublicId } from '../../shared/ids/index.js';
import type { AdminStatus } from './admin-auth.types.js';

type AdminRow = {
  id: string | number;
  uuid: string;
  email: string;
  password: string;
  salt: string;
  full_name: string;
  status: AdminStatus;
  last_login_at: Date | string | null;
  created_at: Date | string;
};

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

type AdminRefreshTokenRow = {
  id: string | number;
  uuid: string;
  admin_id: string | number;
  token_hash: string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
};

export class AdminAuthRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async countAdmins(): Promise<number> {
    const row = await this.db('admins')
      .whereNull('deleted_at')
      .count<{ count: string }>('id as count')
      .first();
    return Number(row?.count ?? 0);
  }

  async findByEmail(email: string): Promise<AdminRow | null> {
    const row = await this.db('admins')
      .where({ email })
      .whereNull('deleted_at')
      .first<AdminRow>();
    return row ?? null;
  }

  async findByUuid(uuid: string): Promise<AdminRow | null> {
    const row = await this.db('admins')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<AdminRow>();
    return row ?? null;
  }

  async findInternalIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('admins')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string | number }>('id');
    return row ? String(row.id) : null;
  }

  async createAdmin(input: {
    email: string;
    passwordHash: string;
    salt: string;
    fullName: string;
    status?: AdminStatus;
  }): Promise<AdminRow> {
    const [row] = await this.db('admins')
      .insert({
        uuid: newPublicId(),
        email: input.email,
        password: input.passwordHash,
        salt: input.salt,
        full_name: input.fullName,
        status: input.status ?? 'active',
      })
      .returning('*');
    return row as AdminRow;
  }

  async touchLastLogin(adminId: string | number): Promise<void> {
    await this.db('admins').where({ id: adminId }).update({
      last_login_at: this.db.fn.now(),
      updated_at: this.db.fn.now(),
    });
  }

  async listAdmins(): Promise<AdminRow[]> {
    return this.db('admins')
      .whereNull('deleted_at')
      .orderBy('created_at', 'asc')
      .select('*');
  }

  async updatePassword(
    adminId: string | number,
    passwordHash: string,
    salt: string,
  ): Promise<void> {
    await this.db('admins').where({ id: adminId }).update({
      password: passwordHash,
      salt,
      updated_at: this.db.fn.now(),
    });
  }

  async findRoleIdsByKeys(keys: string[]): Promise<Array<{ id: string; key: string }>> {
    if (keys.length === 0) return [];
    const rows = await this.db('admin_roles')
      .whereIn('key', keys)
      .where({ is_active: true })
      .whereNull('deleted_at')
      .select<{ id: string | number; key: string }[]>('id', 'key');
    return rows.map((r) => ({ id: String(r.id), key: r.key }));
  }

  async assignRoles(input: {
    adminId: string | number;
    roleIds: Array<string | number>;
    assignedBy?: string | number | null;
    replace?: boolean;
  }): Promise<void> {
    await this.db.transaction(async (trx) => {
      if (input.replace) {
        await trx('admin_role_assignments').where({ admin_id: input.adminId }).del();
      }
      if (input.roleIds.length === 0) return;
      await trx('admin_role_assignments')
        .insert(
          input.roleIds.map((roleId) => ({
            admin_id: input.adminId,
            role_id: roleId,
            assigned_by: input.assignedBy ?? null,
          })),
        )
        .onConflict(['admin_id', 'role_id'])
        .ignore();
    });
  }

  async listRolesForAdmin(
    adminId: string | number,
  ): Promise<Array<{ key: string; name: string }>> {
    return this.db('admin_role_assignments as ara')
      .join('admin_roles as r', 'r.id', 'ara.role_id')
      .where('ara.admin_id', adminId)
      .where('r.is_active', true)
      .whereNull('r.deleted_at')
      .select('r.key', 'r.name')
      .orderBy('r.key', 'asc');
  }

  async listPermissionKeysForAdmin(adminId: string | number): Promise<string[]> {
    const rows = (await this.db('admin_role_assignments as ara')
      .join('admin_role_permissions as arp', 'arp.role_id', 'ara.role_id')
      .join('admin_permissions as p', 'p.id', 'arp.permission_id')
      .join('admin_roles as r', 'r.id', 'ara.role_id')
      .where('ara.admin_id', adminId)
      .where('r.is_active', true)
      .whereNull('r.deleted_at')
      .where('p.is_active', true)
      .distinct('p.key')) as Array<{ key: string }>;
    return rows.map((r) => r.key).sort();
  }

  async adminHasPermission(
    adminId: string | number,
    permissionKey: string,
  ): Promise<boolean> {
    const row = await this.db('admin_role_assignments as ara')
      .join('admin_role_permissions as arp', 'arp.role_id', 'ara.role_id')
      .join('admin_permissions as p', 'p.id', 'arp.permission_id')
      .join('admin_roles as r', 'r.id', 'ara.role_id')
      .where('ara.admin_id', adminId)
      .where('r.is_active', true)
      .whereNull('r.deleted_at')
      .where('p.is_active', true)
      .where('p.key', permissionKey)
      .first('p.id');
    return Boolean(row);
  }

  async listRoles(): Promise<
    Array<{
      id: string;
      key: string;
      name: string;
      description: string | null;
      isSystem: boolean;
    }>
  > {
    const rows = await this.db('admin_roles')
      .where({ is_active: true })
      .whereNull('deleted_at')
      .orderBy('key', 'asc')
      .select('uuid', 'key', 'name', 'description', 'is_system');
    return rows.map((r) => ({
      id: String(r.uuid),
      key: String(r.key),
      name: String(r.name),
      description: r.description == null ? null : String(r.description),
      isSystem: Boolean(r.is_system),
    }));
  }

  async listPermissions(): Promise<
    Array<{
      id: string;
      key: string;
      name: string;
      description: string | null;
      group: string;
    }>
  > {
    const rows = await this.db('admin_permissions')
      .where({ is_active: true })
      .orderBy(['group_key', 'key'])
      .select('uuid', 'key', 'name', 'description', 'group_key');
    return rows.map((r) => ({
      id: String(r.uuid),
      key: String(r.key),
      name: String(r.name),
      description: r.description == null ? null : String(r.description),
      group: String(r.group_key),
    }));
  }

  async saveRefreshToken(data: {
    adminId: string | number;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string | null;
    ipAddress?: string | null;
  }): Promise<AdminRefreshTokenRow> {
    const [row] = await this.db('admin_refresh_tokens')
      .insert({
        uuid: newPublicId(),
        admin_id: data.adminId,
        token_hash: data.tokenHash,
        expires_at: data.expiresAt,
        user_agent: data.userAgent ?? null,
        ip_address: data.ipAddress ?? null,
      })
      .returning('*');
    return row as AdminRefreshTokenRow;
  }

  async findActiveRefreshToken(
    tokenHash: string,
  ): Promise<AdminRefreshTokenRow | undefined> {
    return this.db('admin_refresh_tokens')
      .where({ token_hash: tokenHash })
      .whereNull('revoked_at')
      .where('expires_at', '>', this.db.fn.now())
      .first();
  }

  async revokeRefreshToken(tokenHash: string): Promise<number> {
    const updated = await this.db('admin_refresh_tokens')
      .where({ token_hash: tokenHash })
      .whereNull('revoked_at')
      .update({
        revoked_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
    return Number(updated);
  }

  /** Revoke only if the token belongs to this admin (prevents cross-account revocation). */
  async revokeRefreshTokenForAdmin(
    adminId: string | number,
    tokenHash: string,
  ): Promise<number> {
    const updated = await this.db('admin_refresh_tokens')
      .where({
        token_hash: tokenHash,
        admin_id: adminId,
      })
      .whereNull('revoked_at')
      .update({
        revoked_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
    return Number(updated);
  }

  async revokeAllRefreshTokensForAdmin(
    adminId: string | number,
  ): Promise<number> {
    const updated = await this.db('admin_refresh_tokens')
      .where({ admin_id: adminId })
      .whereNull('revoked_at')
      .update({
        revoked_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
    return Number(updated);
  }

  toPublicBase(row: AdminRow): {
    id: string;
    email: string;
    fullName: string;
    status: AdminStatus;
    lastLoginAt: string | null;
    createdAt: string;
  } {
    return {
      id: String(row.uuid),
      email: row.email,
      fullName: row.full_name,
      status: row.status,
      lastLoginAt: toIso(row.last_login_at),
      createdAt: toIso(row.created_at)!,
    };
  }
}
