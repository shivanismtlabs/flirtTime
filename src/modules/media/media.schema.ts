import { z } from 'zod';
import { withBodyExample } from '../../shared/swagger/route-meta.js';
import {
  MEDIA_DOWNLOAD_VARIANTS,
  MEDIA_KINDS,
  MEDIA_PURPOSES,
  VIDEO_MAX_BYTES,
} from './media.constants.js';

export const createUploadSessionBodySchema = withBodyExample(
  z.object({
    purpose: z.enum(MEDIA_PURPOSES).default('post'),
    kind: z.enum(MEDIA_KINDS),
    mimeType: z.string().min(3).max(128).optional(),
    contentType: z.string().min(3).max(128).optional(),
    byteSize: z.number().int().positive().max(VIDEO_MAX_BYTES).optional(),
    sizeBytes: z.number().int().positive().max(VIDEO_MAX_BYTES).optional(),
    fileName: z.string().min(1).max(255).optional(),
    filename: z.string().min(1).max(255).optional(),
    idempotencyKey: z.string().min(8).max(128).optional(),
  }),
  {
    purpose: 'post',
    kind: 'image',
    contentType: 'image/png',
  },
);

/** Legacy body — still accepted on POST /upload-url */
export const createUploadUrlBodySchema = withBodyExample(
  z.object({
    purpose: z.enum(MEDIA_PURPOSES).default('post').optional(),
    kind: z.enum(MEDIA_KINDS),
    contentType: z.string().min(3).max(128).optional(),
    mimeType: z.string().min(3).max(128).optional(),
    byteSize: z.number().int().positive().max(VIDEO_MAX_BYTES).optional(),
    filename: z.string().min(1).max(255).optional(),
    fileName: z.string().min(1).max(255).optional(),
    idempotencyKey: z.string().min(8).max(128).optional(),
  }),
  {
    kind: 'image',
    contentType: 'image/jpeg',
    filename: 'photo.jpg',
    byteSize: 1_200_000,
  },
);

export const batchPartsBodySchema = withBodyExample(
  z.object({
    // S3 allows up to 10_000 parts; 2GB @ 16MB ≈ 128 parts
    partNumbers: z.array(z.number().int().min(1).max(10000)).min(1).max(10000).optional(),
  }),
  { partNumbers: [1, 2, 3] },
);

export const completeUploadBodySchema = withBodyExample(
  z.object({
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
    thumbnailMediaId: z.string().uuid().optional(),
  }),
  {
    parts: [
      { partNumber: 1, etag: '"abc123"' },
      { partNumber: 2, etag: '"def456"' },
    ],
    thumbnailMediaId: '00000000-0000-4000-8000-000000000001',
  },
);

export const mediaIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const mediaDownloadQuerySchema = z.object({
  /** `source` = original object (default); `thumbnail` = WebP poster when available */
  variant: z.enum(MEDIA_DOWNLOAD_VARIANTS).default('source'),
  /** Optional attachment filename override */
  fileName: z.string().min(1).max(255).optional(),
});
