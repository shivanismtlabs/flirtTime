import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { newPublicId } from '../../shared/ids/index.js';
import type {
  AdminRequestVerification,
  CreateRequestVerificationInput,
  RequestVerification,
  VerificationLink,
  VerificationStatus,
} from './request-verification.types.js';

type Row = {
  uuid: string;
  full_name: string;
  document_type: string;
  document_url: string;
  category: string;
  nationality_code: string;
  nationality_name: string;
  audience: string | null;
  also_known_as: string | null;
  links: unknown;
  status: string;
  comments: string | null;
  submitted_at: Date | string;
  approved_at: Date | string | null;
  approved_by: string | null;
  rejected_at: Date | string | null;
  rejected_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type AdminRow = Row & {
  user_uuid: string;
  user_email: string | null;
  username: string | null;
  user_full_name: string | null;
  is_verified: boolean | null;
};

const RETURNING = [
  'uuid',
  'full_name',
  'document_type',
  'document_url',
  'category',
  'nationality_code',
  'nationality_name',
  'audience',
  'also_known_as',
  'links',
  'status',
  'comments',
  'submitted_at',
  'approved_at',
  'approved_by',
  'rejected_at',
  'rejected_by',
  'created_at',
  'updated_at',
] as const;

const ADMIN_SELECT = [
  'rv.uuid',
  'rv.full_name',
  'rv.document_type',
  'rv.document_url',
  'rv.category',
  'rv.nationality_code',
  'rv.nationality_name',
  'rv.audience',
  'rv.also_known_as',
  'rv.links',
  'rv.status',
  'rv.comments',
  'rv.submitted_at',
  'rv.approved_at',
  'rv.approved_by',
  'rv.rejected_at',
  'rv.rejected_by',
  'rv.created_at',
  'rv.updated_at',
  'u.uuid as user_uuid',
  'u.email as user_email',
  'ud.username',
  'ud.full_name as user_full_name',
  'ud.is_verified',
] as const;

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function parseLinks(value: unknown): VerificationLink[] {
  if (value == null) return [];
  if (typeof value === 'string') {
    try {
      return parseLinks(JSON.parse(value));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (v): v is VerificationLink =>
        !!v &&
        typeof v === 'object' &&
        typeof (v as VerificationLink).type === 'string' &&
        typeof (v as VerificationLink).url === 'string',
    )
    .map((v) => ({ type: v.type, url: v.url }));
}

function mapRow(row: Row): RequestVerification {
  return {
    id: row.uuid,
    fullName: row.full_name,
    documentType: row.document_type,
    documentUrl: row.document_url,
    category: row.category,
    nationality: {
      code: row.nationality_code,
      name: row.nationality_name,
    },
    audience: row.audience,
    alsoKnownAs: row.also_known_as,
    links: parseLinks(row.links),
    status: row.status,
    comments: row.comments,
    submittedAt: toIso(row.submitted_at)!,
    approvedAt: toIso(row.approved_at),
    rejectedAt: toIso(row.rejected_at),
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!,
  };
}

function mapAdminRow(row: AdminRow): AdminRequestVerification {
  return {
    ...mapRow(row),
    approvedBy: row.approved_by,
    rejectedBy: row.rejected_by,
    user: {
      id: row.user_uuid,
      email: row.user_email,
      username: row.username,
      fullName: row.user_full_name,
      isVerified: Boolean(row.is_verified),
    },
  };
}

export class RequestVerificationRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async findUserIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('users')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string | number }>('id');
    return row ? String(row.id) : null;
  }

  async isUserVerified(userId: string): Promise<boolean> {
    const row = await this.db('user_details')
      .where({ user_id: userId })
      .first<{ is_verified: boolean | null }>('is_verified');
    return Boolean(row?.is_verified);
  }

  async findActiveByUserId(
    userId: string,
  ): Promise<RequestVerification | null> {
    const row = await this.db('request_verifications')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc')
      .first<Row>(...RETURNING);
    return row ? mapRow(row) : null;
  }

  async findPendingByUserId(
    userId: string,
  ): Promise<RequestVerification | null> {
    const row = await this.db('request_verifications')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .whereIn('status', ['Submitted', 'Viewed'])
      .orderBy('created_at', 'desc')
      .first<Row>(...RETURNING);
    return row ? mapRow(row) : null;
  }

  async create(
    userId: string,
    input: CreateRequestVerificationInput,
  ): Promise<RequestVerification> {
    const links = input.links ?? [];
    const [row] = await this.db('request_verifications')
      .insert({
        uuid: newPublicId(),
        user_id: userId,
        full_name: input.fullName,
        document_type: input.documentType,
        document_url: input.documentUrl,
        category: input.category,
        nationality_code: input.nationality.code,
        nationality_name:
          input.nationality.label?.trim() ||
          input.nationality.name.trim(),
        audience: input.audience?.trim() || null,
        also_known_as: input.alsoKnownAs?.trim() || null,
        links: JSON.stringify(links),
        status: 'Submitted',
        submitted_at: this.db.fn.now(),
      })
      .returning([...RETURNING]);

    return mapRow(row as Row);
  }

  async softDeleteActive(userId: string): Promise<boolean> {
    const n = await this.db('request_verifications')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .whereIn('status', ['Submitted', 'Viewed'])
      .update({
        deleted_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
    return n > 0;
  }

  private adminBaseQuery() {
    return this.db('request_verifications as rv')
      .join('users as u', 'u.id', 'rv.user_id')
      .leftJoin('user_details as ud', 'ud.user_id', 'u.id')
      .whereNull('rv.deleted_at');
  }

  async adminList(opts: {
    limit: number;
    offset: number;
    q?: string;
    status?: VerificationStatus;
  }): Promise<{ rows: AdminRequestVerification[]; total: number }> {
    const base = this.adminBaseQuery();

    if (opts.status) {
      base.andWhere('rv.status', opts.status);
    }

    const q = opts.q?.trim();
    if (q) {
      const like = `%${q.replace(/[%_]/g, '\\$&')}%`;
      base.andWhere((builder) => {
        builder
          .whereILike('rv.full_name', like)
          .orWhereILike('u.email', like)
          .orWhereILike('ud.username', like)
          .orWhereILike('ud.full_name', like)
          .orWhereILike('rv.also_known_as', like);
      });
    }

    const countRow = await base
      .clone()
      .countDistinct<{ count: string | number }>('rv.id as count')
      .first();
    const total = Number(countRow?.count ?? 0);

    const rows = await base
      .clone()
      .select(...ADMIN_SELECT)
      .orderBy('rv.submitted_at', 'desc')
      .limit(opts.limit)
      .offset(opts.offset);

    return {
      total,
      rows: (rows as AdminRow[]).map((row) => mapAdminRow(row)),
    };
  }

  async adminFindByUuid(
    uuid: string,
  ): Promise<AdminRequestVerification | null> {
    const row = await this.adminBaseQuery()
      .where('rv.uuid', uuid)
      .first(...ADMIN_SELECT);
    return row ? mapAdminRow(row as AdminRow) : null;
  }

  async adminMarkViewed(uuid: string): Promise<AdminRequestVerification | null> {
    await this.db('request_verifications')
      .where({ uuid })
      .whereNull('deleted_at')
      .where({ status: 'Submitted' })
      .update({
        status: 'Viewed',
        updated_at: this.db.fn.now(),
      });
    return this.adminFindByUuid(uuid);
  }

  async adminApprove(
    uuid: string,
    adminLabel: string,
    comments?: string | null,
  ): Promise<AdminRequestVerification | null> {
    return this.db.transaction(async (trx) => {
      const existing = await trx('request_verifications')
        .where({ uuid })
        .whereNull('deleted_at')
        .whereIn('status', ['Submitted', 'Viewed'])
        .first<{ id: string | number; user_id: string | number }>(
          'id',
          'user_id',
        );
      if (!existing) return null;

      await trx('request_verifications')
        .where({ id: existing.id })
        .update({
          status: 'Approved',
          comments: comments?.trim() || null,
          approved_at: trx.fn.now(),
          approved_by: adminLabel,
          rejected_at: null,
          rejected_by: null,
          updated_at: trx.fn.now(),
        });

      await this.syncBadgeFromRequests(trx, existing.user_id);
      return this.fetchAdminRow(trx, uuid);
    });
  }

  async adminReverify(
    uuid: string,
    adminLabel: string,
    comments?: string | null,
  ): Promise<AdminRequestVerification | null> {
    return this.db.transaction(async (trx) => {
      const existing = await trx('request_verifications')
        .where({ uuid })
        .whereNull('deleted_at')
        .whereIn('status', ['Approved', 'Rejected'])
        .first<{ id: string | number; user_id: string | number }>(
          'id',
          'user_id',
        );
      if (!existing) return null;

      const patch: Record<string, unknown> = {
        status: 'Approved',
        approved_at: trx.fn.now(),
        approved_by: adminLabel,
        rejected_at: null,
        rejected_by: null,
        updated_at: trx.fn.now(),
      };
      const note = comments?.trim();
      if (note) patch.comments = note;

      await trx('request_verifications')
        .where({ id: existing.id })
        .update(patch);

      await this.syncBadgeFromRequests(trx, existing.user_id);
      return this.fetchAdminRow(trx, uuid);
    });
  }

  async adminSoftDelete(uuid: string): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const existing = await trx('request_verifications')
        .where({ uuid })
        .whereNull('deleted_at')
        .first<{ id: string | number; user_id: string | number }>(
          'id',
          'user_id',
        );
      if (!existing) return false;

      await trx('request_verifications')
        .where({ id: existing.id })
        .update({
          deleted_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });

      await this.syncBadgeFromRequests(trx, existing.user_id);
      return true;
    });
  }

  async adminSetUserVerified(
    userUuid: string,
    verified: boolean,
  ): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const user = await trx('users')
        .where({ uuid: userUuid })
        .whereNull('deleted_at')
        .first<{ id: string | number }>('id');
      if (!user) return false;
      await this.setVerifiedBadge(trx, user.id, verified);
      return true;
    });
  }

  async adminReject(
    uuid: string,
    adminLabel: string,
    comments?: string | null,
  ): Promise<AdminRequestVerification | null> {
    const n = await this.db('request_verifications')
      .where({ uuid })
      .whereNull('deleted_at')
      .whereIn('status', ['Submitted', 'Viewed'])
      .update({
        status: 'Rejected',
        comments: comments?.trim() || null,
        rejected_at: this.db.fn.now(),
        rejected_by: adminLabel,
        approved_at: null,
        approved_by: null,
        updated_at: this.db.fn.now(),
      });
    if (!n) return null;
    return this.adminFindByUuid(uuid);
  }

  private async fetchAdminRow(
    db: Knex | Knex.Transaction,
    uuid: string,
  ): Promise<AdminRequestVerification | null> {
    const row = await db('request_verifications as rv')
      .join('users as u', 'u.id', 'rv.user_id')
      .leftJoin('user_details as ud', 'ud.user_id', 'u.id')
      .where('rv.uuid', uuid)
      .whereNull('rv.deleted_at')
      .first(...ADMIN_SELECT);
    return row ? mapAdminRow(row as AdminRow) : null;
  }

  private async syncBadgeFromRequests(
    trx: Knex.Transaction,
    userId: string | number,
  ): Promise<void> {
    const approved = await trx('request_verifications')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .where({ status: 'Approved' })
      .first<{ id: string | number }>('id');
    await this.setVerifiedBadge(trx, userId, Boolean(approved));
  }

  private async setVerifiedBadge(
    trx: Knex.Transaction,
    userId: string | number,
    verified: boolean,
  ): Promise<void> {
    const existing = await trx('user_details')
      .where({ user_id: userId })
      .first<{ id: string | number }>('id');

    if (existing) {
      await trx('user_details')
        .where({ id: existing.id })
        .update({
          is_verified: verified,
          updated_at: trx.fn.now(),
        });
      return;
    }

    let username = `user_${userId}`;
    const clash = await trx('user_details')
      .where({ username })
      .whereNull('deleted_at')
      .first<{ id: string | number }>('id');
    if (clash) {
      username = `user_${userId}_${newPublicId().slice(0, 8)}`;
    }

    await trx('user_details').insert({
      uuid: newPublicId(),
      user_id: userId,
      username,
      is_verified: verified,
    });
  }
}
