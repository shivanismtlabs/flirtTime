import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { IMAGE_MAX_BYTES } from './media.constants.js';
import { MediaController } from './media.controller.js';
import {
  batchPartsBodySchema,
  completeUploadBodySchema,
  createUploadSessionBodySchema,
  createUploadUrlBodySchema,
  mediaDownloadQuerySchema,
  mediaIdParamsSchema,
} from './media.schema.js';

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  const controller = new MediaController();
  tagRoutes(app, 'Media');

  await app.register(multipart, {
    limits: {
      fileSize: IMAGE_MAX_BYTES,
      files: 1,
    },
  });

  app.post(
    '/images',
    {
      schema: requireBearer({
        summary: 'Upload image (server → WebP)',
        description:
          'Send only multipart field `file` (PNG/JPEG/WebP/…). Optional field `purpose` (default post). Server converts to WebP, uploads to S3, returns ready media. Do not send contentType/filename/sizeBytes.',
        consumes: ['multipart/form-data'],
      }),
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
    },
    controller.uploadImage,
  );

  app.post(
    '/uploads',
    {
      schema: requireBearer({
        summary: 'Create upload session',
        description:
          'Creates a media row and returns either a single PUT presigned URL (≤8MB) or multipart session metadata (larger files, up to 2GB for video). Server chooses strategy from byteSize. Prefer POST /media/images for photos.',
        body: createUploadSessionBodySchema,
      }),
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 40,
          timeWindow: '1 minute',
        },
      },
    },
    controller.createUploadSession,
  );

  app.post(
    '/uploads/:id/parts',
    {
      schema: requireBearer({
        summary: 'Batch multipart part URLs',
        description:
          'Returns presigned UploadPart URLs. Pass partNumbers, or omit/empty body to sign all parts 1..partCount.',
        params: mediaIdParamsSchema,
        body: batchPartsBodySchema,
      }),
      preHandler: [authenticate],
    },
    controller.batchParts,
  );

  app.post(
    '/uploads/:id/complete',
    {
      schema: requireBearer({
        summary: 'Complete upload',
        description:
          'For put: verifies object exists via HeadObject. For multipart: completes with parts[{partNumber,etag}] then verifies size. Optional thumbnailMediaId (ready image) sets interim thumbnail_key. Videos also queue process-video Lambda for canonical WebP thumb. Optional width/height/durationMs.',
        params: mediaIdParamsSchema,
        body: completeUploadBodySchema,
      }),
      preHandler: [authenticate],
    },
    controller.complete,
  );

  app.post(
    '/uploads/:id/abort',
    {
      schema: requireBearer({
        summary: 'Abort upload',
        description: 'Aborts multipart upload (or deletes put object) and soft-deletes the media row.',
        params: mediaIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.abort,
  );

  app.post(
    '/upload-url',
    {
      schema: requireBearer({
        summary: 'Create upload URL (legacy alias)',
        description:
          'Alias of POST /uploads. Accepts contentType/filename or mimeType/fileName. Prefer POST /media/images for photos.',
        body: createUploadUrlBodySchema,
      }),
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 40,
          timeWindow: '1 minute',
        },
      },
    },
    controller.createUploadUrl,
  );

  app.get(
    '/:id/download',
    {
      schema: requireBearer({
        summary: 'Download media',
        description:
          'Returns a short-lived (15m) presigned S3 GET URL with Content-Disposition: attachment. Owner only. Defaults to the original object (`variant=source`); use `variant=thumbnail` for the WebP poster when available. Optional `fileName` overrides the attachment name.',
        params: mediaIdParamsSchema,
        querystring: mediaDownloadQuerySchema,
      }),
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
        },
      },
    },
    controller.download,
  );

  app.get(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Get media',
        description: 'Fetch media metadata by public UUID. Owner only.',
        params: mediaIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.getById,
  );

  app.delete(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Delete media',
        description: 'Soft-delete media owned by the authenticated user and remove the S3 object.',
        params: mediaIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.remove,
  );

  app.post(
    '/:id/process',
    {
      schema: requireBearer({
        summary: 'Process media (stub)',
        description:
          'Invokes Linkgram process-video Lambda (ffmpeg → HLS master.m3u8 + WebP thumb). Sets medias.thumbnail_key and medias.playback_key (destination/.../master.m3u8).',
        params: mediaIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.process,
  );
}
