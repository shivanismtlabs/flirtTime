import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { newPublicId } from '../../shared/ids/index.js';
import {
  applyKeysetDesc,
  parseKeysetCursor,
} from '../../shared/utils/keyset.js';
import type { CreateReelInput } from './reel.types.js';

/** Reels live in `posts` with type = 'reel' */
export class ReelRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async findUserIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('users')
      .select('id')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string }>();
    return row?.id ?? null;
  }

  async findUserUuidById(id: string): Promise<string | null> {
    const row = await this.db('users')
      .where({ id })
      .whereNull('deleted_at')
      .first<{ uuid: string }>('uuid');
    return row?.uuid ?? null;
  }

  async create(userId: string, input: CreateReelInput) {
    return this.db.transaction(async (trx) => {
      const details = await trx('user_details')
        .where({ user_id: userId })
        .whereNull('deleted_at')
        .first<{ is_private: boolean }>('is_private');
      const privacy =
        input.privacy ?? (details?.is_private ? 'followers' : 'public');

      const [reel] = await trx('posts')
        .insert({
          uuid: newPublicId(),
          user_id: userId,
          caption: input.caption ?? null,
          type: 'reel',
          privacy,
        })
        .returning('*');

      await trx('post_stats').insert({ post_id: reel.id });

      await trx('post_medias').insert({
        uuid: newPublicId(),
        post_id: reel.id,
        file_path: input.media.filePath,
        file_type: input.media.fileType,
        thumbnail: input.media.thumbnail ?? null,
        meta: input.media.meta ?? null,
        position: 0,
      });

      await trx('user_stats')
        .where({ user_id: userId })
        .increment('reel_count', 1);

      return reel;
    });
  }

  async findByUuid(uuid: string) {
    return this.db('posts')
      .where({ uuid, type: 'reel' })
      .whereNull('deleted_at')
      .first();
  }

  /** Explore only public accounts / public reels (excludes mutual blocks). */
  async listExplore(viewerId: string, limit: number, cursor?: string) {
    const keyset = parseKeysetCursor(cursor);
    let query = this.db('posts')
      .where({ type: 'reel', is_draft: false, is_archived: false })
      .whereNull('deleted_at')
      .where('privacy', 'public')
      .where('created_at', '>', this.db.raw(`now() - interval '30 days'`))
      .whereExists(
        this.db('user_details as ud')
          .whereRaw('ud.user_id = posts.user_id')
          .whereNull('ud.deleted_at')
          .andWhere({ 'ud.is_private': false }),
      )
      .whereNotExists(
        this.db('blocks as b')
          .whereNull('b.deleted_at')
          .andWhere((b) => {
            b.where((inner) => {
              inner
                .where('b.blocker_id', viewerId)
                .andWhereRaw('b.blocked_id = posts.user_id');
            }).orWhere((inner) => {
              inner
                .whereRaw('b.blocker_id = posts.user_id')
                .andWhere('b.blocked_id', viewerId);
            });
          }),
      )
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit);

    if (keyset) {
      applyKeysetDesc(query, 'posts.created_at', 'posts.id', keyset);
    }

    const rows = await query;
    const last = rows[rows.length - 1] as
      | { created_at: Date | string; id: string | number }
      | undefined;
    const nextCursor =
      rows.length === limit && last
        ? new Date(last.created_at).toISOString()
        : null;
    return { rows, nextCursor };
  }

  async listByUser(userId: string, limit: number, cursor?: string) {
    const keyset = parseKeysetCursor(cursor);
    let query = this.db('posts')
      .where({ user_id: userId, type: 'reel' })
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit);

    if (keyset) {
      applyKeysetDesc(query, 'posts.created_at', 'posts.id', keyset);
    }

    const rows = await query;
    const last = rows[rows.length - 1] as
      | { created_at: Date | string; id: string | number }
      | undefined;
    const nextCursor =
      rows.length === limit && last
        ? new Date(last.created_at).toISOString()
        : null;
    return { rows, nextCursor };
  }

  async softDelete(uuid: string, userId: string): Promise<{ deleted: number; postId: string | null }> {
    const row = await this.db('posts')
      .where({ uuid, type: 'reel', user_id: userId })
      .whereNull('deleted_at')
      .first<{ id: string | number }>('id');
    if (!row) return { deleted: 0, postId: null };
    const deleted = await this.db('posts')
      .where({ id: row.id })
      .update({
        deleted_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
    return { deleted, postId: String(row.id) };
  }
}
