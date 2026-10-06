import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs/promises";
import path from "path";

ffmpeg.setFfprobePath("/opt/bin/ffprobe");
ffmpeg.setFfmpegPath("/opt/bin/ffmpeg");
console.log("Using FFMPEG PATH:", "/opt/bin/ffmpeg");

const s3 = new S3Client({ region: process.env.KEY_AWS_REGION });
const TMP_DIR = "/tmp";
const BUCKET_NAME = process.env.KEY_BUCKET_NAME;

// -------- Utility Functions --------
async function getVideoMetadata(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
            resolve({
                duration: metadata.format?.duration ?? 0,
            });
        });
    });
}

async function uploadToS3(buffer, key, contentType) {
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=15552000, immutable"
    });
    await s3.send(command);
}

// -------- Lambda Handler --------
export const handler = async (event) => {
    try {
        for (const record of event.Records) {
            const bucket = record.s3.bucket.name;
            const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
            const ext = path.extname(key).toLowerCase();

            if (![".mp4", ".mov", ".mkv", ".avi", ".webm"].includes(ext)) {
                console.log("⏭ Skipping non-video file:", key);
                continue;
            }

            console.log("Processing file:", key);
            const parts = key.split("/");
            const fileName = parts[parts.length - 1];
            const uuid = path.parse(fileName).name;

            // Predicted destination based on Post/Reel naming convention: source -> destination
            const destKeyBase = key.replace("source", "destination").replace(ext, "");
            // const destDir = path.dirname(destKeyBase);

            const destDir = path.dirname(
                key.replace("source", "destination")
            );
            // Download file to /tmp
            const getCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
            const fileObj = await s3.send(getCommand);
            const tempFilePath = path.join(TMP_DIR, `${uuid}${ext}`);
            const bodyBuffer = await fileObj.Body.transformToByteArray();
            await fs.writeFile(tempFilePath, Buffer.from(bodyBuffer));

            // ------------------------- PROCESSING -------------------------
            const hlsDir = path.join(TMP_DIR, `hls_${uuid}`);
            const thumbPath = path.join(TMP_DIR, `${uuid}_thumb.jpg`);
            await fs.mkdir(hlsDir, { recursive: true });

            const videoMeta = await getVideoMetadata(tempFilePath);
            const hlsTime = videoMeta.duration <= 15 ? 2 : videoMeta.duration <= 30 ? 4 : videoMeta.duration <= 60 ? 6 : 8;

            await Promise.all([
                // ----- HLS Conversion (Required for Reels, optional but kept for unified flow) -----
                new Promise((resolve, reject) => {
                    ffmpeg(tempFilePath)
                        .outputOptions([
                            "-crf 20",
                            "-preset medium",
                            "-c:v libx264",
                            "-tune film",
                            "-profile:v high",
                            "-level 4.2",
                            "-pix_fmt yuv420p",
                            "-r 30",
                            "-vsync cfr",
                            // "-vf scale=-2:1080:flags=lanczos",
                            // "-vf scale='min(1920,iw)':min'(1080,ih)':force_original_aspect_ratio=decrease",
                            "-maxrate 3M",
                            "-bufsize 6M",
                            "-movflags +faststart+frag_keyframe+empty_moov",
                            "-map_metadata -1",
                            "-start_number 0",
                            "-hls_time", `${hlsTime}`,
                            "-hls_list_size 0",
                            "-hls_playlist_type vod",
                            "-hls_flags independent_segments",
                            "-hls_segment_type", "fmp4",
                            "-hls_fmp4_init_filename", "init.m4s",
                            "-force_key_frames", `expr:gte(t,n_forced*${hlsTime})`,
                            "-g", `${30 * hlsTime}`,
                            "-keyint_min", `${30 * hlsTime}`,
                            "-sc_threshold 0",
                            "-f hls",
                            "-x264-params", "ref=3:bframes=2:me=hex:subme=7:trellis=1"
                        ])
                        .audioCodec("aac")
                        .outputOptions([
                            "-b:a 128k",
                            "-ac 2",
                            "-ar 48000"
                        ])
                        .output(path.join(hlsDir, `${uuid}.m3u8`))
                        // .output(path.join(hlsDir, `master.m3u8`))
                        .on("end", () => resolve())
                        .on("error", (err) => reject(err))
                        .run();
                }),

                // ----- Thumbnail Generation (Same as Post/Reel: 0.01s) -----
                new Promise((resolve, reject) => {
                    ffmpeg(tempFilePath)
                        .screenshots({ timestamps: [0.01], filename: path.basename(thumbPath), folder: TMP_DIR, size: "720x?" })
                        .on("end", resolve)
                        .on("error", reject);
                }),
            ]);

            // Upload HLS files
            const hlsFiles = await fs.readdir(hlsDir);
            await Promise.all(hlsFiles.map(async (f) => {
                const buffer = await fs.readFile(path.join(hlsDir, f));
                const mimeType = f.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : f.endsWith(".m4s") ? "video/mp4" : "application/octet-stream";
                await uploadToS3(buffer, `${destDir}/${f}`, mimeType);
            }));

            // Convert Thumbnail to high-quality WebP
            const webpBuf = await sharp(thumbPath)
                .resize({ width: 480, withoutEnlargement: true })
                .webp({ quality: 90 })
                .toBuffer();

            // Matches the predicted path in Backend: destination/path/to/uuid.webp
            // await uploadToS3(webpBuf, `${destKeyBase}.webp`, "image/webp");
            await uploadToS3(
                webpBuf,
                `${destDir}/${uuid}.webp`,
                "image/webp"
            );
            // Clean temp
            await fs.rm(hlsDir, { recursive: true, force: true });
            await fs.unlink(tempFilePath).catch(() => { });
            await fs.unlink(thumbPath).catch(() => { });

            console.log("✅ Video processed to destination folder:", destDir);
        }

        return { statusCode: 200 };
    } catch (err) {
        console.error("❌ Lambda error:", err);
        return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
    }
};