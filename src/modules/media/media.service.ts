import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/index.js';
import { newPublicId } from '../../shared/ids/index.js';
import {
  derivedVideoHlsKey,
  derivedVideoThumbnailKey,
  invokeProcessVideo,
  isVideoLambdaConfigured,
} from '../../shared/aws/index.js';
import { env } from '../../shared/config/env.js';
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createDownloadUrl,
  createMultipartUpload,
  createUploadUrl,
  deleteObject,
  headObject,
  presignUploadPart,
  putObject,
  publicUrl,
} from '../../shared/storage/index.js';
import {
  buildObjectKey,
  chooseStrategy,
  computePartCount,
  defaultFileNameForMime,
  DOWNLOAD_URL_EXPIRES_SECONDS,
  IMAGE_MAX_BYTES,
  isMimeAllowed,
  maxBytesForKind,
  MEDIA_PURPOSES,
  MULTIPART_PART_SIZE_BYTES,
  MULTIPART_URL_EXPIRES_SECONDS,
  PUT_URL_EXPIRES_SECONDS,
  sanitizeFileName,
  type MediaKind,
  type MediaPurpose,
} from './media.constants.js';
import { MediaRepository } from './media.repository.js';
import type {
  BatchPartsInput,
  CompleteUploadInput,
  CreateUploadSessionInput,
  DownloadMediaInput,
  MediaRow,
} from './media.types.js';
import sharp from 'sharp';

