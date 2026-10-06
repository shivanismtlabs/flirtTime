import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { newPublicId } from '../../shared/ids/index.js';

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

export type AdminNotificationInboxItem = {
  id: string;
  title: string;
  body: string;
  type: string;
  link: string | null;
  icon: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  createdBy: { id: string; fullName: string; email: string } | null;
};

export type AdminNotificationManageItem = {
  id: string;
  title: string;
  body: string;
  type: string;
  link: string | null;
  icon: string | null;
  createdAt: string;
  createdBy: { id: string; fullName: string; email: string } | null;
  recipientCount: number;
  readCount: number;
};

export class AdminNotificationsRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async resolveAdminInternalId(uuid: string): Promise<string | null> {
    const row = await this.db('admins')
      .where({ uuid })
      .whereNull('deleted_at')
      .first('id');
    return row ? String(row.id) : null;
  }

  async listActiveAdminIds(): Promise<string[]> {
    const rows = await this.db('admins')
      .whereNull('deleted_at')
      .andWhere('status', 'active')
      .select('id');
    return rows.map((r: { id: string | number }) => String(r.id));
  }

  async resolveAdminIdsByUuids(uuids: string[]): Promise<string[]> {
    if (!uuids.length) return [];
    const rows = await this.db('admins')
      .whereNull('deleted_at')
      .whereIn('uuid', uuids)
      .select('id');
    return rows.map((r: { id: string | number }) => String(r.id));
  }

  async unreadCount(adminInternalId: string): Promise<number> {
    try {
      const row = await this.db('admin_notification_recipients as r')
        .join(
          'admin_notifications as n',
          'n.id',
          'r.admin_notification_id',
        )
        .where('r.admin_id', adminInternalId)
        .whereNull('r.deleted_at')
        .whereNull('n.deleted_at')
        .andWhere('r.is_read', false)
        .count<{ count: string }>('* as count')
        .first();
      return Number(row?.count ?? 0);
    } catch {
      return 0;
    }
  }

  async listInbox(opts: {
    adminInternalId: string;
    page: number;
    limit: number;
    unreadOnly?: boolean;
  }): Promise<{ rows: AdminNotificationInboxItem[]; total: number }> {
    let base = this.db('admin_notification_recipients as r')
      .join(
        'admin_notifications as n',
        'n.id',
        'r.admin_notification_id',
      )
      .leftJoin('admins as a', 'a.id', 'n.created_by')
      .where('r.admin_id', opts.adminInternalId)
      .whereNull('r.deleted_at')
      .whereNull('n.deleted_at');

    if (opts.unreadOnly) {
      base = base.andWhere('r.is_read', false);
    }

    const countRow = await base
      .clone()
      .clearSelect()
      .countDistinct<{ count: string }>('r.id as count')
      .first();
    const total = Number(countRow?.count ?? 0);

    const rows = await base
      .clone()
      .select(
        'n.uuid as id',
        'n.title',
        'n.body',
        'n.type',
        'n.link',
        'n.icon',
        'n.created_at',
        'r.is_read',
        'r.read_at',
        'a.uuid as created_by_id',
        'a.full_name as created_by_name',
        'a.email as created_by_email',
      )
      .orderBy('n.created_at', 'desc')
      .limit(opts.limit)
      .offset((opts.page - 1) * opts.limit);

    return {
      total,
      rows: rows.map(
        (r: {
          id: string;
          title: string;
          body: string;
          type: string;
          link: string | null;
          icon: string | null;
          created_at: Date | string;
          is_read: boolean;
          read_at: Date | string | null;
          created_by_id: string | null;
          created_by_name: string | null;
          created_by_email: string | null;
        }) => ({
          id: r.id,
          title: r.title,
          body: r.body,
          type: r.type,
          link: r.link,
          icon: r.icon,
          isRead: Boolean(r.is_read),
          readAt: toIso(r.read_at),
          createdAt: toIso(r.created_at)!,
          createdBy: r.created_by_id
            ? {
                id: r.created_by_id,
                fullName: r.created_by_name || '',
                email: r.created_by_email || '',
              }
            : null,
        }),
      ),
    };
  }

  async listManaged(opts: {
    page: number;
    limit: number;
    q?: string;
    type?: string;
  }): Promise<{ rows: AdminNotificationManageItem[]; total: number }> {
    let base = this.db('admin_notifications as n')
      .leftJoin('admins as a', 'a.id', 'n.created_by')
      .whereNull('n.deleted_at');

    if (opts.type) base = base.andWhere('n.type', opts.type);
    if (opts.q) {
      const term = `%${opts.q}%`;
      base = base.andWhere((w) => {
        w.whereILike('n.title', term).orWhereILike('n.body', term);
      });
    }

    const countRow = await base
      .clone()
      .clearSelect()
      .countDistinct<{ count: string }>('n.id as count')
      .first();
    const total = Number(countRow?.count ?? 0);

    const rows = await base
      .clone()
      .select(
        'n.id as internal_id',
        'n.uuid as id',
        'n.title',
        'n.body',
        'n.type',
        'n.link',
        'n.icon',
        'n.created_at',
        'a.uuid as created_by_id',
        'a.full_name as created_by_name',
        'a.email as created_by_email',
      )
      .orderBy('n.created_at', 'desc')
      .limit(opts.limit)
      .offset((opts.page - 1) * opts.limit);

    const internalIds = rows.map(
      (r: { internal_id: string | number }) => r.internal_id,
    );
    const stats = new Map<string, { recipientCount: number; readCount: number }>();
    if (internalIds.length) {
      const statRows = await this.db('admin_notification_recipients')
        .whereNull('deleted_at')
        .whereIn('admin_notification_id', internalIds)
        .select(
          'admin_notification_id',
          this.db.raw('count(*)::int as recipient_count'),
          this.db.raw(
            'count(*) filter (where is_read = true)::int as read_count',
          ),
        )
        .groupBy('admin_notification_id');

      for (const s of statRows as Array<{
        admin_notification_id: string | number;
        recipient_count: string | number;
        read_count: string | number | null;
      }>) {
        stats.set(String(s.admin_notification_id), {
          recipientCount: Number(s.recipient_count ?? 0),
          readCount: Number(s.read_count ?? 0),
        });
      }
    }

    return {
      total,
      rows: rows.map(
        (r: {
          internal_id: string | number;
          id: string;
          title: string;
          body: string;
          type: string;
          link: string | null;
          icon: string | null;
          created_at: Date | string;
          created_by_id: string | null;
          created_by_name: string | null;
          created_by_email: string | null;
        }) => {
          const st = stats.get(String(r.internal_id)) ?? {
            recipientCount: 0,
            readCount: 0,
          };
          return {
            id: r.id,
            title: r.title,
            body: r.body,
            type: r.type,
            link: r.link,
            icon: r.icon,
            createdAt: toIso(r.created_at)!,
            createdBy: r.created_by_id
              ? {
                  id: r.created_by_id,
                  fullName: r.created_by_name || '',
                  email: r.created_by_email || '',
                }
              : null,
            recipientCount: st.recipientCount,
            readCount: st.readCount,
          };
        },
      ),
    };
  }

  async create(opts: {
    title: string;
    body: string;
    type: string;
    link: string | null;
    icon: string | null;
    createdByInternalId: string | null;
    recipientAdminIds: string[];
  }): Promise<{ id: string; recipientCount: number }> {
    return this.db.transaction(async (trx) => {
      const notifUuid = newPublicId();
      const [notif] = await trx('admin_notifications')
        .insert({
          uuid: notifUuid,
          title: opts.title,
          body: opts.body,
          type: opts.type,
          link: opts.link,
          icon: opts.icon,
          created_by: opts.createdByInternalId,
        })
        .returning(['id', 'uuid']);

      const notifId = notif.id;
      if (opts.recipientAdminIds.length) {
        await trx('admin_notification_recipients').insert(
          opts.recipientAdminIds.map((adminId) => ({
            uuid: newPublicId(),
            admin_notification_id: notifId,
            admin_id: adminId,
            is_read: false,
          })),
        );
      }

      return {
        id: String(notif.uuid),
        recipientCount: opts.recipientAdminIds.length,
      };
    });
  }

  async markRead(
    notificationUuid: string,
    adminInternalId: string,
  ): Promise<boolean> {
    const notif = await this.db('admin_notifications')
      .where({ uuid: notificationUuid })
      .whereNull('deleted_at')
      .first('id');
    if (!notif) return false;

    const updated = await this.db('admin_notification_recipients')
      .where({
        admin_notification_id: notif.id,
        admin_id: adminInternalId,
      })
      .whereNull('deleted_at')
      .andWhere('is_read', false)
      .update({
        is_read: true,
        read_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
    return updated > 0 || Boolean(notif);
  }

  async markAllRead(adminInternalId: string): Promise<number> {
    return this.db('admin_notification_recipients')
      .where({ admin_id: adminInternalId })
      .whereNull('deleted_at')
      .andWhere('is_read', false)
      .update({
        is_read: true,
        read_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
  }

  async softDelete(notificationUuid: string): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const notif = await trx('admin_notifications')
        .where({ uuid: notificationUuid })
        .whereNull('deleted_at')
        .first('id');
      if (!notif) return false;

      await trx('admin_notifications').where({ id: notif.id }).update({
        deleted_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
      await trx('admin_notification_recipients')
        .where({ admin_notification_id: notif.id })
        .whereNull('deleted_at')
        .update({
          deleted_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
      return true;
    });
  }
}
