import type { FastifyRequest } from 'fastify';
import { getDb } from '../../shared/database/index.js';
import { cacheAside, cacheKey } from '../../shared/cache/index.js';
import {
  countryLangMap,
  genderLangList,
  professionsList,
} from '../../shared/assets/load.js';
import {
  localizedCountryName,
  normalizeLang,
  resolveListLang,
  withLocalizedCountries,
} from '../../shared/i18n/localized-country.js';

export { resolveListLang } from '../../shared/i18n/localized-country.js';

function headerString(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
}

/** Language for localized country/nationality: query `version` → header `version` → Accept-Language → saved preference. */
export async function langFromRequest(
  request: FastifyRequest,
): Promise<string> {
  const query = request.query as { version?: string };
  const versionQuery = query.version;
  const versionHeader = headerString(request.headers.version);
  const acceptLanguage = headerString(request.headers['accept-language']);

  let preferredLang: string | null = null;
  if (
    !versionQuery &&
    !versionHeader &&
    !acceptLanguage &&
    request.user?.sub
  ) {
    preferredLang = await new LookupService().getUserPreferredLang(
      request.user.sub,
    );
  }

  return resolveListLang({
    versionQuery,
    versionHeader,
    acceptLanguage,
    preferredLang,
  });
}

/** Localize `country` / `countryName` on payloads that include string `nationality`. */
export async function localizeResponse<T>(
  request: FastifyRequest,
  payload: T,
): Promise<T> {
  return withLocalizedCountries(payload, await langFromRequest(request));
}

type CountryRow = {
  uuid: string;
  name: string;
  flag_url: string;
  country_code: string;
  nationality: string;
  phone_code: string;
  is_new_country_visible: boolean;
};

function countryFilterSuffix(opts?: { isNewCountryVisible?: boolean }): string {
  if (opts?.isNewCountryVisible === undefined) return 'all';
  return opts.isNewCountryVisible ? 'new' : 'old';
}

export class LookupService {
  private async loadCountries(opts?: {
    isNewCountryVisible?: boolean;
  }): Promise<CountryRow[]> {
    let query = getDb()('countries')
      .whereNull('deleted_at')
      .select(
        'uuid',
        'name',
        'flag_url',
        'country_code',
        'nationality',
        'phone_code',
        'is_new_country_visible',
      )
      .orderBy('name', 'asc');

    if (opts?.isNewCountryVisible !== undefined) {
      query = query.andWhere({
        is_new_country_visible: opts.isNewCountryVisible,
      });
    }

    return query;
  }

  /** Nationality options — `name` / label = demonym (e.g. Indian). */
  async getNationalityList(
    lang: string,
    opts?: { isNewCountryVisible?: boolean },
  ) {
    return cacheAside(
      'lookup.nationality',
      cacheKey('lookup', 'nationality', lang, countryFilterSuffix(opts), 'country'),
      async () => {
        const map = countryLangMap[lang] ?? countryLangMap.en ?? {};
        const enMap = countryLangMap.en ?? {};
        const rows = await this.loadCountries(opts);

        return rows
          .map((row) => ({
            id: row.uuid,
            country: localizedCountryName(row.country_code, lang, row.name),
            flag: row.flag_url,
            code: row.country_code,
            name: row.nationality,
            nationality: row.nationality,
            phoneCode: row.phone_code,
            newCountry: Boolean(row.is_new_country_visible),
            label:
              map[row.country_code]?.label ??
              enMap[row.country_code]?.label ??
              row.nationality,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      },
    );
  }

  /**
   * Country options — `name` / `label` / `country` localized by language preference.
   * Default language is English. Uses Intl region names with DB English fallback.
   */
  async getCountryList(
    lang: string,
    opts?: { isNewCountryVisible?: boolean },
  ) {
    const locale = normalizeLang(lang) || 'en';
    return cacheAside(
      'lookup.countries',
      cacheKey('lookup', 'countries', locale, countryFilterSuffix(opts)),
      async () => {
        const rows = await this.loadCountries(opts);
        return rows
          .map((row) => {
            const localized = localizedCountryName(
              row.country_code,
              locale,
              row.name,
            );
            return {
              id: row.uuid,
              country: localized,
              flag: row.flag_url,
              code: row.country_code,
              name: localized,
              nationality: row.nationality,
              phoneCode: row.phone_code,
              newCountry: Boolean(row.is_new_country_visible),
              label: localized,
            };
          })
          .sort((a, b) => a.label.localeCompare(b.label, locale));
      },
    );
  }

  /** Selected language preference, then `user_details.app_language`. */
  async getUserPreferredLang(userUuid: string): Promise<string | null> {
    const user = await getDb()('users')
      .where({ uuid: userUuid })
      .whereNull('deleted_at')
      .first<{ id: string | number }>('id');
    if (!user) return null;

    const userId = String(user.id);
    const selected = await getDb()('user_language_preferences')
      .where({ user_id: userId, is_selected: true })
      .whereNull('deleted_at')
      .first<{ language_code: string }>('language_code');
    if (selected?.language_code) return selected.language_code;

    const details = await getDb()('user_details')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .first<{ app_language: string | null }>('app_language');
    return details?.app_language ?? null;
  }

  getProfessionList(lang: string) {
    const professions = professionsList[lang] ?? professionsList.en ?? {};
    return Object.entries(professions)
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  getGenderList(lang: string | null) {
    if (!lang) {
      return genderLangList;
    }
    return genderLangList[lang] ?? genderLangList.en ?? [];
  }
}
