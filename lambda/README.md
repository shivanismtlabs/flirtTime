# OneVibe media Lambdas

Exact copies from `LinkgramBackend/lambda/` (same handlers Linkgram uses).

| Folder | Env (`AWS_*_LAMBDA_FUNCTION_NAME`) | What it does |
|--------|-------------------------------------|--------------|
| `process-video/` | `AWS_VIDEO_LAMBDA_FUNCTION_NAME` | ffmpeg HLS + thumbnail @ 0.01s → WebP |
| `process-webp-image/` | `AWS_IMAGE_LAMBDA_FUNCTION_NAME` | image → WebP |

## Path convention (must match Lambda IAM)

Linkgram Lambda role typically allows:
- `s3:GetObject` on `bucket/source/*`
- `s3:PutObject` on `bucket/destination/*`

OneVibe **videos** upload to:
`source/{userUuid}/posts/videos/{YYYY_MM_DD}/{ts}/{mediaUuid}-file.ext`

Lambda writes thumb to:
`destination/{userUuid}/posts/videos/{YYYY_MM_DD}/{ts}/{mediaUuid}-file.webp`

Images stay under `media/...` (server-side sharp, no video Lambda).

## Lambda env (AWS console)

- `KEY_AWS_REGION` — e.g. `eu-central-1`
- `KEY_BUCKET_NAME` — must match API `S3_BUCKET`
- ffmpeg layer: `/opt/bin/ffmpeg` + `/opt/bin/ffprobe`

## API invoke

After video `/complete` (and on vibe create), API invokes with an S3-event payload.

Redeploy `process-video` when you change this folder.
