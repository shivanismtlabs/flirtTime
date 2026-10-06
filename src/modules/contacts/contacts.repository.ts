import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import type { NormalizedContact } from './contacts.types.js';

/** Placeholder for NOT NULL country_code column — matching uses phone_number only. */
const CONTACT_COUNTRY_PLACEHOLDER = '';

export class ContactsRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async findUserIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('users')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string | number }>('id');
    return row?.id != null ? String(row.id) : null;
  }

  async findUserPhone(
    userId: string,
  ): Promise<{ countryCode: string; phoneNumber: string } | null> {
    const row = await this.db('users')
      .where({ id: userId })
      .whereNull('deleted_at')
      .first<{ country_code: string; phone_number: string }>(
        'country_code',
        'phone_number',
      );
    if (!row?.phone_number) return null;
    return {
      countryCode: row.country_code ?? '',
      phoneNumber: String(row.phone_number).replace(/\D/g, ''),
    };
  }

  /**
   * Upsert contacts for owner by phone_number only.
   * Soft-deleted rows for the same number are restored.
   */
  async upsertContacts(
    userId: string,
    contacts: NormalizedContact[],
  ): Promise<number> {
    if (!contacts.length) return 0;

    return this.db.transaction(async (trx) => {
      let written = 0;
      const now = trx.fn.now();

      for (const c of contacts) {
        const active = await trx('user_contacts')
          .where({
            user_id: userId,
            phone_number: c.phoneNumber,
          })
          .whereNull('deleted_at')
          .first<{ id: string | number }>('id');

        if (active) {
          await trx('user_contacts').where({ id: active.id }).update({
            country_code: CONTACT_COUNTRY_PLACEHOLDER,
            display_name: c.displayName,
            synced_at: now,
            updated_at: now,
          });
          written += 1;
          continue;
        }

        const soft = await trx('user_contacts')
          .where({
            user_id: userId,
            phone_number: c.phoneNumber,
          })
          .whereNotNull('deleted_at')
          .orderBy('id', 'desc')
          .first<{ id: string | number }>('id');

        if (soft) {
          await trx('user_contacts').where({ id: soft.id }).update({
            country_code: CONTACT_COUNTRY_PLACEHOLDER,
            display_name: c.displayName,
            deleted_at: null,
            synced_at: now,
            updated_at: now,
          });
          written += 1;
          continue;
        }

        await trx('user_contacts').insert({
          user_id: userId,
          country_code: CONTACT_COUNTRY_PLACEHOLDER,
          phone_number: c.phoneNumber,
          display_name: c.displayName,
          synced_at: now,
        });
        written += 1;
      }

      return written;
    });
  }

  /** Soft-delete active contacts whose phone_number is not in the keep set. */
  async softDeleteMissing(
    userId: string,
    keep: Array<{ phoneNumber: string }>,
  ): Promise<number> {
    const keepKeys = new Set(keep.map((c) => c.phoneNumber));

    const active = await this.db('user_contacts')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .select<{ id: string | number; phone_number: string }[]>(
        'id',
        'phone_number',
      );

    const toDelete = active
      .filter((r) => !keepKeys.has(String(r.phone_number)))
      .map((r) => r.id);

    if (!toDelete.length) return 0;

    return this.db('user_contacts').whereIn('id', toDelete).update({
      deleted_at: this.db.fn.now(),
      updated_at: this.db.fn.now(),
    });
  }

  /**
   * Registered users whose phone_number matches synced contacts (country ignored).
   * Excludes owner and mutual blocks.
   */
  async findMatchedUserIds(
    ownerId: string,
    limit: number,
    offset: number,
  ): Promise<{ ids: string[]; total: number }> {
    const base = this.db('user_contacts as uc')
      .join('users as u', 'u.phone_number', 'uc.phone_number')
      .where('uc.user_id', ownerId)
      .whereNull('uc.deleted_at')
      .whereNull('u.deleted_at')
      .whereNotNull('u.phone_number')
      .where('u.id', '<>', ownerId)
      .whereNotExists(function () {
        this.select(this.client.raw('1'))
          .from('blocks as b')
          .whereNull('b.deleted_at')
          .andWhere(function () {
            this.where(function () {
              this.where('b.blocker_id', ownerId).andWhereRaw('b.blocked_id = u.id');
            }).orWhere(function () {
              this.whereRaw('b.blocker_id = u.id').andWhere('b.blocked_id', ownerId);
            });
          });
      });

    const [rows, countRow] = await Promise.all([
      base
        .clone()
        .distinct('u.id')
        .orderBy('u.id', 'asc')
        .limit(limit)
        .offset(offset)
        .select<{ id: string | number }[]>('u.id'),
      base.clone().countDistinct<{ count: string }[]>({ count: 'u.id' }).first(),
    ]);

    return {
      ids: rows.map((r) => String(r.id)),
      total: Number(countRow?.count ?? 0),
    };
  }

  /** All matched registered user internal ids for the owner (for suggest ranking). */
  async findAllMatchedUserIds(ownerId: string): Promise<string[]> {
    const rows = await this.db('user_contacts as uc')
      .join('users as u', 'u.phone_number', 'uc.phone_number')
      .where('uc.user_id', ownerId)
      .whereNull('uc.deleted_at')
      .whereNull('u.deleted_at')
      .whereNotNull('u.phone_number')
      .where('u.id', '<>', ownerId)
      .distinct('u.id')
      .select<{ id: string | number }[]>('u.id');

    return rows.map((r) => String(r.id));
  }
}
