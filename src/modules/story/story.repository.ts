import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { newPublicId } from '../../shared/ids/index.js';
import type { CreateStoryInput } from './story.types.js';

export class StoryRepository {
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

  async findUserDisplayByUuid(
    uuid: string,
  ): Promise<{ username: string; fullName: string | null } | null> {
    const found = await this.db('users')
      .leftJoin('user_details', 'user_details.user_id', 'users.id')
      .where({ 'users.uuid': uuid })
      .whereNull('users.deleted_at')
      .first<{ username: string | null; full_name: string | null }>(
        'user_details.username',
        'user_details.full_name',
      );
    if (!found) return null;
    return {
      username: found.username ?? 'Someone',
      fullName: found.full_name,
    };
  }

  async create(userId: string, input: CreateStoryInput) {
    const [row] = await this.db('stories')
      .insert({
        uuid: newPublicId(),
        user_id: userId,
        caption: input.caption ?? null,
        file_path: input.filePath,
        file_type: input.fileType,
        thumbnail: input.thumbnail ?? null,
        privacy: input.privacy ?? 'followers',
        meta: input.meta ?? null,
        enable_likes: input.enableLikes ?? true,
        enable_replies: input.enableReplies ?? true,
      })
      .returning('*');
    return row;
  }

  async findByUuid(uuid: string) {
    return this.db('stories')
      .where({ uuid })
      .whereNull('deleted_at')
      .where('expires_at', '>', this.db.fn.now())
      .first();
  }

  async listMine(userId: string, limit: number, cursor?: string) {
    let query = this.db('stories')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .where('expires_at', '>', this.db.fn.now())
      .orderBy('created_at', 'desc')
      .limit(limit);

    if (cursor) {
      query = query.where('created_at', '<', cursor);
    }

    const rows = await query;
    const nextCursor =
      rows.length > 0
        ? (rows[rows.length - 1] as { created_at: Date }).created_at
        : null;
    return { rows, nextCursor };
  }

  async listFeed(viewerId: string, limit: number, cursor?: string) {
    let query = this.db('stories')
      .select('stories.*')
      .innerJoin('follows', 'follows.following_id', 'stories.user_id')
      .where('follows.follower_id', viewerId)
      .andWhere('follows.status', 'follow')
      .whereNull('follows.deleted_at')
      .whereNull('stories.deleted_at')
      .where('stories.expires_at', '>', this.db.fn.now())
      .orderBy('stories.created_at', 'desc')
      .limit(limit);

    if (cursor) {
      query = query.where('stories.created_at', '<', cursor);
    }

    const rows = await query;
    const nextCursor =
      rows.length > 0
        ? (rows[rows.length - 1] as { created_at: Date }).created_at
        : null;
    return { rows, nextCursor };
  }

  async softDelete(uuid: string, userId: string) {
    return this.db('stories')
      .where({ uuid, user_id: userId })
      .whereNull('deleted_at')
      .update({
        deleted_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
  }

  async markSeen(storyId: string, userId: string) {
    const existing = await this.db('story_views')
      .where({ story_id: storyId, user_id: userId })
      .first();

    if (existing) {
      return existing;
    }

    const [row] = await this.db('story_views')
      .insert({ story_id: storyId, user_id: userId })
      .returning('*');
    return row;
  }

  async like(storyId: string, userId: string) {
    const active = await this.db('story_likes')
      .where({ story_id: storyId, user_id: userId })
      .whereNull('deleted_at')
      .first();

    if (active) {
      return { like: active, created: false };
    }

    const softDeleted = await this.db('story_likes')
      .where({ story_id: storyId, user_id: userId })
      .whereNotNull('deleted_at')
      .first();

    if (softDeleted) {
      const [row] = await this.db('story_likes')
        .where({ id: softDeleted.id })
        .update({
          deleted_at: null,
          updated_at: this.db.fn.now(),
        })
        .returning('*');
      return { like: row, created: true };
    }

    const [row] = await this.db('story_likes')
      .insert({ story_id: storyId, user_id: userId })
      .returning('*');
    return { like: row, created: true };
  }

  async unlike(storyId: string, userId: string) {
    return this.db('story_likes')
      .where({ story_id: storyId, user_id: userId })
      .whereNull('deleted_at')
      .update({
        deleted_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
  }
}
