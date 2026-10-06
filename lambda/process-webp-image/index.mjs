import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import path from "path";

const s3 = new S3Client({ region: process.env.KEY_AWS_REGION });
const BUCKET_NAME = process.env.KEY_BUCKET_NAME;

async function uploadToS3(buffer, key, contentType) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=15552000,immutable"
    })
  );
  console.log(`✅ Uploaded: ${key} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

export const handler = async (event) => {
  try {
    await Promise.all(
      event.Records.map(async (record) => {
        const bucket = record.s3.bucket.name;
        const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
        const ext = path.extname(key).toLowerCase();

        if (![".jpg", ".jpeg", ".png", ".webp", ".avif", ".heic", ".heif"].includes(ext)) {
          console.log(`⏭ Skipping non-image: ${key}`);
          return;
        }

        const parts = key.split("/");
        if (parts.length < 6) {
          console.log(`⏭ Skipping unexpected key structure: ${key}`);
          return;
        }

        const [sourceDir, userId, mediaType, date, timestamp, fileName] = parts;
        const uuid = path.parse(fileName).name;
        const destBasePath = `destination/${userId}/images/${date}/${timestamp}/${uuid}`;

        const s3Object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const buffer = await s3Object.Body.transformToByteArray();

        const webpBuffer = await sharp(buffer, { fastShrinkOnLoad: true })
          .resize({ width: 1080, withoutEnlargement: true })
          .toColorspace("srgb")
          .modulate({ saturation: 1.03, brightness: 1.02 })
          .gamma()
          .webp({ quality: 75, smartSubsample: true, effort: 6 })
          .toBuffer();

        // Upload WebP
        await uploadToS3(webpBuffer, `${destBasePath}.webp`, "image/webp");

      })
    );

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error("❌ Error processing images:", err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
