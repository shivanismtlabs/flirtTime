import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { newPublicId } from '../../shared/ids/index.js';
import type { LanguagePreference } from './language.types.js';
import {
  flagIconPathForCode,
  languageNameForCode,
} from './language.types.js';

type PrefRow = {
  uuid: string;
  language_code: string;
  language_name: string;
  flag_icon: string | null;
  is_selected: boolean;
};

function resolveFlagIcon(raw: string | null): string | null {
  if (!raw) return null;
  const base =
    process.env.ASSET_CDN_URL?.trim() ||
    process.env.CLOUDFRONT_URL?.trim() ||
    '';
  if (!base) return raw;
  return `${base.replace(/\/$/, '')}/${raw.replace(/^\//, '')}`;
}

function mapRow(row: PrefRow): LanguagePreference {
  return {
    id: row.uuid,
    languageCode: row.language_code,
    languageName: row.language_name,
    flagIcon: resolveFlagIcon(row.flag_icon),
    isSelected: Boolean(row.is_selected),
  };
}

const SELECT_COLS = [
  'uuid',
  'language_code',
  'language_name',
  'flag_icon',
  'is_selected',
] as const;

export class LanguageRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async findUserIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('users')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string | number }>('id');
    return row ? String(row.id) : null;
  }

  async listForUser(userId: string): Promise<LanguagePreference[]> {
    const rows = await this.db('user_language_preferences')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .orderBy('language_name', 'asc')
      .select(...SELECT_COLS);
    return (rows as PrefRow[]).map(mapRow);
  }

  async clearSelected(userId: string, trx?: Knex.Transaction): Promise<void> {
    const q = (trx ?? this.db)('user_language_preferences')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .update({
        is_selected: false,
        updated_at: this.db.fn.now(),
      });
    await q;
  }

  async selectByCode(
    userId: string,
    languageCode: string,
    trx?: Knex.Transaction,
  ): Promise<LanguagePreference | null> {
    const db = trx ?? this.db;
    const [row] = await db('user_language_preferences')
      .where({ user_id: userId, language_code: languageCode })
      .whereNull('deleted_at')
      .update({
        is_selected: true,
        updated_at: this.db.fn.now(),
      })
      .returning([...SELECT_COLS]);
    return row ? mapRow(row as PrefRow) : null;
  }

  async create(
    userId: string,
    languageCode: string,
    isSelected: boolean,
    trx?: Knex.Transaction,
  ): Promise<LanguagePreference> {
    const db = trx ?? this.db;
    const [row] = await db('user_language_preferences')
      .insert({
        uuid: newPublicId(),
        user_id: userId,
        language_code: languageCode,
        language_name: languageNameForCode(languageCode),
        flag_icon: flagIconPathForCode(languageCode),
        is_selected: isSelected,
      })
      .returning([...SELECT_COLS]);
    return mapRow(row as PrefRow);
  }

  async syncUserAppLanguage(userId: string, languageCode: string): Promise<void> {
    await this.db('user_details')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .update({
        app_language: languageCode,
        updated_at: this.db.fn.now(),
      });
  }

  async withTransaction<T>(fn: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }
}
