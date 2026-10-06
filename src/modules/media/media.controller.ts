import type { FastifyReply, FastifyRequest } from 'fastify';
import { ValidationError } from '../../shared/errors/index.js';
import { MediaService } from './media.service.js';
import type {
  BatchPartsInput,
  CompleteUploadInput,
  CreateUploadSessionInput,
  DownloadMediaInput,
} from './media.types.js';
import { MEDIA_PURPOSES } from './media.constants.js';

function headerString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeSessionBody(
  body: Record<string, unknown>,
  idempotencyFromHeader?: string,
): CreateUploadSessionInput {
  const mimeType = (body.mimeType ?? body.contentType) as string | undefined;
  if (!mimeType) throw new ValidationError('contentType (or mimeType) is required');
  if (!body.kind) throw new ValidationError('kind is required');

  const purpose = (body.purpose as string | undefined) ?? 'post';
  if (!MEDIA_PURPOSES.includes(purpose as (typeof MEDIA_PURPOSES)[number])) {
    throw new ValidationError(`Invalid purpose: ${purpose}`);
  }

  const fileNameRaw = (body.fileName ?? body.filename) as string | undefined;
  const fileName = fileNameRaw?.trim() || undefined;

  const sizeRaw = body.sizeBytes ?? body.byteSize;
  let byteSize: number | undefined;
  if (sizeRaw != null) {
    byteSize = Number(sizeRaw);
    if (!Number.isFinite(byteSize) || byteSize < 1 || !Number.isInteger(byteSize)) {
      throw new ValidationError('sizeBytes must be a positive integer');
    }
  }

  const idempotencyKey =
    (body.idempotencyKey as string | undefined) ?? idempotencyFromHeader;

  return {
    purpose: purpose as CreateUploadSessionInput['purpose'],
    kind: body.kind as CreateUploadSessionInput['kind'],
    mimeType,
    byteSize,
    fileName,
    idempotencyKey,
  };
}

export class MediaController {
  constructor(private readonly service = new MediaService()) {}

  /** Multipart: field `file` (+ optional `purpose`). Server converts to WebP. */
  uploadImage = async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { purpose?: string };
    // Prefer query — multipart fields after `file` are often missing from file.fields
    let purpose: string | undefined = q.purpose;

    const file = await request.file();
    if (!file) {
      throw new ValidationError('Multipart field "file" is required');
    }

    const buffer = await file.toBuffer();

    if (!purpose) {
      const fields = file.fields as Record<string, unknown> | undefined;
      const rawPurpose = fields?.purpose;
      if (
        Array.isArray(rawPurpose) &&
        rawPurpose[0] &&
        typeof rawPurpose[0] === 'object' &&
        rawPurpose[0] !== null &&
        'value' in rawPurpose[0]
      ) {
        purpose = String((rawPurpose[0] as { value: unknown }).value);
      } else if (
        rawPurpose &&
        typeof rawPurpose === 'object' &&
        rawPurpose !== null &&
        'value' in rawPurpose
      ) {
        purpose = String((rawPurpose as { value: unknown }).value);
      }
    }

    const result = await this.service.uploadImage(request.user!.sub, {
      buffer,
      originalName: file.filename,
      purpose,
      idempotencyKey: headerString(request.headers['idempotency-key']),
    });

    return reply.code(201).send(result);
  };

  createUploadSession = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.service.createUploadSession(
      request.user!.sub,
      normalizeSessionBody(
        request.body as Record<string, unknown>,
        headerString(request.headers['idempotency-key']),
      ),
    );
    return reply.code(201).send(result);
  };

  createUploadUrl = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = { ...(request.body as Record<string, unknown>) };
    if (body.sizeBytes == null && body.byteSize == null) {
      body.sizeBytes = 1;
    }
    const result = await this.service.requestUploadUrl(
      request.user!.sub,
      normalizeSessionBody(body, headerString(request.headers['idempotency-key'])),
    );
    return reply.code(201).send(result);
  };

  batchParts = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.batchPartUrls(
      request.user!.sub,
      id,
      (request.body as BatchPartsInput) ?? {},
    );
    return reply.send(result);
  };

  complete = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.completeUpload(
      request.user!.sub,
      id,
      (request.body as CompleteUploadInput) ?? {},
    );
    return reply.send(result);
  };

  abort = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.abortUpload(request.user!.sub, id);
    return reply.send(result);
  };

  getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.getById(request.user!.sub, id);
    return reply.send(result);
  };

  download = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.createDownload(
      request.user!.sub,
      id,
      (request.query as DownloadMediaInput) ?? { variant: 'source' },
    );
    return reply.send(result);
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await this.service.remove(request.user!.sub, id);
    return reply.code(204).send();
  };

  process = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.process(request.user!.sub, id);
    return reply.send(result);
  };
}
