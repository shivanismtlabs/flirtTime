import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const boolFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  APP_NAME: z.string().default('onevibe'),

  /**
   * Browser CORS allowlist (comma-separated origins).
   * Empty = onevibe production/staging + **always allow localhost / 127.0.0.1 (any port)**
   * so local Vite can call the live API after deploy.
   * Examples: https://production.onevibe.ai,https://custom.example.com
   * Open all (dev only): *
   */
  CORS_ORIGINS: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),

  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  /** Public HTTPS origin for Swagger “Servers” (e.g. https://onevibe.walit.in) */
  API_PUBLIC_URL: z
    .string()
    .optional()
    .default('https://onevibe.walit.in')
    .transform((v) => v.trim().replace(/\/+$/, '')),
  /** Comma-separated; default mounts every registered version */
  API_ENABLED_VERSIONS: z.string().default('v1,v2,v3'),
  API_DEFAULT_VERSION: z.string().default('v1'),

  SOCKET_HOST: z.string().default('0.0.0.0'),
  SOCKET_PORT: z.coerce.number().int().positive().default(3001),

  /** Staff admin HTTP API (separate process, no API versions) */
  ADMIN_API_HOST: z.string().default('0.0.0.0'),
  ADMIN_API_PORT: z.coerce.number().int().positive().default(3002),
  ADMIN_API_PUBLIC_URL: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim().replace(/\/+$/, '')),

  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),
  DB_SSL: boolFromEnv.default(false),
  DB_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  REDIS_ENABLED: boolFromEnv.default(true),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_USERNAME: z.string().optional().default(''),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),
  REDIS_TLS: boolFromEnv.default(false),
  REDIS_KEY_PREFIX: z.string().default('onevibe:'),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  REDIS_MAX_RETRIES_PER_REQUEST: z.coerce.number().int().nonnegative().default(3),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  /**
   * Max concurrent logged-in devices (active refresh tokens) per user.
   * When a new login would exceed this, other device sessions are revoked at random.
   */
  AUTH_MAX_ACTIVE_DEVICES: z.coerce.number().int().positive().default(1),

  AWS_REGION: z.string().default('ap-south-1'),
  AWS_ACCESS_KEY_ID: z.string().optional().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_BUCKET: z.string().default('onevibe-media'),
  /**
   * true  → publicUrl uses CloudFront / CDN base (AWS_CLOUDFRONT_URL)
   * false → publicUrl uses local API proxy http://localhost:API_PORT/media/...
   */
  S3_CLOUDFRONT_ENABLED: boolFromEnv.default(false),
  /** CDN origin, no trailing slash (e.g. https://staging.onevibe.ai or https://dxxx.cloudfront.net) */
  AWS_CLOUDFRONT_URL: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim().replace(/\/+$/, '')),
  /** Optional fallback public base when CloudFront enabled */
  S3_PUBLIC_BASE_URL: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim().replace(/\/+$/, '')),

  /**
   * Linkgram-compatible media Lambdas (S3-event payload invoke).
   * Empty name = skip invoke. Video Lambda generates HLS + thumbnail WebP.
   */
  AWS_VIDEO_LAMBDA_FUNCTION_NAME: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim().replace(/^["']|["']$/g, '')),
  AWS_IMAGE_LAMBDA_FUNCTION_NAME: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim().replace(/^["']|["']$/g, '')),
  /**
   * When true, API invokes video Lambda after upload complete / process.
   * When false, only explicit POST /media/:id/process invokes (if function name set).
   */
  MANUAL_LAMBDA_TRIGGER: boolFromEnv.default(true),

  TWILIO_ENABLED: boolFromEnv.default(false),
  TWILIO_ACCOUNT_SID: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  TWILIO_AUTH_TOKEN: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  /** Twilio Verify service SID (VA…) — phone OTP */
  TWILIO_SERVICE_SID: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  /** Optional E.164 From number for Messaging API */
  TWILIO_PHONE_NUMBER: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),

  /**
   * SendGrid for email OTP (preferred when enabled + configured).
   * true = send real email via SendGrid | false = skip SendGrid
   */
  SENDGRID_ENABLED: boolFromEnv.default(false),
  SENDGRID_API_KEY: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim().replace(/^["']|["']$/g, '')),
  SENDGRID_SENDER_EMAIL: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim().replace(/^["']|["']$/g, '')),

  /**
   * SMTP for email OTP (signup / login / forgot password).
   * Used when SendGrid is not configured.
   * true = send real email | false = log-only in development (`debugCode`)
   */
  SMTP_ENABLED: boolFromEnv.default(false),
  SMTP_HOST: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  SMTP_PASS: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  /** Optional From address; defaults to SMTP_USER */
  SMTP_FROM: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),

  /** OpenAI API key for caption / hashtag generation (ChatGPT) */
  OPENAI_API_KEY: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  /** Daily per-user limit for hashtag + caption generators */
  OPENAI_DAILY_LIMIT: z.coerce.number().int().positive().default(3),

  /** Agora RTC — audio/video calls (certificate never exposed to clients) */
  AGORA_APP_ID: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  AGORA_APP_CERTIFICATE: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),

  /**
   * Firebase Cloud Messaging (Admin SDK).
   * Preferred: FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.
   * Alternatives: FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON.
   * Disabled when FIREBASE_ENABLED=false or no creds.
   */
  FIREBASE_ENABLED: boolFromEnv.default(false),
  FIREBASE_PROJECT_ID: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  FIREBASE_CLIENT_EMAIL: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  /** PEM private key; use `\n` for newlines inside .env quotes */
  FIREBASE_PRIVATE_KEY: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  FIREBASE_DATABASE_URL: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  /** Absolute/relative path to service account JSON */
  FIREBASE_SERVICE_ACCOUNT_PATH: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  /** Inline service account JSON string (alternative to path) */
  FIREBASE_SERVICE_ACCOUNT_JSON: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),

  /**
   * Apple PushKit VoIP (incoming calls on iOS).
   * Uses Auth Key (.p8). Topic must end with `.voip` (e.g. com.app.bundle.voip).
   */
  APNS_ENABLED: boolFromEnv.default(false),
  APNS_KEY_ID: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  APNS_TEAM_ID: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  /** PEM private key; use `\n` for newlines inside .env quotes */
  APNS_PRIVATE_KEY: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  /** Bundle id + `.voip` (PushKit topic) */
  APNS_VOIP_TOPIC: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  /** true = api.push.apple.com | false = api.sandbox.push.apple.com */
  APNS_PRODUCTION: boolFromEnv.default(true),

  /**
   * Comma-separated public user UUIDs allowed for admin wallet APIs
   * (in addition to JWT role=admin).
   */
  ADMIN_USER_UUIDS: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),

  /**
   * When true, IAP verify credits without calling Google/Apple (web/dev).
   * Production should set false so Play / App Store Server API run.
   */
  IAP_SKIP_STORE_VERIFY: boolFromEnv.default(true),

  /** Play Console service account (androidpublisher). Empty = Android verify disabled. */
  GOOGLE_PLAY_CLIENT_EMAIL: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  /** PEM; use `\n` for newlines inside .env quotes */
  GOOGLE_PLAY_PRIVATE_KEY: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  GOOGLE_PLAY_PACKAGE_NAME: z
    .string()
    .optional()
    .default('com.app.onevibe')
    .transform((v) => v.trim()),

  /** App Store Connect API key (In-App Purchase). Empty = iOS verify disabled. */
  APPLE_IAP_ISSUER_ID: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  APPLE_IAP_KEY_ID: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  /** PKCS8 PEM; use `\n` for newlines inside .env quotes */
  APPLE_IAP_PRIVATE_KEY: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),
  APPLE_IAP_BUNDLE_ID: z
    .string()
    .optional()
    .default('com.onevibe.live')
    .transform((v) => v.trim()),

  /**
   * Google Sign-In — comma-separated OAuth client IDs (audiences) for ID token verify.
   * Include iOS, Android, and Web client IDs used by the apps.
   * Empty = Google social login disabled.
   */
  GOOGLE_CLIENT_IDS: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),

  /**
   * Apple Sign in with Apple — comma-separated client IDs (audiences).
   * Usually the iOS bundle id and/or Services ID for web.
   * Empty = Apple social login disabled.
   */
  APPLE_CLIENT_IDS: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim()),

  /**
   * Global IP rate limit. `0` = disable global limit (route-level limits still apply).
   * In non-production, global limit is off unless RATE_LIMIT_ENABLED=true.
   */
  RATE_LIMIT_MAX: z.coerce.number().int().nonnegative().default(200),
  RATE_LIMIT_TIME_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  /** Force global rate limit on/off; omit = on only in production when MAX > 0 */
  RATE_LIMIT_ENABLED: boolFromEnv.optional(),

  /** OpenAPI UI at `/docs` — omit to auto-enable outside production */
  SWAGGER_ENABLED: boolFromEnv.optional(),

  /**
   * Share / Universal Link landings (Linkgram-compatible deeplink module).
   * DEEPLINK_PUBLIC_URL defaults to API_PUBLIC_URL when empty.
   * Profile share links: `{origin}/api/v1/share/{username}`.
   */
  DEEPLINK_PUBLIC_URL: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim().replace(/\/+$/, '')),
  DEEPLINK_SCHEME: z.string().default('onevibe'),
  APP_STORE_URL: z
    .string()
    .optional()
    .default('https://apps.apple.com/us/app/onevibe-live/id6758932009')
    .transform((v) => v.trim()),
  PLAY_STORE_URL: z
    .string()
    .optional()
    .default('https://play.google.com/store/apps/details?id=com.app.onevibe')
    .transform((v) => v.trim()),
  DEEPLINK_OG_IMAGE_URL: z
    .string()
    .optional()
    .default('https://onevibe.ai/logo.jpg')
    .transform((v) => v.trim()),
  /** App Store numeric id for Smart App Banner */
  DEEPLINK_IOS_APP_STORE_ID: z.string().default('6758932009'),
  /** Comma-separated TeamID.bundleId entries for AASA */
  DEEPLINK_IOS_APP_IDS: z
    .string()
    .optional()
    .default('56LQJGKNZA.com.app.onevibe,56LQJGKNZA.com.onevibe.live')
    .transform((v) => v.trim()),
  /** Android applicationId for Digital Asset Links */
  DEEPLINK_ANDROID_PACKAGE: z.string().default('com.app.onevibe'),
  /**
   * Comma-separated SHA-256 cert fingerprints (upload + debug/release keys).
   * Format: AA:BB:CC:... (colon-separated hex).
   */
  DEEPLINK_ANDROID_SHA256_FINGERPRINTS: z
    .string()
    .optional()
    .default(
      'C6:F2:09:F4:6D:86:DE:34:F9:39:D8:30:7D:95:D6:34:AB:99:A4:BD:23:9C:2F:B3:47:1A:29:DB:65:66:DC:BB,14:16:8B:90:A1:17:DC:F7:09:DE:5A:24:0C:97:A3:1A:CF:B4:D0:F8:1C:EE:7B:0E:AB:34:13:C7:FD:BF:22:7B',
    )
    .transform((v) => v.trim()),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Environment validation failed');
  }

  return parsed.data;
}

