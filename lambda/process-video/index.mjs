import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import { spawn } from "child_process";
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
            const videoStream = metadata.streams && metadata.streams.find(s => s.codec_type === 'video');
            const hasAudio = metadata.streams && metadata.streams.some(s => s.codec_type === 'audio');
            resolve({
                duration: metadata.format?.duration ?? 0,
                height: videoStream?.height ?? 1080,
                hasAudio: !!hasAudio
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
            const destDir = path.dirname(destKeyBase);

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
            const sourceHeight = videoMeta.height;
            const hlsTime = videoMeta.duration <= 15 ? 2 : videoMeta.duration <= 30 ? 4 : videoMeta.duration <= 60 ? 6 : 8;

            const variants = [];
            variants.push({ res: '360p', h: 360, v: '800k', buf: '1200k', crf: 28 });
            if (sourceHeight >= 480) variants.push({ res: '480p', h: 480, v: '1400k', buf: '2100k', crf: 26 });
            if (sourceHeight >= 720) variants.push({ res: '720p', h: 720, v: '2500k', buf: '3750k', crf: 23 });
            if (sourceHeight >= 1080) variants.push({ res: '1080p', h: 1080, v: '4500k', buf: '6750k', crf: 20 });

            // Ensure directories exist
            for (const variant of variants) {
                await fs.mkdir(path.join(hlsDir, variant.res), { recursive: true });
            }
            let filterComplex = '';
            if (variants.length > 1) {
                const filterSplit = `[0:v]split=${variants.length}` + variants.map((_, i) => `[v${i}]`).join('');
                const filterScales = variants.map((variant, i) => `[v${i}]scale=-2:${variant.h}:flags=lanczos[v${i}out]`).join(';');
                filterComplex = `${filterSplit};${filterScales}`;
            } else {
                filterComplex = `[0:v]scale=-2:${variants[0].h}:flags=lanczos[v0out]`;
            }

            // ─── Build raw ffmpeg args array ───────────────────────────────────────
            // ⚠️ We use child_process.spawn (NOT fluent-ffmpeg) for HLS encoding because
            // fluent-ffmpeg internally splits every outputOptions string on whitespace.
            // That breaks -var_stream_map whose value contains spaces between variants.
            // spawn() passes each array element as a single OS-level argument — no shell,
            // no splitting — so spaces inside values are always preserved correctly.
            const ffmpegArgs = [
                "-fflags", "+genpts",
                "-avoid_negative_ts", "make_zero",
                "-i", tempFilePath,
                "-preset", "medium",
                "-tune", "film",
                "-profile:v", "high",
                "-level", "4.2",
                "-pix_fmt", "yuv420p",
                "-r", "30",
                "-fps_mode", "cfr",
                "-filter_complex", filterComplex,
                "-map_metadata", "-1",
                "-start_number", "0",
                "-hls_time", `${hlsTime}`,
                "-hls_list_size", "0",
                "-hls_playlist_type", "vod",
                "-hls_flags", "independent_segments",
                "-hls_segment_type", "fmp4",
                "-hls_fmp4_init_filename", "init_%v.m4s",
                "-hls_segment_filename", `${hlsDir}/%v/seg_%03d.m4s`,
                "-force_key_frames", `expr:gte(t,n_forced*${hlsTime})`,
                "-g", `${30 * hlsTime}`,
                "-keyint_min", `${30 * hlsTime}`,
                "-sc_threshold", "0",
                "-x264-params", "ref=3:bframes=2:me=hex:subme=7:trellis=1",
            ];

            const varStreamMapArr = [];

            variants.forEach((variant, i) => {
                ffmpegArgs.push("-map", `[v${i}out]`);
                ffmpegArgs.push(`-c:v:${i}`, "libx264");
                ffmpegArgs.push(`-crf:${i}`, `${variant.crf}`);
                ffmpegArgs.push(`-b:v:${i}`, `${variant.v}`);
                ffmpegArgs.push(`-maxrate:v:${i}`, `${variant.v}`);
                ffmpegArgs.push(`-bufsize:v:${i}`, `${variant.buf}`);

                if (videoMeta.hasAudio) {
                    ffmpegArgs.push("-map", "0:a:0");
                    ffmpegArgs.push(`-c:a:${i}`, "aac");
                    ffmpegArgs.push(`-b:a:${i}`, "128k");
                    ffmpegArgs.push(`-ac:${i}`, "2");
                    ffmpegArgs.push(`-ar:${i}`, "48000");
                    varStreamMapArr.push(`v:${i},a:${i},name:${variant.res}`);
                } else {
                    varStreamMapArr.push(`v:${i},name:${variant.res}`);
                }
            });

            // Each element below is a single raw OS argument — spaces inside are safe.
            ffmpegArgs.push("-var_stream_map", varStreamMapArr.join(" "));
            ffmpegArgs.push("-master_pl_name", "master.m3u8");
            ffmpegArgs.push("-f", "hls");
            ffmpegArgs.push(`${hlsDir}/%v/index.m3u8`);

            await Promise.all([
                // ----- HLS Conversion via spawn (bypasses fluent-ffmpeg string splitting) -----
                new Promise((resolve, reject) => {
                    console.log("FFmpeg spawn args:", ["/opt/bin/ffmpeg", ...ffmpegArgs].join(" "));
                    const proc = spawn("/opt/bin/ffmpeg", ffmpegArgs);
                    const stderrLines = [];
                    proc.stderr.on("data", (data) => {
                        const line = data.toString();
                        stderrLines.push(line);
                        console.log("FFmpeg STDERR:", line.trim());
                    });
                    proc.on("close", (code) => {
                        if (code === 0) {
                            resolve();
                        } else {
                            reject(new Error(`ffmpeg exited with code ${code} | stderr: ${stderrLines.slice(-10).join("")}`));
                        }
                    });
                    proc.on("error", (err) => {
                        reject(new Error(`ffmpeg spawn error: ${err.message}`));
                    });
                }),

                // ----- Thumbnail Generation (Same as Post/Reel: 0.01s) -----
                new Promise((resolve, reject) => {
                    ffmpeg(tempFilePath)
                        .inputOptions([
                            "-fflags +genpts",
                            "-avoid_negative_ts", "make_zero"
                        ])
                        .outputOptions([
                            "-avoid_negative_ts make_zero"
                        ])
                        .screenshots({ timestamps: [0.01], filename: path.basename(thumbPath), folder: TMP_DIR, size: "720x?" })
                        .on("start", cmd => console.log("FFmpeg CMD:", cmd))
                        .on("stderr", line => console.log("FFmpeg STDERR LINE:", line))
                        .on("error", (err, stdout, stderr) => {
                            console.error("FFMPEG ERROR MESSAGE:", err.message);
                            console.error("FFMPEG STDOUT:", stdout);
                            console.error("FFMPEG STDERR:", stderr);
                            reject(err);
                        })
                        .on("end", () => {
                            console.log("✅ Thumbnail generated successfully");
                            resolve();
                        })
                }),
            ]);

            // Upload HLS files
            async function getFilesRec(dir) {
                const dirents = await fs.readdir(dir, { withFileTypes: true });
                const files = await Promise.all(dirents.map((dirent) => {
                    const res = path.resolve(dir, dirent.name);
                    return dirent.isDirectory() ? getFilesRec(res) : res;
                }));
                return Array.prototype.concat(...files);
            }

            const hlsFiles = await getFilesRec(hlsDir);
            await Promise.all(hlsFiles.map(async (filePath) => {
                const buffer = await fs.readFile(filePath);
                const relativePath = path.relative(hlsDir, filePath);
                const mimeType = filePath.endsWith(".m3u8")
                    ? "application/vnd.apple.mpegurl"
                    : filePath.endsWith(".m4s")
                        ? "video/iso.segment"
                        : "application/octet-stream";
                await uploadToS3(buffer, `${destDir}/${relativePath.replace(/\\/g, '/')}`, mimeType);
            }));

            // Convert Thumbnail to high-quality WebP
            const webpBuf = await sharp(thumbPath)
                .resize({ width: 360, withoutEnlargement: true })
                .webp({ quality: 75 })
                .toBuffer();

            // Matches the predicted path in Backend: destination/path/to/uuid.webp
            await uploadToS3(webpBuf, `${destKeyBase}.webp`, "image/webp");

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
