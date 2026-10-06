export { languageRoutes } from './language.routes.js';
export { LanguageService } from './language.service.js';
export type {
  LanguagePreference,
  LanguagePreferenceList,
  UpdateLanguageInput,
} from './language.types.js';
export {
  LANGUAGE_NAMES,
  languageNameForCode,
  DEFAULT_TEXT_LANG,
  resolveTextLang,
  flagIconPathForCode,
} from './language.types.js';
export {
  detectContentLanguage,
  scheduleDetectAndUpdateLang,
} from './content-lang.js';