export const env = parseEnv();

/** Knex / pg connection object built from discrete DB_* params. */
export function getDbConnection() {
  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl: env.DB_SSL ? { rejectUnauthorized: false } : undefined,
  };
}

/** Convenience URL (tools / debugging). Password is URL-encoded. */
export function getDatabaseUrl(): string {
  const user = encodeURIComponent(env.DB_USER);
  const password = encodeURIComponent(env.DB_PASSWORD);
  const sslQuery = env.DB_SSL ? '?sslmode=require' : '';
  return `postgresql://${user}:${password}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}${sslQuery}`;
}

/** ioredis connection options from discrete REDIS_* params. */
export function getRedisConnection(options?: { keyPrefix?: string }) {
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    username: env.REDIS_USERNAME || undefined,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
    tls: env.REDIS_TLS ? {} : undefined,
    keyPrefix: options?.keyPrefix,
    connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: env.REDIS_MAX_RETRIES_PER_REQUEST,
    lazyConnect: true,
  };
}

/** Convenience Redis URL (tools / debugging). */
export function getRedisUrl(): string {
  const auth =
    env.REDIS_PASSWORD.length > 0
      ? `${env.REDIS_USERNAME ? `${encodeURIComponent(env.REDIS_USERNAME)}:` : ''}${encodeURIComponent(env.REDIS_PASSWORD)}@`
      : '';
  const protocol = env.REDIS_TLS ? 'rediss' : 'redis';
  return `${protocol}://${auth}${env.REDIS_HOST}:${env.REDIS_PORT}/${env.REDIS_DB}`;
}
