import { getDb } from '../database/index.js';

export function normalizeLang(raw?: string | null): string {
  if (!raw) return 'en';
  return raw.trim().toLowerCase().split(/[,;-]/)[0] || 'en';
}

/** Resolve lang from ?version= → header version → Accept-Language → preference → en */
export function resolveListLang(input: {
  versionQuery?: string;
  versionHeader?: string;
  acceptLanguage?: string;
  /** Saved user language preference / app_language (used when no explicit hint). */
  preferredLang?: string | null;
}): string {
  return normalizeLang(
    input.versionQuery ||
      input.versionHeader ||
      input.acceptLanguage ||
      input.preferredLang ||
      'en',
  );
}

const regionDisplayCache = new Map<string, Intl.DisplayNames>();

function regionDisplayNames(lang: string): Intl.DisplayNames {
  const key = normalizeLang(lang) || 'en';
  let dn = regionDisplayCache.get(key);
  if (!dn) {
    try {
      dn = new Intl.DisplayNames([key], { type: 'region' });
    } catch {
      dn = new Intl.DisplayNames(['en'], { type: 'region' });
    }
    regionDisplayCache.set(key, dn);
  }
  return dn;
}

/** Localized country/region name; falls back to English then DB name. */
export function localizedCountryName(
  countryCode: string,
  lang: string,
  fallbackName: string,
): string {
  const code = countryCode.trim().toUpperCase();
  if (!code) return fallbackName;
  const primary = regionDisplayNames(lang).of(code);
  if (primary && primary !== code) return primary;
  if (normalizeLang(lang) !== 'en') {
    const en = regionDisplayNames('en').of(code);
    if (en && en !== code) return en;
  }
  return fallbackName;
}

type CountryRef = {
  code: string;
  name: string;
  nationalityLower: string;
  nameLower: string;
  codeLower: string;
};

let countryRefCache: CountryRef[] | null = null;
let countryRefCachedAt = 0;
const COUNTRY_REF_TTL_MS = 10 * 60 * 1000;

async function loadCountryRefs(): Promise<CountryRef[]> {
  if (countryRefCache && Date.now() - countryRefCachedAt < COUNTRY_REF_TTL_MS) {
    return countryRefCache;
  }
  const rows = await getDb()('countries')
    .whereNull('deleted_at')
    .select('country_code', 'name', 'nationality');
  countryRefCache = rows.map((row) => {
    const code = String(row.country_code ?? '').trim();
    const name = String(row.name ?? '').trim();
    const nationality = String(row.nationality ?? '').trim();
    return {
      code,
      name,
      nationalityLower: nationality.toLowerCase(),
      nameLower: name.toLowerCase(),
      codeLower: code.toLowerCase(),
    };
  });
  countryRefCachedAt = Date.now();
  return countryRefCache;
}

function matchCountryRef(
  nationality: string,
  refs: CountryRef[],
): CountryRef | undefined {
  const n = nationality.trim().toLowerCase();
  if (!n) return undefined;
  return refs.find(
    (r) =>
      r.nationalityLower === n || r.nameLower === n || r.codeLower === n,
  );
}

function walkLocalizedCountries(
  value: unknown,
  lang: string,
  refs: CountryRef[],
): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map((item) => walkLocalizedCountries(item, lang, refs));
  }

  const src = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(src)) {
    next[key] = walkLocalizedCountries(nested, lang, refs);
  }

  if (typeof next.nationality === 'string') {
    const matched = matchCountryRef(next.nationality, refs);
    const localized = matched
      ? localizedCountryName(matched.code, lang, matched.name)
      : null;
    if (typeof next.countryName === 'string') {
      if (typeof next.countryCode === 'string' && next.countryCode.trim()) {
        next.countryName = localizedCountryName(
          String(next.countryCode),
          lang,
          String(next.countryName),
        );
      } else if (localized) {
        next.countryName = localized;
      }
    } else {
      next.country = localized ?? next.country ?? null;
    }
  } else if (
    typeof next.countryName === 'string' &&
    typeof next.countryCode === 'string' &&
    next.countryCode.trim()
  ) {
    next.countryName = localizedCountryName(
      String(next.countryCode),
      lang,
      String(next.countryName),
    );
  }

  return next;
}

/**
 * Wherever a payload has string `nationality`, set `country` to the
 * localized country name for `lang` (e.g. Indian → भारत when lang=hi).
 * Profile-visitor rows keep `countryName` instead.
 */
export async function withLocalizedCountries<T>(data: T, lang: string): Promise<T> {
  const refs = await loadCountryRefs();
  return walkLocalizedCountries(data, normalizeLang(lang) || 'en', refs) as T;
}
