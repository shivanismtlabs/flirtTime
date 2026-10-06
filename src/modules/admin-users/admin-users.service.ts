import { NotFoundError } from '../../shared/errors/index.js';
import { RequestVerificationService } from '../request-verification/request-verification.service.js';
import type {
  AdminUserDevicesQuery,
  AdminUserReportStatusBody,
  AdminUserReportsQuery,
  AdminUserStatusBody,
  AdminUserVerificationBody,
  AdminUsersListQuery,
} from './admin-users.schema.js';
import { AdminUsersRepository } from './admin-users.repository.js';

export class AdminUsersService {
  constructor(
    private readonly repo = new AdminUsersRepository(),
    private readonly verifications = new RequestVerificationService(),
  ) {}

  async list(query: AdminUsersListQuery) {
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const { rows, total } = await this.repo.list({
      page,
      limit,
      q: query.q,
      status: query.status,
      gender: query.gender,
      verified: query.verified,
      isPrivate: query.isPrivate,
      nationality: query.nationality,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      sort: query.sort,
    });
    return {
      users: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async overview() {
    const overview = await this.repo.overview();
    return { overview };
  }

  async getById(id: string) {
    const user = await this.repo.getByUuid(id);
    if (!user) throw new NotFoundError('User not found');
    return { user };
  }

  async updateStatus(id: string, body: AdminUserStatusBody) {
    const ok = await this.repo.updateStatus(id, body.status);
    if (!ok) throw new NotFoundError('User not found');
    return { updated: true, status: body.status };
  }

  async updateVerification(id: string, body: AdminUserVerificationBody) {
    return this.verifications.adminSetUserVerified(id, body.verified);
  }

  async softDelete(id: string) {
    const ok = await this.repo.softDelete(id);
    if (!ok) throw new NotFoundError('User not found');
    return { deleted: true };
  }

  async restore(id: string) {
    const ok = await this.repo.restore(id);
    if (!ok) throw new NotFoundError('User not found');
    return { restored: true };
  }

  async listReports(query: AdminUserReportsQuery) {
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const { rows, total } = await this.repo.listReports({
      page,
      limit,
      q: query.q,
      status: query.status,
    });
    return {
      reports: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async updateReportStatus(id: string, body: AdminUserReportStatusBody) {
    const ok = await this.repo.updateReportStatus(id, body.status);
    if (!ok) throw new NotFoundError('Report not found');
    return { updated: true, status: body.status };
  }

  async listDevices(query: AdminUserDevicesQuery) {
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const { rows, total } = await this.repo.listDevices({
      page,
      limit,
      q: query.q,
      platform: query.platform,
    });
    return {
      devices: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
