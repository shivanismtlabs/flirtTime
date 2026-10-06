import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import type { MediaKind, MediaPurpose, MediaStrategy } from './media.constants.js';
import type { MediaRow } from './media.types.js';

export class MediaRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async findUserIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('users').where({ uuid }).whereNull('deleted_at').first('id');
    return row ? String(row.id) : null;
  }

  async create(data: {
    uuid: string;
    userId: string;
    kind: MediaKind;
    purpose: MediaPurpose;
    strategy: MediaStrategy;
    key: string;
    contentType: string;
    sizeBytes?: number | null;
    uploadId?: string | null;
    partSize?: number | null;
    partCount?: number | null;
    idempotencyKey?: string | null;
    status?: string;
  }): Promise<MediaRow> {
    const [row] = await this.db('media')
      .insert({
        uuid: data.uuid,
        user_id: data.userId,
        kind: data.kind,
        purpose: data.purpose,
        strategy: data.strategy,
        key: data.key,
        content_type: data.contentType,
        size_bytes: data.sizeBytes ?? null,
        upload_id: data.uploadId ?? null,
        part_size: data.partSize ?? null,
        part_count: data.partCount ?? null,
        idempotency_key: data.idempotencyKey ?? null,
        status: data.status ?? 'pending',
      })
      .returning('*');
    return row as MediaRow;
  }

  async findByUuid(uuid: string): Promise<MediaRow | undefined> {
    return this.db('media').where({ uuid }).whereNull('deleted_at').first() as Promise<
      MediaRow | undefined
    >;
  }

  async findByIdempotency(userId: string, idempotencyKey: string): Promise<MediaRow | undefined> {
    return this.db('media')
      .where({ user_id: userId, idempotency_key: idempotencyKey })
      .whereNull('deleted_at')
      .first() as Promise<MediaRow | undefined>;
  }

  async updateByUuid(
    uuid: string,
    patch: Record<string, unknown>,
  ): Promise<MediaRow | undefined> {
    const [row] = await this.db('media')
      .where({ uuid })
      .whereNull('deleted_at')
      .update({
        ...patch,
        updated_at: this.db.fn.now(),
      })
      .returning('*');
    return row as MediaRow | undefined;
  }

  /** Propagate Lambda thumbnail onto any post_medias that already linked this media. */
  async syncThumbnailToPostMedias(mediaUuid: string, thumbnailKey: string): Promise<number> {
    const media = await this.findByUuid(mediaUuid);
    if (!media) return 0;
    return this.db('post_medias')
      .where({ media_id: media.id })
      .whereNull('deleted_at')
      .update({
        thumbnail: thumbnailKey,
        updated_at: this.db.fn.now(),
      });
  }

  /**
   * After HLS is ready: point post_medias.file_path at master.m3u8
   * and mark stream available (Linkgram-compatible).
   */
  async syncPlaybackToPostMedias(mediaUuid: string, playbackKey: string): Promise<number> {
    const media = await this.findByUuid(mediaUuid);
    if (!media) return 0;
    return this.db('post_medias')
      .where({ media_id: media.id })
      .whereNull('deleted_at')
      .update({
        file_path: playbackKey,
        is_stream_available: true,
        updated_at: this.db.fn.now(),
      });
  }

  /** Chat attachments that already referenced this media — switch to HLS. */
  async syncPlaybackToMessageMedias(
    mediaUuid: string,
    playbackKey: string,
  ): Promise<number> {
    const media = await this.findByUuid(mediaUuid);
    if (!media) return 0;
    const sourceKey = media.key;
    const chat = await this.db('message_medias')
      .where({ file_path: sourceKey })
      .whereNull('deleted_at')
      .update({
        file_path: playbackKey,
        updated_at: this.db.fn.now(),
      });
    const channel = await this.db('channel_message_medias')
      .where({ file_path: sourceKey })
      .whereNull('deleted_at')
      .update({
        file_path: playbackKey,
        updated_at: this.db.fn.now(),
      });
    return Number(chat) + Number(channel);
  }

  async softDelete(uuid: string, userId: string): Promise<number> {
    return this.db('media')
      .where({ uuid, user_id: userId })
      .whereNull('deleted_at')
      .update({
        deleted_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
  }
}
