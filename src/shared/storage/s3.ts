import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/index.js';
import { status } from '../logger/index.js';

let s3: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!s3) {
    const hasKeys = Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
    s3 = new S3Client({
      region: env.AWS_REGION,
      credentials: hasKeys
        ? {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
      // AWS SDK v3 default flexible checksums break browser/Postman presigned PUTs (403).
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });

    if (hasKeys) {
      status.ok('S3', `${env.S3_BUCKET} (${env.AWS_REGION})`);
      status.ok(
        'Media URL',
        env.S3_CLOUDFRONT_ENABLED
          ? `CloudFront ON → ${env.AWS_CLOUDFRONT_URL || env.S3_PUBLIC_BASE_URL}`
          : `CloudFront OFF → server ${mediaServerBaseUrl()}/media/...`,
      );
    } else {
      status.warn('S3', `${env.S3_BUCKET} — credentials missing`);
    }
  }

  return s3;
}

export async function createUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 900,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  // Do NOT add content-type to signableHeaders — Postman/clients often send a
  // different Content-Type than the session and that causes SignatureDoesNotMatch.
  // Checksums stay off via S3Client requestChecksumCalculation: WHEN_REQUIRED.
  return getSignedUrl(getS3Client(), command, { expiresIn: expiresInSeconds });
}

/** Server-side put (image convert pipeline) */
export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function createDownloadUrl(
  key: string,
  expiresInSeconds = 900,
  opts?: { fileName?: string; contentType?: string },
): Promise<string> {
  const rawName =
    opts?.fileName?.trim() ||
    key.split('/').pop() ||
    'media';
  const safe =
    rawName.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 180) || 'media';
  const disposition = `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;

  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ResponseContentDisposition: disposition,
    ...(opts?.contentType ? { ResponseContentType: opts.contentType } : {}),
  });

  return getSignedUrl(getS3Client(), command, { expiresIn: expiresInSeconds });
}

/** Fetch object for local /media/* proxy */
export async function getObject(key: string): Promise<{
  body: import('node:stream').Readable;
  contentType?: string;
  contentLength?: number;
} | null> {
  try {
    const out = await getS3Client().send(
      new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
      }),
    );
    if (!out.Body) return null;
    return {
      body: out.Body as import('node:stream').Readable,
      contentType: out.ContentType,
      contentLength: out.ContentLength,
    };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }),
  );
}

export async function headObject(key: string): Promise<{ contentLength?: number; contentType?: string } | null> {
  try {
    const out = await getS3Client().send(
      new HeadObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
      }),
    );
    return {
      contentLength: out.ContentLength,
      contentType: out.ContentType,
    };
  } catch {
    return null;
  }
}

export async function createMultipartUpload(
  key: string,
  contentType: string,
): Promise<string> {
  const out = await getS3Client().send(
    new CreateMultipartUploadCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
  );
  if (!out.UploadId) {
    throw new Error('S3 CreateMultipartUpload did not return UploadId');
  }
  return out.UploadId;
}

export async function presignUploadPart(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresInSeconds = 3600,
): Promise<string> {
  const command = new UploadPartCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(getS3Client(), command, { expiresIn: expiresInSeconds });
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: Array<{ PartNumber: number; ETag: string }>,
): Promise<void> {
  await getS3Client().send(
    new CompleteMultipartUploadCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
          .slice()
          .sort((a, b) => a.PartNumber - b.PartNumber)
          .map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag })),
      },
    }),
  );
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  await getS3Client().send(
    new AbortMultipartUploadCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      UploadId: uploadId,
    }),
  );
}

export function publicUrl(key: string): string {
  const cleanKey = key.replace(/^\//, '');

  // CloudFront ON → CDN URL (requires bucket/OAC access for that prefix)
  if (env.S3_CLOUDFRONT_ENABLED) {
    const cdn = (env.AWS_CLOUDFRONT_URL || env.S3_PUBLIC_BASE_URL || '')
      .trim()
      .replace(/\/+$/, '');
    if (!cdn) {
      throw new Error('S3_CLOUDFRONT_ENABLED=true but AWS_CLOUDFRONT_URL is empty');
    }
    return `${cdn}/${cleanKey}`;
  }

  // CloudFront OFF → API proxy GET /media/*
  // Videos/thumbs under source/ + destination/ must go through the proxy
  // (CDN currently 403s those prefixes — OAC only covers older paths).
  // Gift GIFs live under chat-media/ (Linkgram key) — no /chat-media route.
  // Older catalog rows use gifts/animations/ and icons/animations/.
  const server = mediaServerBaseUrl();
  if (
    cleanKey.startsWith('source/') ||
    cleanKey.startsWith('destination/') ||
    cleanKey.startsWith('chat-media/') ||
    cleanKey.startsWith('gifts/') ||
    cleanKey.startsWith('icons/')
  ) {
    return `${server}/media/${cleanKey}`;
  }
  return `${server}/${cleanKey}`;
}

/** API origin used when CloudFront is disabled (client-facing media URLs). */
function mediaServerBaseUrl(): string {
  // Prefer public origin so responses never leak 127.0.0.1 to browsers
  // (live often runs NODE_ENV=development with API_PORT=3018).
  const publicBase = (env.API_PUBLIC_URL || '').replace(/\/+$/, '');
  if (publicBase) return publicBase;
  return `http://127.0.0.1:${env.API_PORT}`;
}

