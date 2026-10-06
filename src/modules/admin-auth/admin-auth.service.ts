import { env } from '../../shared/config/index.js';
import { hashPassword, hashToken, verifyPassword } from '../../shared/crypto/index.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../shared/errors/index.js';
import { AdminAuthRepository } from './admin-auth.repository.js';
import type {
  AdminAssignRolesInput,
  AdminBootstrapInput,
  AdminChangePasswordInput,
  AdminCreateInput,
  AdminLoginInput,
  AdminLogoutInput,
  AdminRefreshInput,
} from './admin-auth.schema.js';
import type {
  AdminPublic,
  AdminTokenSigner,
  AdminTokens,
} from './admin-auth.types.js';

type RequestMeta = { userAgent?: string | null; ipAddress?: string | null };

function refreshExpiresAt(): Date {
  const raw = env.JWT_REFRESH_EXPIRES_IN;
  const match = /^(\d+)([smhd])$/.exec(raw);
  const now = Date.now();
  if (!match) {
    return new Date(now + 7 * 24 * 60 * 60 * 1000);
  }
  const n = Number(match[1]);
  const unit = match[2];
  const ms =
    unit === 's'
      ? n * 1000
      : unit === 'm'
        ? n * 60 * 1000
        : unit === 'h'
          ? n * 60 * 60 * 1000
          : n * 24 * 60 * 60 * 1000;
  return new Date(now + ms);
}

export class AdminAuthService {
  constructor(private readonly repo = new AdminAuthRepository()) {}

  async bootstrap(
    input: AdminBootstrapInput,
    signer: AdminTokenSigner,
    meta?: RequestMeta,
  ) {
    const count = await this.repo.countAdmins();
    if (count > 0) {
      throw new ConflictError('Admin bootstrap already completed');
    }
    const { hash, salt } = await hashPassword(input.password);
    const admin = await this.repo.createAdmin({
      email: input.email,
      passwordHash: hash,
      salt,
      fullName: input.fullName,
    });
    const roles = await this.repo.findRoleIdsByKeys(['super_admin']);
    if (roles.length === 0) {
      throw new ValidationError('super_admin role is missing — run migrations');
    }
    await this.repo.assignRoles({
      adminId: admin.id,
      roleIds: roles.map((r) => r.id),
      assignedBy: admin.id,
    });
    const profile = await this.buildPublic(admin.id, admin);
    const tokens = await this.issueTokens(admin, signer, meta);
    return { admin: profile, tokens };
  }

  async login(
    input: AdminLoginInput,
    signer: AdminTokenSigner,
    meta?: RequestMeta,
  ) {
    const admin = await this.repo.findByEmail(input.email);
    if (!admin) {
      throw new UnauthorizedError('Invalid email or password');
    }
    if (admin.status !== 'active') {
      throw new ForbiddenError('Admin account is not active');
    }
    const ok = await verifyPassword(input.password, admin.password, admin.salt);
    if (!ok) {
      throw new UnauthorizedError('Invalid email or password');
    }
    await this.repo.touchLastLogin(admin.id);
    const profile = await this.buildPublic(admin.id, admin);
    const tokens = await this.issueTokens(admin, signer, meta);
    return { admin: profile, tokens };
  }

  /** Verify + rotate a refresh token: revoke the old one, issue a fresh pair. */
  async refresh(
    input: AdminRefreshInput,
    signer: AdminTokenSigner,
    meta?: RequestMeta,
  ): Promise<AdminTokens> {
    let payload: ReturnType<AdminTokenSigner['verifyRefreshToken']>;
    try {
      payload = signer.verifyRefreshToken(input.refreshToken);
    } catch {
      throw new UnauthorizedError('Invalid refresh token');
    }
    if (payload.type && payload.type !== 'refresh') {
      throw new UnauthorizedError('Refresh token required');
    }
    if (payload.kind !== 'admin') {
      throw new UnauthorizedError('Admin refresh token required');
    }

    const tokenHash = hashToken(input.refreshToken);
    const stored = await this.repo.findActiveRefreshToken(tokenHash);
    if (!stored) {
      throw new UnauthorizedError('Refresh token revoked or expired');
    }

    const admin = await this.repo.findByUuid(payload.sub);
    if (!admin || admin.status !== 'active') {
      throw new UnauthorizedError('Admin not found or inactive');
    }

    await this.repo.revokeRefreshToken(tokenHash);
    return this.issueTokens(admin, signer, meta);
  }

  /**
   * End the current admin session: denylist happens in the controller
   * (needs raw JWT claims); here we revoke the refresh token so it can't
   * be exchanged again, optionally revoking every session for this admin.
   */
  async logout(
    adminUuid: string,
    input: AdminLogoutInput,
    signer: AdminTokenSigner,
  ): Promise<{ loggedOut: true; allDevices: boolean; refreshRevoked: boolean }> {
    const admin = await this.repo.findByUuid(adminUuid);
    if (!admin) throw new UnauthorizedError('Admin not found');

    const allDevices = Boolean(input.allDevices);
    let refreshRevoked = false;

    if (allDevices) {
      const n = await this.repo.revokeAllRefreshTokensForAdmin(admin.id);
      refreshRevoked = n > 0;
    } else {
      const refresh = input.refreshToken?.trim();
      if (refresh) {
        let ownerOk = false;
        try {
          const payload = signer.verifyRefreshToken(refresh);
          ownerOk = (!payload.type || payload.type === 'refresh') &&
            payload.sub === adminUuid;
        } catch {
          // invalid JWT — still try hash revoke in case of DB-only row
          ownerOk = true;
        }
        if (ownerOk) {
          const n = await this.repo.revokeRefreshTokenForAdmin(
            admin.id,
            hashToken(refresh),
          );
          refreshRevoked = n > 0;
        }
      }
    }

    return { loggedOut: true, allDevices, refreshRevoked };
  }

