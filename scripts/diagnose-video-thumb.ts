/**
 * Diagnose video thumbnail Lambda for a media UUID.
 * Usage: node --import tsx scripts/diagnose-video-thumb.ts <mediaUuid>
 */
import { config as loadEnv } from 'dotenv';
loadEnv();

import { HeadObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import pg from 'pg';

const mediaUuid = process.argv[2];
if (!mediaUuid) {
  console.error('Usage: diagnose-video-thumb.ts <mediaUuid>');
  process.exit(1);
}

const region = process.env.AWS_REGION || 'eu-central-1';
const bucket = process.env.S3_BUCKET || '';
const fn = (process.env.AWS_VIDEO_LAMBDA_FUNCTION_NAME || '').replace(/^["']|["']$/g, '');

const s3 = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});
const lambda = new LambdaClient({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

function derivedThumb(key: string) {
  const ext = key.includes('.') ? key.slice(key.lastIndexOf('.')) : '';
  const without = ext ? key.slice(0, -ext.length) : key;
  const base = without.includes('source') ? without.replace('source', 'destination') : without;
  return `${base}.webp`;
}

const client = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

await client.connect();
const { rows } = await client.query(
  `select uuid, kind, status, key, thumbnail_key, error_message from media where uuid = $1`,
  [mediaUuid],
);
await client.end();

if (!rows[0]) {
  console.error('Media not found');
  process.exit(1);
}

const row = rows[0];
const thumb = derivedThumb(row.key);
console.log('media', {
  uuid: row.uuid,
  kind: row.kind,
  status: row.status,
  key: row.key,
  thumbnail_key: row.thumbnail_key,
  error_message: row.error_message,
  expectedThumb: thumb,
  lambdaFn: fn,
  bucket,
});

async function head(key: string) {
  try {
    const h = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { ok: true, size: h.ContentLength };
  } catch (e: any) {
    return { ok: false, code: e?.name || e?.Code || String(e) };
  }
}

console.log('video head', await head(row.key));
console.log('thumb head', await head(thumb));

const prefix = row.key.slice(0, row.key.lastIndexOf('/') + 1);
const listed = await s3.send(
  new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 30 }),
);
console.log(
  'prefix objects',
  (listed.Contents || []).map((o) => o.Key),
);

const invoke = process.argv.includes('--invoke');
if (invoke) {
  console.log('Invoking Lambda…');
  const res = await lambda.send(
    new InvokeCommand({
      FunctionName: fn,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(
        JSON.stringify({
          Records: [
            {
              s3: {
                bucket: { name: bucket },
                object: { key: row.key },
              },
            },
          ],
        }),
      ),
    }),
  );
  const payload = res.Payload ? Buffer.from(res.Payload).toString('utf8') : '';
  console.log('FunctionError', res.FunctionError || null);
  console.log('Payload', payload.slice(0, 2000));
  console.log('thumb head after', await head(thumb));
}
