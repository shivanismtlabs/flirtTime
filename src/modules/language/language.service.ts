import { NotFoundError } from '../../shared/errors/index.js';
import { LanguageRepository } from './language.repository.js';
import type {
  LanguagePreference,
  LanguagePreferenceList,
  UpdateLanguageInput,
} from './language.types.js';
import { flagIconPathForCode } from './language.types.js';

function defaultEnglish(): LanguagePreference {
  return {
    id: 'default-en',
    languageCode: 'en',
    languageName: 'English',
    flagIcon: resolveDefaultFlag('en'),
    isSelected: true,
  };
}

function resolveDefaultFlag(code: string): string | null {
  const path = flagIconPathForCode(code);
  const base =
    process.env.ASSET_CDN_URL?.trim() ||
    process.env.CLOUDFRONT_URL?.trim() ||
    '';
  if (!base) return path;
  return `${base.replace(/\/$/, '')}/${path}`;
}

export class LanguageService {
  constructor(private readonly repo = new LanguageRepository()) {}

  private async requireUserId(actorUuid: string): Promise<string> {
    const userId = await this.repo.findUserIdByUuid(actorUuid);
    if (!userId) throw new NotFoundError('User not found');
    return userId;
  }

  async list(actorUuid: string): Promise<LanguagePreferenceList> {
    const userId = await this.requireUserId(actorUuid);
    const languages = await this.repo.listForUser(userId);

    const selected =
      languages.find((l) => l.isSelected) ?? defaultEnglish();

    return {
      allLanguages: languages.length ? languages : [selected],
      selectedLanguage: selected,
    };
  }

  async update(
    actorUuid: string,
    input: UpdateLanguageInput,
  ): Promise<LanguagePreference> {
    const userId = await this.requireUserId(actorUuid);
    const rawCode = input.languageCode?.trim();
    const languageCode = rawCode ? rawCode.toLowerCase() : null;

    const existing = await this.repo.listForUser(userId);

    // No rows + no code → create default English
    if (existing.length === 0 && !languageCode) {
      const created = await this.repo.create(userId, 'en', true);
      await this.repo.syncUserAppLanguage(userId, 'en');
      return created;
    }

    const selected = await this.repo.withTransaction(async (trx) => {
      await this.repo.clearSelected(userId, trx);

      const code = languageCode ?? 'en';

      let pref = await this.repo.selectByCode(userId, code, trx);
      if (!pref) {
        pref = await this.repo.create(userId, code, true, trx);
      }
      return pref;
    });

    await this.repo.syncUserAppLanguage(userId, selected.languageCode);
    return selected;
  }
}
