import translate from 'translate-google';

/** Aliases → translate-google codes */
const LANGUAGE_MAP: Record<string, string> = {
  zh: 'zh-cn',
  'zh-hans': 'zh-cn',
  'zh-hant': 'zh-tw',
  he: 'iw',
  jv: 'jw',
};

/**
 * Map client language codes to translate-google.
 * Do not force unknown codes to `en` — that made targets like `hi` look untranslated.
 */
function normalizeLanguage(lang: string): string {
  if (!lang) return 'en';
  const lower = lang.toLowerCase().trim();
  return LANGUAGE_MAP[lower] || lower;
}

export type TranslateResult = {
  text: string;
  detectLanguage: string;
  language: string;
};

export type DetectLanguageResult = {
  detectLanguage: string;
};

/**
 * Linkgram feed-new compatible translator (translate-google).
 * Protects @mentions, #hashtags, and emoji surrogates during translation.
 */
export async function translateHandler(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<TranslateResult> {
  const mentionRegex = /@[\w]+/g;
  const hashtagRegex = /#[\w]+/g;
  const emojiRegex = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;

  const mentionPlaceholders: Record<string, string> = {};
  const hashtagPlaceholders: Record<string, string> = {};
  const emojiPlaceholder: Record<string, string> = {};

  let prepared = text.replace(mentionRegex, (match) => {
    const placeholder = `_@${Object.keys(mentionPlaceholders).length}`;
    mentionPlaceholders[placeholder] = ` ${match}`;
    return placeholder;
  });

  prepared = prepared.replace(hashtagRegex, (match) => {
    const placeholder = `_#${Object.keys(hashtagPlaceholders).length}`;
    hashtagPlaceholders[placeholder] = ` ${match}`;
    return placeholder;
  });

  prepared = prepared.replace(emojiRegex, (match) => {
    const placeholder = `_%${Object.keys(emojiPlaceholder).length}`;
    emojiPlaceholder[placeholder] = match;
    return placeholder;
  });

  const fromLang =
    sourceLanguage && sourceLanguage !== 'auto'
      ? normalizeLanguage(sourceLanguage)
      : 'auto';
  const toLang = normalizeLanguage(targetLanguage);

  const result = await translate(prepared, {
    from: fromLang,
    to: toLang,
    detail: true,
  });

  let translated = Object.keys(mentionPlaceholders).reduce(
    (out, placeholder) =>
      out.replace(new RegExp(placeholder, 'g'), mentionPlaceholders[placeholder]),
    result.text,
  );

  translated = Object.keys(hashtagPlaceholders).reduce(
    (out, placeholder) =>
      out.replace(new RegExp(placeholder, 'g'), hashtagPlaceholders[placeholder]),
    translated,
  );

  translated = Object.keys(emojiPlaceholder).reduce(
    (out, placeholder) =>
      out.replace(new RegExp(placeholder, 'g'), emojiPlaceholder[placeholder]),
    translated,
  );

  return {
    text: translated,
    detectLanguage: result?.from?.language?.iso || '',
    language: targetLanguage,
  };
}

export async function detectedLanguage(
  text: string,
): Promise<DetectLanguageResult> {
  if (!text?.trim()) {
    return { detectLanguage: 'en' };
  }
  const result = await translate(text, { detail: true });
  return {
    detectLanguage: result?.from?.language?.iso || '',
  };
}
