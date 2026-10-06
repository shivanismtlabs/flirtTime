export type LanguagePreference = {
  id: string;
  languageCode: string;
  languageName: string;
  flagIcon: string | null;
  isSelected: boolean;
};

export type LanguagePreferenceList = {
  allLanguages: LanguagePreference[];
  selectedLanguage: LanguagePreference;
};

export type UpdateLanguageInput = {
  /** Omit / null → select English (Linkgram parity). */
  languageCode?: string | null;
};

/** Known display names for common codes; unknown codes use the code itself. */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  ru: 'Russian',
  tr: 'Turkish',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  ar: 'Arabic',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  uk: 'Ukrainian',
  pl: 'Polish',
  it: 'Italian',
  uz: 'Uzbek',
  kk: 'Kazakh',
};

export function languageNameForCode(code: string): string {
  const key = code.toLowerCase();
  return LANGUAGE_NAMES[key] ?? LANGUAGE_NAMES[key.split('-')[0]!] ?? code;
}

export function flagIconPathForCode(code: string): string {
  return `flags/${code.toLowerCase()}.png`;
}

/** Default content language for post / vibe caption and comments. */
export const DEFAULT_TEXT_LANG = 'en';

/**
 * Normalize a language code against known app codes.
 * Empty / unknown → `en`. Prefers base language for region tags (e.g. `en-US` → `en`).
 */
export function resolveTextLang(code?: string | null): string {
  if (code == null) return DEFAULT_TEXT_LANG;
  const raw = String(code).trim().toLowerCase();
  if (!raw) return DEFAULT_TEXT_LANG;
  if (LANGUAGE_NAMES[raw]) return raw;
  const base = raw.split('-')[0] ?? raw;
  if (LANGUAGE_NAMES[base]) return base;
  // Accept short ISO-ish codes even if not in the display map (max 16).
  if (/^[a-z]{2,3}$/.test(base) && base.length <= 16) return base;
  return DEFAULT_TEXT_LANG;
}
