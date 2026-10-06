import { ConflictError, NotFoundError } from '../../shared/errors/index.js';
import { NotificationService } from '../notification/notification.service.js';
import { RequestVerificationRepository } from './request-verification.repository.js';
import type { AdminProcessVerificationBody } from './request-verification.schema.js';
import {
  CATEGORIES,
  DOCUMENT_TYPES,
  LINK_TYPES,
  type AdminRequestVerification,
  type CreateRequestVerificationInput,
  type RequestVerification,
  type VerificationOptions,
  type VerificationStatus,
} from './request-verification.types.js';

export class RequestVerificationService {
  constructor(
    private readonly repo = new RequestVerificationRepository(),
    private readonly notifications = new NotificationService(),
  ) {}

  getOptions(): VerificationOptions {
    return {
      documentTypes: DOCUMENT_TYPES.map((d) => ({
        code: d.code,
        name: d.name,
      })),
      categories: CATEGORIES.map((c) => ({ code: c.code, name: c.name })),
      linkTypes: LINK_TYPES.map((l) => ({ code: l.code, name: l.name })),
    };
  }

  private async requireUserId(actorUuid: string): Promise<string> {
    const userId = await this.repo.findUserIdByUuid(actorUuid);
    if (!userId) throw new NotFoundError('User not found');
    return userId;
  }

  async getMine(actorUuid: string): Promise<RequestVerification | null> {
    const userId = await this.requireUserId(actorUuid);
    const pending = await this.repo.findPendingByUserId(userId);
    if (pending) return pending;
    const verified = await this.repo.isUserVerified(userId);
    if (verified) return this.repo.findActiveByUserId(userId);
    const latest = await this.repo.findActiveByUserId(userId);
    if (latest?.status === 'Rejected') return latest;
    return null;
  }

  async create(
    actorUuid: string,
    input: CreateRequestVerificationInput,
  ): Promise<RequestVerification> {
    const userId = await this.requireUserId(actorUuid);
    const pending = await this.repo.findPendingByUserId(userId);
    if (pending) {
      throw new ConflictError(
        'You already have a pending verification request',
      );
    }
    if (await this.repo.isUserVerified(userId)) {
      throw new ConflictError('Your account is already verified');
    }
    return this.repo.create(userId, input);
  }

  async cancelMine(actorUuid: string): Promise<void> {
    const userId = await this.requireUserId(actorUuid);
    const ok = await this.repo.softDeleteActive(userId);
    if (!ok) throw new NotFoundError('No pending verification request');
  }

  async adminList(opts: {
    page: number;
    limit: number;
    q?: string;
    status?: VerificationStatus;
  }) {
    const page = Math.max(1, opts.page);
    const limit = Math.min(100, Math.max(1, opts.limit));
    const offset = (page - 1) * limit;
    const { rows, total } = await this.repo.adminList({
      limit,
      offset,
      q: opts.q,
      status: opts.status,
    });
    return {
      verifications: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async adminGetById(id: string, markViewed = true) {
    let item = await this.repo.adminFindByUuid(id);
    if (!item) throw new NotFoundError('Verification request not found');
    if (markViewed && item.status === 'Submitted') {
      item = (await this.repo.adminMarkViewed(id)) ?? item;
    }
    return { verification: item };
  }

  async adminProcess(
    adminLabel: string,
    id: string,
    body: AdminProcessVerificationBody,
  ) {
    const existing = await this.repo.adminFindByUuid(id);
    if (!existing) throw new NotFoundError('Verification request not found');

    if (body.action === 'reverify') {
      if (existing.status !== 'Approved' && existing.status !== 'Rejected') {
        throw new ConflictError(
          'Only approved or rejected requests can be re-verified',
        );
      }
      const verification = await this.repo.adminReverify(
        id,
        adminLabel,
        body.comments,
      );
      if (!verification) {
        throw new ConflictError('Request could not be re-verified');
      }
      this.notifyVerificationResult(verification, 'approve');
      return { verification };
    }

    if (existing.status !== 'Submitted' && existing.status !== 'Viewed') {
      throw new ConflictError(
        `Request is already ${String(existing.status).toLowerCase()}`,
      );
    }

    if (body.action === 'approve') {
      const verification = await this.repo.adminApprove(
        id,
        adminLabel,
        body.comments,
      );
      if (!verification) {
        throw new ConflictError('Request could not be approved');
      }
      this.notifyVerificationResult(verification, 'approve');
      return { verification };
    }

    const verification = await this.repo.adminReject(
      id,
      adminLabel,
      body.comments,
    );
    if (!verification) {
      throw new ConflictError('Request could not be rejected');
    }
    this.notifyVerificationResult(verification, 'reject');
    return { verification };
  }

  async adminDelete(id: string) {
    const existing = await this.repo.adminFindByUuid(id);
    if (!existing) throw new NotFoundError('Verification request not found');
    const ok = await this.repo.adminSoftDelete(id);
    if (!ok) throw new NotFoundError('Verification request not found');
    return { deleted: true };
  }

  async adminSetUserVerified(userUuid: string, verified: boolean) {
    const ok = await this.repo.adminSetUserVerified(userUuid, verified);
    if (!ok) throw new NotFoundError('User not found');
    if (verified) {
      void this.notifications
        .create({
          userId: userUuid,
          type: 'system',
          i18nKey: 'VERIFICATION_APPROVED',
          entityType: 'verification',
          entityId: userUuid,
          icon: 'system',
          tag: `verification-grant-${userUuid}`,
          link: '/request-verification',
        })
        .catch(() => {});
    }
    return { updated: true, isVerified: verified };
  }

  /** In-app + FCM after admin approve/reject. Never fail the admin action. */
  private notifyVerificationResult(
    verification: AdminRequestVerification,
    action: 'approve' | 'reject',
  ): void {
    const userId = verification.user?.id;
    if (!userId) return;

    const approved = action === 'approve';
    const comments = verification.comments?.trim();
    void this.notifications
      .create({
        userId,
        type: 'system',
        i18nKey: approved ? 'VERIFICATION_APPROVED' : 'VERIFICATION_REJECTED',
        i18nParams: !approved && comments ? { note: comments } : undefined,
        entityType: 'verification',
        entityId: verification.id,
        icon: 'system',
        tag: `verification-${action}-${verification.id}`,
        link: '/request-verification',
      })
      .catch(() => {});
  }
}
