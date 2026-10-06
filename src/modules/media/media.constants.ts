export const MEDIA_PURPOSES = [
  'avatar',
  'cover',
  'post',
  'story',
  'chat',
  'document',
] as const;

export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

export const MEDIA_KINDS = ['image', 'video', 'audio', 'file'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_STRATEGIES = ['put', 'multipart'] as const;
export type MediaStrategy = (typeof MEDIA_STRATEGIES)[number];

/** Soft thresholds / hard caps */
export const IMAGE_MAX_BYTES = 15 * 1024 * 1024; // 15MB
export const VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
export const AUDIO_MAX_BYTES = 50 * 1024 * 1024;
export const FILE_MAX_BYTES = 50 * 1024 * 1024;

/** Prefer multipart above this size */
export const MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024; // 8MB

/** Part size for multipart (keeps part count <= 128 at 2GB) */
export const MULTIPART_PART_SIZE_BYTES = 16 * 1024 * 1024; // 16MB

export const PUT_URL_EXPIRES_SECONDS = 900; // 15m
/** Long enough for slow 2GB multipart uploads */
export const MULTIPART_URL_EXPIRES_SECONDS = 6 * 3600; // 6h
/** Presigned GET for authenticated media download */
export const DOWNLOAD_URL_EXPIRES_SECONDS = 900; // 15m

export const MEDIA_DOWNLOAD_VARIANTS = ['source', 'thumbnail'] as const;
export type MediaDownloadVariant = (typeof MEDIA_DOWNLOAD_VARIANTS)[number];

export const ALLOWED_MIME: Record<MediaKind, readonly string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
  video: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/webm', 'audio/ogg'],
  file: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
  ],
};

export function maxBytesForKind(kind: MediaKind): number {
  switch (kind) {
    case 'image':
      return IMAGE_MAX_BYTES;
    case 'video':
      return VIDEO_MAX_BYTES;
    case 'audio':
      return AUDIO_MAX_BYTES;
    default:
      return FILE_MAX_BYTES;
  }
}

export function isMimeAllowed(kind: MediaKind, mime: string): boolean {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return (ALLOWED_MIME[kind] as readonly string[]).includes(base);
}

export function sanitizeFileName(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? 'file';
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'file';
}

export function buildObjectKey(params: {
  purpose: MediaPurpose;
  userUuid: string;
  mediaUuid: string;
  fileName: string;
  /** Videos use Linkgram `source/...` so process-video IAM (source/* → destination/*) works */
  kind?: MediaKind;
}): string {
  const safe = sanitizeFileName(params.fileName);

  // Linkgram process-video role: GetObject source/*, PutObject destination/*
  if (params.kind === 'video') {
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const datePath = `${yyyy}_${mm}_${dd}`;
    const timestamp = Date.now();
    const postType =
      params.purpose === 'post'
        ? 'posts'
        : params.purpose === 'story'
          ? 'stories'
          : params.purpose === 'chat'
            ? 'chat'
            : params.purpose;
    return `source/${params.userUuid}/${postType}/videos/${datePath}/${timestamp}/${params.mediaUuid}-${safe}`;
  }

  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `media/${params.purpose}/${params.userUuid}/${yyyy}/${mm}/${params.mediaUuid}-${safe}`;
}

export function computePartCount(byteSize: number, partSize = MULTIPART_PART_SIZE_BYTES): number {
  return Math.max(1, Math.ceil(byteSize / partSize));
}

export function defaultFileNameForMime(mimeType: string, kind: MediaKind): string {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const byMime: Record<string, string> = {
    'image/jpeg': 'image.jpg',
    'image/png': 'image.png',
    'image/webp': 'image.webp',
    'image/gif': 'image.gif',
    'image/heic': 'image.heic',
    'image/heif': 'image.heif',
    'video/mp4': 'video.mp4',
    'video/quicktime': 'video.mov',
    'video/webm': 'video.webm',
    'audio/mpeg': 'audio.mp3',
    'audio/mp4': 'audio.m4a',
    'audio/aac': 'audio.aac',
    'audio/wav': 'audio.wav',
    'audio/webm': 'audio.webm',
    'audio/ogg': 'audio.ogg',
    'application/pdf': 'file.pdf',
  };
  return byMime[base] ?? `${kind}.bin`;
}

export function chooseStrategy(kind: MediaKind, byteSize?: number | null): MediaStrategy {
  // Images always use single PUT (cap 15MB).
  if (kind === 'image') return 'put';
  // Videos always multipart — chunked upload is more reliable on mobile / flaky networks.
  if (kind === 'video') return 'multipart';
  // Unknown size → multipart (safer for large files)
  if (byteSize == null) return 'multipart';
  return byteSize > MULTIPART_THRESHOLD_BYTES ? 'multipart' : 'put';
}
