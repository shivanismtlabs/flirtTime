import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { newPublicId } from '../../shared/ids/index.js';
import {
  paginateOffset,
  paginationMeta,
} from '../../shared/utils/pagination.js';
import type {
  ListProfileVisitorsInput,
  ListProfileVisitorsResult,
  ProfileVisitorCountryRow,
  ProfileVisitorsFilter,
} from './profile-visitors.types.js';

function filterSince(filter?: ProfileVisitorsFilter): Date | null {
  if (!filter) return null;
  const d = new Date();
  if (filter === 'past30days') {
    d.setDate(d.getDate() - 30);
    return d;
  }
  if (filter === 'past7days') {
    d.setDate(d.getDate() - 7);
    return d;
  }
  // today
  d.setHours(0, 0, 0, 0);
  return d;
}

function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return value.toISOString();
}

export class ProfileVisitorsRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async findUserIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('users')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string | number }>('id');
    return row ? String(row.id) : null;
  }

  /**
   * Upsert a profile view. Returns whether a new row was inserted.
   */
  async recordView(
    ownerUserId: string,
    viewerUserId: string,
  ): Promise<{ inserted: boolean }> {
    if (ownerUserId === viewerUserId) {
      return { inserted: false };
    }

    const existing = await this.db('profile_viewers')
      .where({ user_id: ownerUserId, viewer_id: viewerUserId })
      .whereNull('deleted_at')
      .first<{ id: string | number }>('id');

    if (existing) {
      await this.db('profile_viewers')
        .where({ id: existing.id })
        .update({ updated_at: this.db.fn.now() });
      return { inserted: false };
    }

    await this.db('profile_viewers').insert({
      uuid: newPublicId(),
      user_id: ownerUserId,
      viewer_id: viewerUserId,
    });
    return { inserted: true };
  }

  async clearAllForOwner(ownerUserId: string): Promise<number> {
    return this.db('profile_viewers')
      .where({ user_id: ownerUserId })
      .whereNull('deleted_at')
      .update({
        deleted_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
  }

  /**
   * Country-grouped visitor counts for a profile owner.
   * Joins viewer nationality → countries (demonym or country name).
   */
  async listByCountry(
    ownerUserId: string,
    input: ListProfileVisitorsInput,
  ): Promise<ListProfileVisitorsResult> {
    const { page, limit } = input;
    const { offset } = paginateOffset(page, limit);
    const since = filterSince(input.filter);

    const bindings: Array<string | Date | number> = [ownerUserId, ownerUserId];
    let dateClause = '';
    if (since) {
      dateClause = 'AND pv.updated_at >= ?';
      bindings.push(since);
    }

    const baseFrom = `
      FROM profile_viewers pv
      INNER JOIN users vu
        ON vu.id = pv.viewer_id AND vu.deleted_at IS NULL
      INNER JOIN user_details ud
        ON ud.user_id = pv.viewer_id AND ud.deleted_at IS NULL
      INNER JOIN countries c
        ON c.deleted_at IS NULL
        AND (
          LOWER(c.nationality) = LOWER(ud.nationality)
          OR LOWER(c.name) = LOWER(ud.nationality)
          OR LOWER(c.country_code) = LOWER(ud.nationality)
        )
      WHERE pv.user_id = ?
        AND pv.viewer_id != ?
        AND pv.deleted_at IS NULL
        AND ud.nationality IS NOT NULL
        AND TRIM(ud.nationality) <> ''
        ${dateClause}
    `;

    const countRow = await this.db.raw(
      `
      SELECT COUNT(*)::int AS total FROM (
        SELECT 1
        ${baseFrom}
        GROUP BY c.id, c.name, c.country_code, c.nationality, c.flag_url
      ) grouped
      `,
      bindings,
    );
    const total = Number(countRow.rows?.[0]?.total ?? countRow[0]?.[0]?.total ?? 0);

    const listBindings = [...bindings, limit, offset];
    const listResult = await this.db.raw(
      `
      SELECT
        c.name AS country_name,
        c.country_code AS country_code,
        c.nationality AS nationality,
        c.flag_url AS flag,
        COUNT(pv.id)::int AS visit_count,
        MAX(pv.updated_at) AS last_visited_at
      ${baseFrom}
      GROUP BY c.id, c.name, c.country_code, c.nationality, c.flag_url
      ORDER BY last_visited_at DESC
      LIMIT ? OFFSET ?
      `,
      listBindings,
    );

    const rawRows: Array<Record<string, unknown>> =
      listResult.rows ?? listResult[0] ?? [];

    const rows: ProfileVisitorCountryRow[] = rawRows.map((r) => {
      const visitCount = Number(r.visit_count) || 0;
      return {
        countryName: String(r.country_name ?? ''),
        visitCount,
        flag: String(r.flag ?? ''),
        countryCode: String(r.country_code ?? ''),
        nationality: String(r.nationality ?? ''),
        lastVisitedAt: toIso(r.last_visited_at as Date | string),
        peoplecount: visitCount,
      };
    });

    return {
      rows,
      ...paginationMeta(total, page, limit),
    };
  }
}
