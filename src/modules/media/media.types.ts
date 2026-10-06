import { z } from 'zod';
import {
  MEDIA_DOWNLOAD_VARIANTS,
  MEDIA_KINDS,
  MEDIA_PURPOSES,
  VIDEO_MAX_BYTES,
} from './media.constants.js';

export const createUploadSessionSchema = z.object({
  purpose: z.enum(MEDIA_PURPOSES).default('post'),
  kind: z.enum(MEDIA_KINDS),
  mimeType: z.string().min(3).max(128),
  byteSize: z.number().int().positive().max(VIDEO_MAX_BYTES).optional(),
  fileName: z.string().min(1).max(255).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export type CreateUploadSessionInput = z.infer<typeof createUploadSessionSchema>;

/** @deprecated Prefer CreateUploadSessionInput — kept for callers */
export type CreateUploadUrlInput = CreateUploadSessionInput;

export const batchPartsSchema = z.object({
  partNumbers: z.array(z.number().int().min(1).max(10000)).min(1).max(10000).optional(),
});

export type BatchPartsInput = z.infer<typeof batchPartsSchema>;

export const completeUploadSchema = z.object({
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1),
        etag: z.string().min(1),
      }),
    )
    .max(10000)
    .optional(),
  sizeBytes: z.number().int().positive().max(VIDEO_MAX_BYTES).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  /** Ready image media UUID — copies its key onto this row as thumbnail_key */
  thumbnailMediaId: z.string().uuid().optional(),
});

export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;

export const downloadMediaSchema = z.object({
  variant: z.enum(MEDIA_DOWNLOAD_VARIANTS).default('source'),
  fileName: z.string().min(1).max(255).optional(),
});

export type DownloadMediaInput = z.infer<typeof downloadMediaSchema>;

export type MediaRow = {
  id: string;
  uuid: string;
  user_id: string;
  kind: string;
  purpose: string;
  strategy: string;
  status: string;
  content_type: string;
  size_bytes: string | number | null;
  key: string;
  upload_id: string | null;
  part_size: number | null;
  part_count: number | null;
  idempotency_key: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  thumbnail_key: string | null;
  /** HLS master.m3u8 under destination/ after process-video Lambda */
  playback_key: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};
