import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { newPublicId } from '../../shared/ids/index.js';
import {
  paginateOffset,
  paginationMeta,
} from '../../shared/utils/pagination.js';
import type {
  CreateHelpRequestInput,
  HelpRequest,
  HelpRequestsPage,
  UpdateHelpRequestInput,
} from './help.types.js';

type HelpRow = {
  uuid: string;
  name: string;
  mobile: string;
  email: string;
  type: string;
  description: string;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function mapRow(row: HelpRow): HelpRequest {
  return {
    id: row.uuid,
    name: row.name,
    mobile: row.mobile,
    email: row.email,
    type: row.type,
    description: row.description,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export class HelpRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async findUserIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('users')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string | number }>('id');
    return row ? String(row.id) : null;
  }

  async create(
    userId: string,
    input: CreateHelpRequestInput,
  ): Promise<HelpRequest> {
    const [row] = await this.db('help_requests')
      .insert({
        uuid: newPublicId(),
        user_id: userId,
        name: input.name,
        mobile: input.mobile,
        email: input.email,
        type: input.type,
        description: input.description,
      })
      .returning([
        'uuid',
        'name',
        'mobile',
        'email',
        'type',
        'description',
        'created_at',
        'updated_at',
      ]);

    return mapRow(row as HelpRow);
  }

  async listForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<HelpRequestsPage> {
    const { offset } = paginateOffset(page, limit);
    const base = this.db('help_requests')
      .where({ user_id: userId })
      .whereNull('deleted_at');

    const [rows, countRow] = await Promise.all([
      base
        .clone()
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset)
        .select(
          'uuid',
          'name',
          'mobile',
          'email',
          'type',
          'description',
          'created_at',
          'updated_at',
        ),
      base
        .clone()
        .clearSelect()
        .clearOrder()
        .count<{ count: string }[]>({ count: '*' })
        .first(),
    ]);

    const total = Number(countRow?.count ?? 0);
    return {
      rows: (rows as HelpRow[]).map(mapRow),
      ...paginationMeta(total, page, limit),
    };
  }

  async findOwnedByUuid(
    uuid: string,
    userId: string,
  ): Promise<HelpRequest | null> {
    const row = await this.db('help_requests')
      .where({ uuid, user_id: userId })
      .whereNull('deleted_at')
      .first<HelpRow>(
        'uuid',
        'name',
        'mobile',
        'email',
        'type',
        'description',
        'created_at',
        'updated_at',
      );
    return row ? mapRow(row) : null;
  }

  async updateOwned(
    uuid: string,
    userId: string,
    input: UpdateHelpRequestInput,
  ): Promise<HelpRequest | null> {
    const patch: Record<string, unknown> = {
      updated_at: this.db.fn.now(),
    };
    if (input.name !== undefined) patch.name = input.name;
    if (input.mobile !== undefined) patch.mobile = input.mobile;
    if (input.email !== undefined) patch.email = input.email;
    if (input.type !== undefined) patch.type = input.type;
    if (input.description !== undefined) patch.description = input.description;

    const [row] = await this.db('help_requests')
      .where({ uuid, user_id: userId })
      .whereNull('deleted_at')
      .update(patch)
      .returning([
        'uuid',
        'name',
        'mobile',
        'email',
        'type',
        'description',
        'created_at',
        'updated_at',
      ]);

    return row ? mapRow(row as HelpRow) : null;
  }

  async softDeleteOwned(uuid: string, userId: string): Promise<boolean> {
    const updated = await this.db('help_requests')
      .where({ uuid, user_id: userId })
      .whereNull('deleted_at')
      .update({
        deleted_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
    return updated > 0;
  }
}