  async me(adminUuid: string): Promise<AdminPublic> {
    const admin = await this.repo.findByUuid(adminUuid);
    if (!admin || admin.status !== 'active') {
      throw new UnauthorizedError('Admin not found or inactive');
    }
    return this.buildPublic(admin.id, admin);
  }

  async listAdmins(): Promise<AdminPublic[]> {
    const rows = await this.repo.listAdmins();
    return Promise.all(rows.map((row) => this.buildPublic(row.id, row)));
  }

  async changePassword(
    adminUuid: string,
    input: AdminChangePasswordInput,
  ): Promise<void> {
    const admin = await this.repo.findByUuid(adminUuid);
    if (!admin || admin.status !== 'active') {
      throw new UnauthorizedError('Admin not found or inactive');
    }
    const ok = await verifyPassword(
      input.currentPassword,
      admin.password,
      admin.salt,
    );
    if (!ok) {
      throw new UnauthorizedError('Current password is incorrect');
    }
    if (input.currentPassword === input.newPassword) {
      throw new ValidationError('New password must be different from current password');
    }
    const { hash, salt } = await hashPassword(input.newPassword);
    await this.repo.updatePassword(admin.id, hash, salt);
    // Force re-login everywhere else after a password change.
    await this.repo.revokeAllRefreshTokensForAdmin(admin.id);
  }

  async createAdmin(
    actorUuid: string,
    input: AdminCreateInput,
  ): Promise<AdminPublic> {
    const actor = await this.repo.findByUuid(actorUuid);
    if (!actor) throw new UnauthorizedError('Admin not found');

    const existing = await this.repo.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('Admin email already exists');
    }

    const roles = await this.repo.findRoleIdsByKeys(input.roleKeys);
    if (roles.length !== input.roleKeys.length) {
      const found = new Set(roles.map((r) => r.key));
      const missing = input.roleKeys.filter((k) => !found.has(k));
      throw new ValidationError(`Unknown roleKeys: ${missing.join(', ')}`);
    }

    const { hash, salt } = await hashPassword(input.password);
    const admin = await this.repo.createAdmin({
      email: input.email,
      passwordHash: hash,
      salt,
      fullName: input.fullName,
    });
    await this.repo.assignRoles({
      adminId: admin.id,
      roleIds: roles.map((r) => r.id),
      assignedBy: actor.id,
    });
    return this.buildPublic(admin.id, admin);
  }

  async assignRoles(
    actorUuid: string,
    targetAdminUuid: string,
    input: AdminAssignRolesInput,
  ): Promise<AdminPublic> {
    const actor = await this.repo.findByUuid(actorUuid);
    if (!actor) throw new UnauthorizedError('Admin not found');

    const target = await this.repo.findByUuid(targetAdminUuid);
    if (!target) throw new NotFoundError('Admin not found');

    const roles = await this.repo.findRoleIdsByKeys(input.roleKeys);
    if (roles.length !== input.roleKeys.length) {
      const found = new Set(roles.map((r) => r.key));
      const missing = input.roleKeys.filter((k) => !found.has(k));
      throw new ValidationError(`Unknown roleKeys: ${missing.join(', ')}`);
    }

    await this.repo.assignRoles({
      adminId: target.id,
      roleIds: roles.map((r) => r.id),
      assignedBy: actor.id,
      replace: true,
    });
    return this.buildPublic(target.id, target);
  }

  async listRoles() {
    return this.repo.listRoles();
  }

  async listPermissions() {
    return this.repo.listPermissions();
  }

  async requireInternalId(adminUuid: string): Promise<string> {
    const id = await this.repo.findInternalIdByUuid(adminUuid);
    if (!id) throw new UnauthorizedError('Admin not found');
    return id;
  }

  async hasPermission(adminUuid: string, permissionKey: string): Promise<boolean> {
    const admin = await this.repo.findByUuid(adminUuid);
    if (!admin || admin.status !== 'active') return false;
    return this.repo.adminHasPermission(admin.id, permissionKey);
  }

  private async buildPublic(
    adminId: string | number,
    row: {
      uuid: string;
      email: string;
      full_name: string;
      status: AdminPublic['status'];
      last_login_at: Date | string | null;
      created_at: Date | string;
    },
  ): Promise<AdminPublic> {
    const [roles, permissions] = await Promise.all([
      this.repo.listRolesForAdmin(adminId),
      this.repo.listPermissionKeysForAdmin(adminId),
    ]);
    return {
      ...this.repo.toPublicBase(row as never),
      roles,
      permissions,
    };
  }

  private async issueTokens(
    admin: { id: string | number; uuid: string; email: string },
    signer: AdminTokenSigner,
    meta?: RequestMeta,
  ): Promise<AdminTokens> {
    const payload = {
      sub: admin.uuid,
      email: admin.email,
      role: 'admin' as const,
      kind: 'admin' as const,
    };
    const accessToken = signer.signAccessToken(payload);
    const refreshToken = signer.signRefreshToken(payload);

    await this.repo.saveRefreshToken({
      adminId: admin.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt(),
      userAgent: meta?.userAgent,
      ipAddress: meta?.ipAddress,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    };
  }
}
