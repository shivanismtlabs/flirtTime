import { detectedLanguage } from '../../shared/translate/index.js';
import { DEFAULT_TEXT_LANG, resolveTextLang } from './language.types.js';

/** Detect language of free text; returns a normalized app language code. */
export async function detectContentLanguage(text: string): Promise<string> {
  const value = text?.trim();
  if (!value) return DEFAULT_TEXT_LANG;
  try {
    const result = await detectedLanguage(value);
    return resolveTextLang(result.detectLanguage);
  } catch {
    return DEFAULT_TEXT_LANG;
  }
}

/**
 * Fire-and-forget job: detect language of `text` and persist via `update`.
 * No-op when text is empty. Never throws to the caller.
 */
export function scheduleDetectAndUpdateLang(
  text: string | null | undefined,
  update: (lang: string) => Promise<void>,
): void {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value) return;
  void detectContentLanguage(value)
    .then((lang) => update(lang))
    .catch(() => {});
}
