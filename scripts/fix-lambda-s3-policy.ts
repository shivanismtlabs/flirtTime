/**
 * Attach S3 media/* access to process-video Lambda role
 * (Linkgram policy only allows source/* + destination/*).
 *
 * Usage: node --import tsx scripts/fix-lambda-s3-policy.ts
 */
import { config as loadEnv } from 'dotenv';
loadEnv();

import {
  GetRolePolicyCommand,
  IAMClient,
  ListRolePoliciesCommand,
  PutRolePolicyCommand,
} from '@aws-sdk/client-iam';

const region = process.env.AWS_REGION || 'eu-central-1';
const bucket = process.env.S3_BUCKET || 'ec1-s3-onevibe-media-prf';
const roleName = 'ec1-lmb-process-video-prf-role';
const policyName = 'onevibe-media-prefix-access';

const iam = new IAMClient({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const document = {
  Version: '2012-10-17',
  Statement: [
    {
      Sid: 'OneVibeMediaReadWrite',
      Effect: 'Allow',
      Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
      Resource: `arn:aws:s3:::${bucket}/media/*`,
    },
    {
      Sid: 'OneVibeMediaList',
      Effect: 'Allow',
      Action: ['s3:ListBucket'],
      Resource: `arn:aws:s3:::${bucket}`,
      Condition: {
        StringLike: {
          's3:prefix': ['media/*'],
        },
      },
    },
    // Keep Linkgram-compatible prefixes too
    {
      Sid: 'LinkgramSourceRead',
      Effect: 'Allow',
      Action: ['s3:GetObject', 's3:DeleteObject'],
      Resource: `arn:aws:s3:::${bucket}/source/*`,
    },
    {
      Sid: 'LinkgramDestinationWrite',
      Effect: 'Allow',
      Action: ['s3:PutObject'],
      Resource: `arn:aws:s3:::${bucket}/destination/*`,
    },
  ],
};

const listed = await iam.send(new ListRolePoliciesCommand({ RoleName: roleName }));
console.log('Inline policies on role:', listed.PolicyNames);

await iam.send(
  new PutRolePolicyCommand({
    RoleName: roleName,
    PolicyName: policyName,
    PolicyDocument: JSON.stringify(document),
  }),
);

const check = await iam.send(
  new GetRolePolicyCommand({ RoleName: roleName, PolicyName: policyName }),
);
console.log('Attached policy:', policyName);
console.log(decodeURIComponent(check.PolicyDocument || ''));
console.log('\nDone. Retry vibe video create — Lambda can now read/write media/*');
