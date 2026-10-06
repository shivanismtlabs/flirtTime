import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

function resolveAssetsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '../../assets'), // src/shared/assets → src/assets (tsx)
    join(here, '../../../assets'), // dist/shared/assets → dist/assets
    join(process.cwd(), 'src/assets'),
    join(process.cwd(), 'dist/assets'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'nationality.json'))) {
      return dir;
    }
  }
  return candidates[0]!;
}

const assetsDir = resolveAssetsDir();

function loadJson<T>(relativePath: string): T {
  return require(join(assetsDir, relativePath)) as T;
}

export type NationalityItem = {
  id: string;
  country: string;
  flag: string;
  code: string;
  name: string;
  phoneCode: string;
};

export type CountryLangMap = Record<
  string,
  Record<string, { label?: string } | undefined> | undefined
>;

export type ProfessionLangMap = Record<string, Record<string, string> | undefined>;

export type GenderOption = { label: string; value: string };
export type GenderLangMap = Record<string, GenderOption[] | undefined>;

export const nationalityList = loadJson<NationalityItem[]>('nationality.json');
export const countryLangMap = loadJson<CountryLangMap>('countries/lang.json');
export const professionsList = loadJson<ProfessionLangMap>('professions.json');
export const genderLangList = loadJson<GenderLangMap>('gender.json');
