import { NotFoundError, ValidationError } from '../../shared/errors/index.js';
import type {
  AdminCreateNotificationBody,
  AdminNotificationsInboxQuery,
  AdminNotificationsManageQuery,
} from './admin-notifications.schema.js';
import { AdminNotificationsRepository } from './admin-notifications.repository.js';

export class AdminNotificationsService {
  constructor(private readonly repo = new AdminNotificationsRepository()) {}

  private async requireAdminInternalId(adminUuid: string): Promise<string> {
    const id = await this.repo.resolveAdminInternalId(adminUuid);
    if (!id) throw new NotFoundError('Admin not found');
    return id;
  }

  async inbox(adminUuid: string, query: AdminNotificationsInboxQuery) {
    const adminId = await this.requireAdminInternalId(adminUuid);
    const page = Math.max(1, query.page);
    const limit = Math.min(50, Math.max(1, query.limit));
    const [{ rows, total }, unreadCount] = await Promise.all([
      this.repo.listInbox({
        adminInternalId: adminId,
        page,
        limit,
        unreadOnly: query.unreadOnly,
      }),
      this.repo.unreadCount(adminId),
    ]);
    return {
      notifications: rows,
      unreadCount,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async unreadCount(adminUuid: string) {
    const adminId = await this.requireAdminInternalId(adminUuid);
    const unreadCount = await this.repo.unreadCount(adminId);
    return { unreadCount };
  }

  async manage(query: AdminNotificationsManageQuery) {
    const page = Math.max(1, query.page);
    const limit = Math.min(50, Math.max(1, query.limit));
    const { rows, total } = await this.repo.listManaged({
      page,
      limit,
      q: query.q,
      type: query.type,
    });
    return {
      notifications: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async create(adminUuid: string, body: AdminCreateNotificationBody) {
    const createdBy = await this.requireAdminInternalId(adminUuid);
    let recipientIds: string[] = [];
    if (body.allAdmins) {
      recipientIds = await this.repo.listActiveAdminIds();
    } else if (body.adminIds?.length) {
      recipientIds = await this.repo.resolveAdminIdsByUuids(body.adminIds);
      if (!recipientIds.length) {
        throw new ValidationError('No matching admins for adminIds');
      }
    }

    // Always include the sender so a broadcast never lands with zero recipients
    // when the only logged-in admin is somehow missing from the active list.
    if (!recipientIds.includes(createdBy)) {
      recipientIds = [...recipientIds, createdBy];
    }

    if (!recipientIds.length) {
      throw new ValidationError('No recipient admins');
    }

    const created = await this.repo.create({
      title: body.title,
      body: body.body,
      type: body.type,
      link: body.link ?? null,
      icon: body.icon ?? null,
      createdByInternalId: createdBy,
      recipientAdminIds: recipientIds,
    });

    return {
      notification: {
        id: created.id,
        recipientCount: created.recipientCount,
      },
    };
  }

  async markRead(adminUuid: string, notificationId: string) {
    const adminId = await this.requireAdminInternalId(adminUuid);
    const ok = await this.repo.markRead(notificationId, adminId);
    if (!ok) throw new NotFoundError('Notification not found');
    return { read: true };
  }

  async markAllRead(adminUuid: string) {
    const adminId = await this.requireAdminInternalId(adminUuid);
    const updated = await this.repo.markAllRead(adminId);
    return { updated };
  }

  async softDelete(notificationId: string) {
    const ok = await this.repo.softDelete(notificationId);
    if (!ok) throw new NotFoundError('Notification not found');
    return { deleted: true };
  }
}
