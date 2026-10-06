import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Resolve `src/assets` (dev) or `dist/assets` (built). */
export function resolveAssetsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '../../assets'), // src/modules/page → src/assets
    join(here, '../../../assets'), // dist/modules/page → dist/assets
    join(process.cwd(), 'src/assets'),
    join(process.cwd(), 'dist/assets'),
  ];
  for (const dir of candidates) {
    if (
      existsSync(join(dir, 'nationality.json')) ||
      existsSync(join(dir, 'term-conditions')) ||
      existsSync(join(dir, 'privacy-policy'))
    ) {
      return dir;
    }
  }
  return candidates[0]!;
}

const assetsDir = resolveAssetsDir();

/** Map public URL slug → assets subfolder. */
export const PAGE_ASSET_DIRS = {
  'terms-and-conditions': 'term-conditions',
  'privacy-policy': 'privacy-policy',
  support: 'support',
} as const;

export type PageSlug = keyof typeof PAGE_ASSET_DIRS;

export function isPageSlug(value: string): value is PageSlug {
  return value in PAGE_ASSET_DIRS;
}

function normalizeLang(raw?: string | null): string {
  if (!raw) return 'en';
  return raw.trim().toLowerCase().split(/[,;-]/)[0] || 'en';
}

/**
 * Load localized HTML for a legal/support page.
 * Falls back: version → base language (en-US → en) → en.
 */
export function loadPageHtml(
  slug: PageSlug,
  version?: string | null,
): { html: string; lang: string; path: string } | null {
  const folder = PAGE_ASSET_DIRS[slug];
  const dir = join(assetsDir, folder);
  if (!existsSync(dir)) return null;

  const raw = normalizeLang(version);
  const candidates = [...new Set([raw, raw.split('-')[0] || raw, 'en'].filter(Boolean))];

  for (const lang of candidates) {
    const path = join(dir, `${lang}.html`);
    if (!existsSync(path)) continue;
    return {
      html: readFileSync(path, 'utf8'),
      lang,
      path,
    };
  }

  return null;
}
