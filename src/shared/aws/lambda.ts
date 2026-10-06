import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { env } from '../config/env.js';

let client: LambdaClient | null = null;

function getLambdaClient(): LambdaClient {
  if (!client) {
    const hasKeys = Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
    client = new LambdaClient({
      region: env.AWS_REGION,
      ...(hasKeys
        ? {
            credentials: {
              accessKeyId: env.AWS_ACCESS_KEY_ID,
              secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }
  return client;
}

/** Linkgram-compatible: predicted WebP key after process-video Lambda. */
export function derivedVideoThumbnailKey(videoKey: string): string {
  const slash = videoKey.lastIndexOf('/');
  const name = slash >= 0 ? videoKey.slice(slash + 1) : videoKey;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  const withoutExt = ext ? videoKey.slice(0, -ext.length) : videoKey;
  // process-video replaces leading path segment `source` → `destination`
  const destBase = withoutExt.includes('source')
    ? withoutExt.replace('source', 'destination')
    : withoutExt;
  return `${destBase}.webp`;
}

/**
 * Linkgram-compatible: predicted HLS master playlist after process-video Lambda.
 * `source/.../uuid-file.mp4` → `destination/.../master.m3u8`
 */
export function derivedVideoHlsKey(videoKey: string): string {
  const slash = videoKey.lastIndexOf('/');
  const name = slash >= 0 ? videoKey.slice(slash + 1) : videoKey;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  const withoutExt = ext ? videoKey.slice(0, -ext.length) : videoKey;
  const destBase = withoutExt.includes('source')
    ? withoutExt.replace('source', 'destination')
    : withoutExt;
  const destDir = destBase.includes('/')
    ? destBase.slice(0, destBase.lastIndexOf('/'))
    : destBase;
  return `${destDir}/master.m3u8`;
}

export function isVideoLambdaConfigured(): boolean {
  return Boolean(env.AWS_VIDEO_LAMBDA_FUNCTION_NAME?.trim());
}

export function isImageLambdaConfigured(): boolean {
  return Boolean(env.AWS_IMAGE_LAMBDA_FUNCTION_NAME?.trim());
}

/**
 * Invoke media Lambda with an S3-event-shaped payload (same as Linkgram `invokeLambda`).
 * Waits for the function (RequestResponse).
 */
export async function invokeMediaLambda(
  functionName: string,
  sourceKey: string,
): Promise<void> {
  const s3Event = {
    Records: [
      {
        s3: {
          bucket: { name: env.S3_BUCKET },
          object: { key: sourceKey },
        },
      },
    ],
  };

  const response = await getLambdaClient().send(
    new InvokeCommand({
      FunctionName: functionName,
      Payload: Buffer.from(JSON.stringify(s3Event)),
      InvocationType: 'RequestResponse',
    }),
  );

  const payloadStr = response.Payload
    ? Buffer.from(response.Payload).toString('utf8')
    : '';

  let payload: { statusCode?: number; body?: string; raw?: string } = {};
  try {
    payload = JSON.parse(payloadStr || '{}') as typeof payload;
  } catch {
    payload = { raw: payloadStr };
  }

  if (response.FunctionError) {
    throw new Error(`Lambda FunctionError: ${response.FunctionError} ${payloadStr}`);
  }
  if (payload.statusCode != null && payload.statusCode !== 200) {
    throw new Error(
      `Lambda returned status ${payload.statusCode}: ${payload.body ?? payloadStr}`,
    );
  }
}

/** process-video Lambda (HLS + thumbnail @ 0.01s → WebP). */
export async function invokeProcessVideo(sourceKey: string): Promise<void> {
  const name = env.AWS_VIDEO_LAMBDA_FUNCTION_NAME.trim();
  if (!name) {
    throw new Error('AWS_VIDEO_LAMBDA_FUNCTION_NAME is not configured');
  }
  await invokeMediaLambda(name, sourceKey);
}

/** process-webp-image Lambda (optional). */
export async function invokeProcessImage(sourceKey: string): Promise<void> {
  const name = env.AWS_IMAGE_LAMBDA_FUNCTION_NAME.trim();
  if (!name) {
    throw new Error('AWS_IMAGE_LAMBDA_FUNCTION_NAME is not configured');
  }
  await invokeMediaLambda(name, sourceKey);
}
