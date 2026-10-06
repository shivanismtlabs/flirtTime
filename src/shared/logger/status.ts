import { env } from '../config/index.js';
import { logger } from './index.js';

const c = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

const useColor = env.NODE_ENV !== 'production';

function paint(color: string, text: string): string {
  return useColor ? `${color}${text}${c.reset}` : text;
}

function detailPart(detail?: string): string {
  return detail ? ` ${paint(c.dim, detail)}` : '';
}

/** Success: green check + arrow */
export function ok(label: string, detail?: string): void {
  logger.info(`${paint(c.green, '✓')} ${paint(c.green, '→')} ${label}${detailPart(detail)}`);
}

/** Failure: red cross + arrow */
export function fail(label: string, detail?: string): void {
  logger.error(`${paint(c.red, '✗')} ${paint(c.red, '→')} ${label}${detailPart(detail)}`);
}

/** Warning: yellow cross-ish mark + arrow */
export function warn(label: string, detail?: string): void {
  logger.warn(`${paint(c.yellow, '✗')} ${paint(c.yellow, '→')} ${label}${detailPart(detail)}`);
}

/** Neutral / in-progress step */
export function step(label: string, detail?: string): void {
  logger.info(`${paint(c.cyan, '→')} ${label}${detailPart(detail)}`);
}

/** Skipped / disabled (dim) */
export function skip(label: string, detail?: string): void {
  logger.info(`${paint(c.dim, '○')} ${paint(c.dim, '→')} ${label}${detailPart(detail)}`);
}

export function banner(title: string): void {
  logger.info(paint(c.bold, `━━ ${title} ━━`));
}

export const status = { ok, fail, warn, step, skip, banner };