function toPublicMedia(row: MediaRow) {
  const sourceKey = row.key;
  const playbackKey = row.playback_key?.trim() || null;
  const isHls = Boolean(playbackKey?.endsWith('.m3u8'));
  const playKey = playbackKey || sourceKey;
  return {
    id: row.uuid,
    mediaId: row.uuid,
    kind: row.kind,
    purpose: row.purpose,
    strategy: row.strategy,
    status: row.status,
    mimeType: isHls ? 'application/vnd.apple.mpegurl' : row.content_type,
    contentType: isHls ? 'application/vnd.apple.mpegurl' : row.content_type,
    byteSize: row.size_bytes == null ? null : Number(row.size_bytes),
    sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
    key: playKey,
    /** Original uploaded object (source MP4 for videos) */
    sourceKey,
    sourceUrl: publicUrl(sourceKey),
    /** HLS master when ready; otherwise same as source */
    playbackKey,
    hlsUrl: playbackKey ? publicUrl(playbackKey) : null,
    isHls,
    url: publicUrl(playKey),
    publicUrl: publicUrl(playKey),
    thumbnailUrl: row.thumbnail_key ? publicUrl(row.thumbnail_key) : null,
    partSize: row.part_size,
    partCount: row.part_count,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MediaService {
  constructor(private readonly repo = new MediaRepository()) {}

  private async resolveUserId(userUuid: string): Promise<string> {
    const id = await this.repo.findUserIdByUuid(userUuid);
    if (!id) {
      throw new NotFoundError('User not found');
    }
    return id;
  }

  private assertOwner(row: MediaRow, userId: string): void {
    // Same 404 for miss and non-owner — no existence leak
    if (String(row.user_id) !== String(userId)) {
      throw new NotFoundError('Media not found');
    }
  }

  private validateInput(input: CreateUploadSessionInput): void {
    if (!isMimeAllowed(input.kind as MediaKind, input.mimeType)) {
      throw new ValidationError(`MIME type ${input.mimeType} is not allowed for ${input.kind}`);
    }
    if (input.byteSize != null) {
      const max = maxBytesForKind(input.kind as MediaKind);
      if (input.byteSize > max) {
        throw new ValidationError(
          `File exceeds max size for ${input.kind} (${max} bytes)`,
          { maxBytes: max, byteSize: input.byteSize },
        );
      }
    }
  }

  /**
   * Direct image upload: client sends only the file.
   * Server converts to WebP, sets contentType/filename/sizeBytes, uploads to S3, status=ready.
   */
  async uploadImage(
    userUuid: string,
    input: {
      buffer: Buffer;
      originalName?: string;
      purpose?: string;
      idempotencyKey?: string;
    },
  ) {
    if (!input.buffer?.length) {
      throw new ValidationError('Image file is required');
    }
    if (input.buffer.length > IMAGE_MAX_BYTES) {
      throw new ValidationError(`Image exceeds max size (${IMAGE_MAX_BYTES} bytes)`, {
        maxBytes: IMAGE_MAX_BYTES,
      });
    }

    const purpose = (input.purpose ?? 'post') as MediaPurpose;
    if (!MEDIA_PURPOSES.includes(purpose)) {
      throw new ValidationError(`Invalid purpose: ${purpose}`);
    }

    const userId = await this.resolveUserId(userUuid);

    if (input.idempotencyKey) {
      const existing = await this.repo.findByIdempotency(userId, input.idempotencyKey);
      if (existing) {
        return { media: toPublicMedia(existing), reused: true };
      }
    }

    let webp: Buffer;
    let width: number | null = null;
    let height: number | null = null;
    try {
      const meta = await sharp(input.buffer, { failOn: 'none' }).rotate().metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
      webp = await sharp(input.buffer, { failOn: 'none' })
        .rotate()
        .resize({ width: 1440, withoutEnlargement: true, kernel: sharp.kernel.lanczos3 })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new ValidationError('Invalid or unsupported image file');
    }

    const mediaUuid = newPublicId();
    const base =
      (input.originalName ?? 'photo').replace(/\.[^.]+$/, '') || 'photo';
    const fileName = `${base}.webp`.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
    const key = buildObjectKey({
      purpose,
      userUuid,
      mediaUuid,
      fileName,
    });

    await putObject(key, webp, 'image/webp');

    try {
      const row = await this.repo.create({
        uuid: mediaUuid,
        userId,
        kind: 'image',
        purpose,
        strategy: 'put',
        key,
        contentType: 'image/webp',
        sizeBytes: webp.length,
        idempotencyKey: input.idempotencyKey ?? null,
        status: 'ready',
      });

      const updated =
        (await this.repo.updateByUuid(mediaUuid, {
          width,
          height,
        })) ?? row;

      return { media: toPublicMedia(updated), reused: false };
    } catch (err) {
      try {
        await deleteObject(key);
      } catch {
        // ignore cleanup failure
      }
      if (input.idempotencyKey && isUniqueViolation(err)) {
        const existing = await this.repo.findByIdempotency(userId, input.idempotencyKey);
        if (existing) {
          return { media: toPublicMedia(existing), reused: true };
        }
      }
      throw err;
    }
  }

  async createUploadSession(userUuid: string, input: CreateUploadSessionInput) {
    this.validateInput(input);

    const userId = await this.resolveUserId(userUuid);

    if (input.idempotencyKey) {
      const existing = await this.repo.findByIdempotency(userId, input.idempotencyKey);
      if (existing) {
        return this.buildSessionResponse(existing, { reuse: true });
      }
    }

    const mediaUuid = newPublicId();
    const kind = input.kind as MediaKind;
    const fileName =
      input.fileName?.trim() || defaultFileNameForMime(input.mimeType, kind);
    const strategy = chooseStrategy(kind, input.byteSize ?? null);
    const key = buildObjectKey({
      purpose: input.purpose as MediaPurpose,
      userUuid,
      mediaUuid,
      fileName,
      kind,
    });

    try {
      if (strategy === 'put') {
        const uploadUrl = await createUploadUrl(
          key,
          input.mimeType,
          PUT_URL_EXPIRES_SECONDS,
        );
        const row = await this.repo.create({
          uuid: mediaUuid,
          userId,
          kind,
          purpose: input.purpose as MediaPurpose,
          strategy: 'put',
          key,
          contentType: input.mimeType,
          sizeBytes: input.byteSize ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          status: 'pending',
        });

        return {
          mediaId: row.uuid,
          strategy: 'put' as const,
          status: row.status,
          key,
          publicUrl: publicUrl(key),
          expiresIn: PUT_URL_EXPIRES_SECONDS,
          upload: {
            method: 'PUT' as const,
            url: uploadUrl,
            headers: { 'Content-Type': input.mimeType },
          },
          media: toPublicMedia(row),
          reused: false,
        };
      }

      const partSize = MULTIPART_PART_SIZE_BYTES;
      const sizeForParts = input.byteSize ?? maxBytesForKind(kind);
      const partCount = computePartCount(sizeForParts, partSize);
      const uploadId = await createMultipartUpload(key, input.mimeType);
      const row = await this.repo.create({
        uuid: mediaUuid,
        userId,
        kind,
        purpose: input.purpose as MediaPurpose,
        strategy: 'multipart',
        key,
        contentType: input.mimeType,
        sizeBytes: input.byteSize ?? null,
        uploadId,
        partSize,
        partCount,
        idempotencyKey: input.idempotencyKey ?? null,
        status: 'pending',
      });

      return {
        mediaId: row.uuid,
        strategy: 'multipart' as const,
        status: row.status,
        uploadId,
        key,
        publicUrl: publicUrl(key),
        partSize,
        partCount,
        expiresIn: MULTIPART_URL_EXPIRES_SECONDS,
        media: toPublicMedia(row),
        reused: false,
        hint: 'Call POST /api/v1/media/uploads/:id/parts (omit partNumbers for all parts)',
      };
    } catch (err) {
      if (input.idempotencyKey && isUniqueViolation(err)) {
        const existing = await this.repo.findByIdempotency(userId, input.idempotencyKey);
        if (existing) {
          return this.buildSessionResponse(existing, { reuse: true });
        }
      }
      throw err;
    }
  }

  private async buildSessionResponse(
    row: MediaRow,
    opts: { reuse: boolean },
  ) {
    if (row.strategy === 'put') {
      const uploadUrl = await createUploadUrl(
        row.key,
        row.content_type,
        PUT_URL_EXPIRES_SECONDS,
      );
      return {
        mediaId: row.uuid,
        strategy: 'put' as const,
        status: row.status,
        key: row.key,
        publicUrl: publicUrl(row.key),
        expiresIn: PUT_URL_EXPIRES_SECONDS,
        upload: {
          method: 'PUT' as const,
          url: uploadUrl,
          headers: { 'Content-Type': row.content_type },
        },
        media: toPublicMedia(row),
        reused: opts.reuse,
      };
    }

    return {
      mediaId: row.uuid,
      strategy: 'multipart' as const,
      status: row.status,
      uploadId: row.upload_id,
      key: row.key,
      publicUrl: publicUrl(row.key),
      partSize: row.part_size,
      partCount: row.part_count,
      expiresIn: MULTIPART_URL_EXPIRES_SECONDS,
      media: toPublicMedia(row),
      reused: opts.reuse,
      hint: 'Call POST /api/v1/media/uploads/:id/parts (omit partNumbers for all parts)',
    };
  }

  /** Legacy alias for POST /upload-url */
  async requestUploadUrl(userUuid: string, input: CreateUploadSessionInput) {
    return this.createUploadSession(userUuid, input);
  }

  async batchPartUrls(userUuid: string, mediaId: string, input: BatchPartsInput) {
    const userId = await this.resolveUserId(userUuid);
    const row = await this.repo.findByUuid(mediaId);
    if (!row) throw new NotFoundError('Media not found');
    this.assertOwner(row, userId);

    if (row.strategy !== 'multipart' || !row.upload_id) {
      throw new ValidationError('Media is not a multipart upload session');
    }
    if (row.status !== 'pending') {
      throw new ConflictError(`Cannot request parts when status is ${row.status}`);
    }

    const maxPart = row.part_count ?? 0;
    const requested =
      input.partNumbers?.length
        ? input.partNumbers
        : Array.from({ length: maxPart }, (_, i) => i + 1);

    if (!requested.length) {
      throw new ValidationError('No parts to sign');
    }

    for (const n of requested) {
      if (n < 1 || n > maxPart) {
        throw new ValidationError(`partNumber ${n} must be in 1..${maxPart}`);
      }
    }

    const parts = await Promise.all(
      requested.map(async (partNumber) => ({
        partNumber,
        method: 'PUT' as const,
        url: await presignUploadPart(
          row.key,
          row.upload_id!,
          partNumber,
          MULTIPART_URL_EXPIRES_SECONDS,
        ),
        expiresIn: MULTIPART_URL_EXPIRES_SECONDS,
      })),
    );

    return {
      mediaId: row.uuid,
      expiresIn: MULTIPART_URL_EXPIRES_SECONDS,
      parts,
    };
  }

  async completeUpload(userUuid: string, mediaId: string, input: CompleteUploadInput) {
    const userId = await this.resolveUserId(userUuid);
    const row = await this.repo.findByUuid(mediaId);
    if (!row) throw new NotFoundError('Media not found');
    this.assertOwner(row, userId);

    if (row.status === 'ready') {
      return { media: toPublicMedia(row) };
    }
    if (row.status !== 'pending') {
      throw new ConflictError(`Cannot complete upload when status is ${row.status}`);
    }

    if (row.strategy === 'multipart') {
      if (!row.upload_id) {
        throw new ValidationError('Missing multipart upload_id');
      }
      const parts = input.parts;
      if (!parts?.length) {
        throw new ValidationError('parts[] with partNumber and etag is required for multipart');
      }
      const numbers = parts.map((p) => p.partNumber);
      if (new Set(numbers).size !== numbers.length) {
        throw new ValidationError('Duplicate partNumber in parts[]');
      }
      if (row.part_count && row.size_bytes != null && parts.length !== row.part_count) {
        throw new ValidationError(
          `Expected ${row.part_count} parts, got ${parts.length}`,
        );
      }
      await completeMultipartUpload(
        row.key,
        row.upload_id,
        parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      );
    }

    const head = await headObject(row.key);
    if (!head) {
      throw new ValidationError('Object not found in storage — upload the file before completing');
    }

    const expected = row.size_bytes == null ? null : Number(row.size_bytes);
    if (expected != null && head.contentLength != null && head.contentLength !== expected) {
      await this.repo.updateByUuid(mediaId, {
        status: 'failed',
        error_message: `Size mismatch: expected ${expected}, got ${head.contentLength}`,
      });
      throw new ValidationError('Uploaded object size does not match declared byteSize', {
        expected,
        actual: head.contentLength,
      });
    }

    const patch: Record<string, unknown> = {
      status: 'ready',
      size_bytes: head.contentLength ?? row.size_bytes,
      error_message: null,
    };
    if (input.width != null) patch.width = input.width;
    if (input.height != null) patch.height = input.height;
    if (input.durationMs != null) patch.duration_ms = input.durationMs;

    if (input.thumbnailMediaId) {
      const thumb = await this.repo.findByUuid(input.thumbnailMediaId);
      if (!thumb || String(thumb.user_id) !== String(userId)) {
        throw new NotFoundError('Thumbnail media not found');
      }
      if (thumb.kind !== 'image' || thumb.status !== 'ready') {
        throw new ValidationError('thumbnailMediaId must be a ready image upload');
      }
      // Interim poster until process-video Lambda writes the canonical WebP
      patch.thumbnail_key = thumb.key;
    }

    const updated = await this.repo.updateByUuid(mediaId, patch);
    const media = updated ?? row;

    // Linkgram-style: video → process-video Lambda (ffmpeg frame @ 0.01s + WebP)
    if (media.kind === 'video' && isVideoLambdaConfigured()) {
      void this.runVideoThumbnailPipeline(media.uuid, media.key).catch((err) => {
        console.error(
          `[media] video Lambda thumbnail failed for ${media.uuid}:`,
          err instanceof Error ? err.message : err,
        );
      });
    }

    return { media: toPublicMedia(media) };
  }

  async abortUpload(userUuid: string, mediaId: string) {
    const userId = await this.resolveUserId(userUuid);
    const row = await this.repo.findByUuid(mediaId);
    if (!row) throw new NotFoundError('Media not found');
    this.assertOwner(row, userId);

    if (row.status === 'ready') {
      throw new ConflictError('Cannot abort a completed upload');
    }

    if (row.strategy === 'multipart' && row.upload_id) {
      try {
        await abortMultipartUpload(row.key, row.upload_id);
      } catch {
        // best-effort abort
      }
    } else {
      try {
        await deleteObject(row.key);
      } catch {
        // best-effort
      }
    }

    const updated = await this.repo.updateByUuid(mediaId, {
      status: 'failed',
      error_message: 'aborted',
    });
    await this.repo.softDelete(mediaId, userId);

    return { mediaId, aborted: true, status: updated?.status ?? 'failed' };
  }

  async getById(userUuid: string, id: string) {
    const userId = await this.resolveUserId(userUuid);
    const media = await this.repo.findByUuid(id);
    if (!media) {
      throw new NotFoundError('Media not found');
    }
    this.assertOwner(media, userId);
    return { media: toPublicMedia(media) };
  }

  /**
   * Presigned S3 GET with Content-Disposition: attachment.
   * Defaults to the original object (`source`); pass variant=thumbnail for poster.
   */
  async createDownload(
    userUuid: string,
    mediaId: string,
    input: DownloadMediaInput = { variant: 'source' },
  ) {
    const userId = await this.resolveUserId(userUuid);
    const row = await this.repo.findByUuid(mediaId);
    if (!row) throw new NotFoundError('Media not found');
    this.assertOwner(row, userId);

    if (row.status !== 'ready' && row.status !== 'processing') {
      throw new ConflictError(`Media is not ready for download (status: ${row.status})`);
    }

    const variant = input.variant ?? 'source';
    let key: string;
    let contentType: string;

    if (variant === 'thumbnail') {
      if (!row.thumbnail_key?.trim()) {
        throw new NotFoundError('Thumbnail not available for this media');
      }
      key = row.thumbnail_key.trim();
      contentType = 'image/webp';
    } else {
      // Always the original upload (MP4/source for videos — not HLS)
      key = row.key;
      contentType = row.content_type;
    }

    const fileName =
      sanitizeFileName(
        input.fileName?.trim() || key.split('/').pop() || `${row.uuid}`,
      );

    const url = await createDownloadUrl(key, DOWNLOAD_URL_EXPIRES_SECONDS, {
      fileName,
      contentType,
    });

    return {
      mediaId: row.uuid,
      variant,
      key,
      fileName,
      contentType,
      expiresIn: DOWNLOAD_URL_EXPIRES_SECONDS,
      url,
      download: {
        method: 'GET' as const,
        url,
      },
    };
  }

  async remove(userUuid: string, id: string) {
    const userId = await this.resolveUserId(userUuid);
    const media = await this.repo.findByUuid(id);
    if (!media) {
      throw new NotFoundError('Media not found');
    }
    this.assertOwner(media, userId);

    if (media.strategy === 'multipart' && media.upload_id && media.status === 'pending') {
      try {
        await abortMultipartUpload(media.key, media.upload_id);
      } catch {
        // ignore
      }
    }

    await this.repo.softDelete(id, userId);
    try {
      await deleteObject(media.key);
    } catch {
      // ignore missing object
    }
    if (media.thumbnail_key) {
      try {
        await deleteObject(media.thumbnail_key);
      } catch {
        // ignore
      }
    }
  }

  /**
   * Invoke Linkgram `process-video` Lambda (or wait for S3-triggered output)
   * and set `thumbnail_key` to the generated WebP.
   */
  async process(userUuid: string, id: string) {
    const userId = await this.resolveUserId(userUuid);
    const media = await this.repo.findByUuid(id);
    if (!media) throw new NotFoundError('Media not found');
    this.assertOwner(media, userId);

    if (media.status !== 'ready' && media.status !== 'processing') {
      throw new ConflictError('Media must be ready before processing');
    }
    if (media.kind !== 'video') {
      throw new ValidationError('Only video media can be processed for thumbnails');
    }
    if (!isVideoLambdaConfigured()) {
      throw new ConflictError('AWS_VIDEO_LAMBDA_FUNCTION_NAME is not configured');
    }

    await this.repo.updateByUuid(id, { status: 'processing', error_message: null });

    try {
      const thumbnailKey = await this.runVideoThumbnailPipeline(id, media.key, {
        awaitInvoke: true,
      });
      const updated = await this.repo.findByUuid(id);
      return {
        media: toPublicMedia(updated ?? media),
        thumbnailKey,
        message: 'Video processed — thumbnail ready',
      };
    } catch (err) {
      await this.repo.updateByUuid(id, {
        status: 'ready',
        error_message:
          err instanceof Error ? err.message.slice(0, 500) : 'Video processing failed',
      });
      throw err;
    }
  }

  /**
   * Linkgram vibe create: await process-video for each video media before linking.
   * Errors are logged (same as Linkgram) so create can still proceed.
   */
  async ensureVideosProcessed(userUuid: string, mediaIds: string[]): Promise<void> {
    if (!mediaIds.length || !isVideoLambdaConfigured()) return;

    const userId = await this.resolveUserId(userUuid);

    await Promise.all(
      mediaIds.map(async (mediaId) => {
        const media = await this.repo.findByUuid(mediaId);
        if (!media || String(media.user_id) !== String(userId)) return;
        if (media.kind !== 'video') return;
        if (media.status !== 'ready' && media.status !== 'processing') return;

        if (media.thumbnail_key) {
          const existing = await headObject(media.thumbnail_key);
          if (existing) return;
        }

        try {
          console.log(`[vibe] Invoking process-video Lambda for ${media.key}`);
          await this.runVideoThumbnailPipeline(media.uuid, media.key, {
            awaitInvoke: true,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[vibe] Lambda invocation failed for ${media.key}:`, message);
          await this.repo.updateByUuid(media.uuid, {
            status: 'ready',
            error_message: message.slice(0, 500),
          });
          // Don't silently succeed — caller must see why thumb is missing
          throw new ValidationError(
            `Video thumbnail Lambda failed: ${message.slice(0, 300)}`,
          );
        }
      }),
    );
  }

  /**
   * Linkgram flow: invoke process-video (when MANUAL_LAMBDA_TRIGGER), then
   * resolve WebP thumbnail + HLS master.m3u8 and persist keys.
   */
  private async runVideoThumbnailPipeline(
    mediaId: string,
    videoKey: string,
    opts?: { awaitInvoke?: boolean },
  ): Promise<string> {
    const thumbKey = derivedVideoThumbnailKey(videoKey);
    const hlsKey = derivedVideoHlsKey(videoKey);

    if (env.MANUAL_LAMBDA_TRIGGER || opts?.awaitInvoke) {
      await invokeProcessVideo(videoKey);
    } else {
      // S3 event may already be processing — wait briefly for WebP
      const found = await waitForObject(thumbKey, { attempts: 12, delayMs: 5_000 });
      if (!found) {
        // Fallback: invoke anyway if object never appeared
        await invokeProcessVideo(videoKey);
      }
    }

    const head = await headObject(thumbKey);
    if (!head) {
      throw new Error(`Thumbnail not found in storage after Lambda: ${thumbKey}`);
    }

    // HLS is uploaded before the WebP in Lambda — prefer hard check, soft-fail if missing
    let playbackKey: string | null = null;
    const hlsHead = await headObject(hlsKey);
    if (hlsHead) {
      playbackKey = hlsKey;
    } else {
      const hlsReady = await waitForObject(hlsKey, { attempts: 6, delayMs: 2_000 });
      if (hlsReady) playbackKey = hlsKey;
      else {
        console.error(
          `[media] HLS master not found after Lambda (thumb ok): ${hlsKey}`,
        );
      }
    }

    await this.repo.updateByUuid(mediaId, {
      thumbnail_key: thumbKey,
      ...(playbackKey ? { playback_key: playbackKey } : {}),
      status: 'ready',
      error_message: null,
    });

    // Vibe/post may already exist — sync thumb + HLS file_path
    try {
      await this.repo.syncThumbnailToPostMedias(mediaId, thumbKey);
    } catch (err) {
      console.error(
        `[media] failed to sync thumbnail to post_medias for ${mediaId}:`,
        err instanceof Error ? err.message : err,
      );
    }

    if (playbackKey) {
      try {
        await this.repo.syncPlaybackToPostMedias(mediaId, playbackKey);
      } catch (err) {
        console.error(
          `[media] failed to sync HLS to post_medias for ${mediaId}:`,
          err instanceof Error ? err.message : err,
        );
      }
      try {
        await this.repo.syncPlaybackToMessageMedias(mediaId, playbackKey);
      } catch (err) {
        console.error(
          `[media] failed to sync HLS to message_medias for ${mediaId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    return thumbKey;
  }
}

async function waitForObject(
  key: string,
  opts: { attempts: number; delayMs: number },
): Promise<boolean> {
  for (let i = 0; i < opts.attempts; i++) {
    const head = await headObject(key);
    if (head) return true;
    await new Promise((r) => setTimeout(r, opts.delayMs));
  }
  return false;
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string }).code === '23505',
  );
}
