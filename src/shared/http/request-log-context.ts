import type { FastifyRequest } from 'fastify';
import { LogChannel } from '../logger/channels.js';

function headerString(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
}

/** API version label from URL (`/api/v1/...` → `V1`). */
export function resolveApiVersionLabel(url: string): string | null {
  const path = url.split('?')[0] ?? url;
  const match = path.match(/\/api\/(v\d+)(?:\/|$)/i);
  if (match?.[1]) return match[1].toUpperCase();
  return null;
}

export function normalizeDevice(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v === 'android' || v === 'and' || v.startsWith('android')) return 'ANDROID';
  if (v === 'ios' || v === 'iphone' || v === 'ipad' || v.startsWith('ios')) {
    return 'IOS';
  }
  if (v === 'web' || v === 'browser' || v === 'desktop') return 'WEB';
  const upper = value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  return upper || null;
}

export function sniffDeviceFromUserAgent(ua: string | undefined): string | null {
  if (!ua) return null;
  const s = ua.toLowerCase();
  if (
    s.includes('okhttp') ||
    s.includes('dalvik') ||
    s.includes('android')
  ) {
    return 'ANDROID';
  }
  if (
    s.includes('iphone') ||
    s.includes('ipad') ||
    s.includes('ipod') ||
    (s.includes('cfnetwork') && s.includes('darwin'))
  ) {
    return 'IOS';
  }
  if (
    s.includes('mozilla') ||
    s.includes('chrome') ||
    s.includes('safari') ||
    s.includes('firefox') ||
    s.includes('edg/')
  ) {
    return 'WEB';
  }
  return null;
}

/**
 * Client device for logs: explicit header preferred, else User-Agent sniff.
 * Headers: `x-device`, `x-device-platform`, `x-platform`, `device`, `platform`.
 */
export function resolveDeviceFromHeaders(
  headers: Record<string, string | string[] | undefined> | {
    [key: string]: string | string[] | undefined;
  },
): string | null {
  const raw =
    headerString(headers['x-device']) ??
    headerString(headers['x-device-platform']) ??
    headerString(headers['x-platform']) ??
    headerString(headers['device']) ??
    headerString(headers['platform']);

  const fromHeader = normalizeDevice(raw);
  if (fromHeader) return fromHeader;

  return sniffDeviceFromUserAgent(headerString(headers['user-agent']));
}

export function resolveDeviceLabel(request: FastifyRequest): string | null {
  return resolveDeviceFromHeaders(
    request.headers as Record<string, string | string[] | undefined>,
  );
}

/** Username / admin email for logs — only when authenticated. */
export function resolveLogUsername(request: FastifyRequest): string | null {
  const user = request.user;
  if (!user) return null;
  const username = (user as { username?: string }).username?.trim();
  if (username) return username;
  const email = user.email?.trim();
  if (email) return email;
  return null;
}

function withChannelEmoji(emoji: string, parts: string[]): string {
  return `${emoji} ${parts.join('|')}`;
}

/**
 * Log prefix: `🌐 V1` for anonymous; `🌐 V1|ANDROID|manoj.kkb` when logged in.
 * Device + username only when `request.user` is set.
 * Admin (no `/api/vN`) uses `ADMIN`.
 */
export function buildRequestLogContext(request: FastifyRequest): string {
  const version = resolveApiVersionLabel(request.url);
  const channel = version ? LogChannel.api : LogChannel.admin;
  const head = version ?? 'ADMIN';

  if (!request.user) return withChannelEmoji(channel, [head]);

  const parts = [head];
  const device = resolveDeviceLabel(request);
  if (device) parts.push(device);
  const username = resolveLogUsername(request);
  if (username) parts.push(username);
  return withChannelEmoji(channel, parts);
}

/**
 * Socket log prefix: `🔌 WS|ANDROID|manoj.kkb` (device + username when known).
 */
export function buildSocketLogContext(opts: {
  device?: string | null;
  username?: string | null;
  email?: string | null;
}): string {
  const parts = ['WS'];
  if (opts.device) parts.push(opts.device);
  const who = opts.username?.trim() || opts.email?.trim();
  if (who) parts.push(who);
  return withChannelEmoji(LogChannel.socket, parts);
}

/** Format HTTP access detail without context prefix. */
export function formatHttpAccessDetail(
  request: FastifyRequest,
  statusCode: number,
  elapsedMs: number,
): string {
  return `${request.method} ${request.url} ${statusCode} ${elapsedMs.toFixed(2)}ms`;
}

/** Format HTTP access line with request context prefix. */
export function formatHttpAccessLine(
  request: FastifyRequest,
  statusCode: number,
  elapsedMs: number,
): string {
  const ctx = buildRequestLogContext(request);
  return `${ctx} | ${formatHttpAccessDetail(request, statusCode, elapsedMs)}`;
}
