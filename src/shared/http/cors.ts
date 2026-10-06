import type { FastifyCorsOptions } from '@fastify/cors';
import { env } from '../config/env.js';

/**
 * Fixed production / staging web origins.
 * Local loopback is handled separately (any port) so local Vite can hit live API.
 */
const BUILTIN_WEB_ORIGINS = [
  'https://production.onevibe.ai',
  'https://www.production.onevibe.ai',
  'https://onevibe.ai',
  'https://www.onevibe.ai',
  'https://staging.onevibe.ai',
  'https://www.staging.onevibe.ai',
  'https://control.onevibe.ai',
  'https://www.control.onevibe.ai',
  'https://onevibe.walit.in',
  'https://www.onevibe.walit.in',
  'https://onevibeapp.walit.in',
  'https://www.onevibeapp.walit.in',
  // Common local ports (any port also matched via isLocalDevOrigin)
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:8080',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:8080',
] as const;

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function uniqueOrigins(list: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const o = normalizeOrigin(raw);
    if (!o || seen.has(o)) continue;
    seen.add(o);
    out.push(o);
  }
  return out;
}

/**
 * True for browser apps running on the developer machine (any port).
 * Allows local Vite (`npm run dev`) to call the **live** API without
 * listing every random Vite port in env.
 */
export function isLocalDevOrigin(origin: string): boolean {
  try {
    const u = new URL(normalizeOrigin(origin));
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host === '::1'
    );
  } catch {
    return false;
  }
}

/** Live web apps on walit.in (onevibe.walit.in, onevibeapp.walit.in, …). */
export function isWalitWebOrigin(origin: string): boolean {
  try {
    const u = new URL(normalizeOrigin(origin));
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return host === 'walit.in' || host.endsWith('.walit.in');
  } catch {
    return false;
  }
}

export const CORS_ALLOW_HEADERS =
  'Content-Type, Authorization, Range, X-Request-Id, X-Requested-With, Accept, Origin, X-Device, X-Device-Platform, X-Platform, Device, Platform, version';

export const CORS_ALLOW_METHODS =
  'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS';

/**
 * Resolved allowlist for CORS.
 * - CORS_ORIGINS=* → open (reflect any)
 * - CORS_ORIGINS=a,b → those + builtin + local loopback (any port)
 * - empty → builtin onevibe domains + local loopback (any port)
 */
export function resolveCorsAllowlist():
  | { mode: 'open' }
  | { mode: 'list'; origins: Set<string> } {
  const raw = env.CORS_ORIGINS;
  if (raw === '*') {
    return { mode: 'open' };
  }

  const fromEnv = raw
    ? raw
        .split(',')
        .map((s) => normalizeOrigin(s))
        .filter(Boolean)
    : [];

  const extras: string[] = [];
  if (env.API_PUBLIC_URL) extras.push(env.API_PUBLIC_URL);
  if (env.ADMIN_API_PUBLIC_URL) extras.push(env.ADMIN_API_PUBLIC_URL);
  if (env.AWS_CLOUDFRONT_URL) extras.push(env.AWS_CLOUDFRONT_URL);

  const origins = uniqueOrigins([
    ...BUILTIN_WEB_ORIGINS,
    ...fromEnv,
    ...extras,
  ]);

  return {
    mode: 'list',
    origins: new Set(origins),
  };
}

/** Whether this Origin header may receive Access-Control-Allow-Origin. */
export function isCorsOriginAllowed(origin: string | null | undefined): boolean {
  if (!origin) return false;
  const o = normalizeOrigin(origin);
  const list = resolveCorsAllowlist();
  if (list.mode === 'open') return true;
  if (list.origins.has(o)) return true;
  // Always allow local machine browsers → live or local API
  if (isLocalDevOrigin(o)) return true;
  if (isWalitWebOrigin(o)) return true;
  return false;
}

/**
 * Value for Access-Control-Allow-Origin (never `*` when credentials).
 * Returns null when origin must not be echoed (callers may omit header).
 */
export function corsAllowOriginHeader(
  requestOrigin: string | string[] | undefined,
): string | null {
  const origin = Array.isArray(requestOrigin)
    ? requestOrigin[0]
    : requestOrigin;
  if (!origin?.trim()) return null;
  const o = normalizeOrigin(origin);
  return isCorsOriginAllowed(o) ? o : null;
}

type HeaderReply = {
  header(name: string, value: string): unknown;
};

/** Set ACAO + credentials on any Fastify-like reply. */
export function applyBrowserCorsHeaders(
  reply: HeaderReply,
  requestOrigin: string | string[] | undefined,
): string | null {
  const origin = corsAllowOriginHeader(requestOrigin);
  if (!origin) return null;
  reply.header('Access-Control-Allow-Origin', origin);
  reply.header('Vary', 'Origin');
  reply.header('Access-Control-Allow-Credentials', 'true');
  reply.header('Access-Control-Allow-Methods', CORS_ALLOW_METHODS);
  reply.header('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS);
  reply.header('Access-Control-Max-Age', '86400');
  return origin;
}

/** @fastify/cors options (API + admin). */
export function buildFastifyCorsOptions(): FastifyCorsOptions {
  return {
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: CORS_ALLOW_HEADERS.split(',').map((s) => s.trim()),
    exposedHeaders: [
      'Content-Disposition',
      'Content-Type',
      'Content-Length',
      'X-Response-Time',
      'X-Request-Id',
    ],
    maxAge: 86_400,
    origin(origin, cb) {
      // Non-browser / same-origin tools (curl, server-to-server) — no Origin header
      if (!origin) {
        cb(null, true);
        return;
      }
      cb(null, isCorsOriginAllowed(origin));
    },
  };
}

/** Socket.IO cors config — reflect Origin (auth is JWT). */
export function buildSocketCorsOptions(): {
  origin: boolean;
  credentials: boolean;
} {
  return { origin: true, credentials: true };
}
