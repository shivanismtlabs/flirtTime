/**
 * National significant number length by ITU country calling code (digits only, no +).
 * Keep in sync with `webapp/src/lib/phone.ts`.
 *
 * Lengths are practical mobile/national ranges (not every possible fixed-line variant).
 */
export const PHONE_DIGIT_RULES: Record<string, { min: number; max: number }> = {
  // North America (+1)
  '1': { min: 10, max: 10 },

  // Africa / Middle East / Europe / Asia — sorted by calling code
  '7': { min: 10, max: 10 }, // RU, KZ
  '20': { min: 9, max: 10 }, // EG
  '27': { min: 9, max: 9 }, // ZA
  '30': { min: 10, max: 10 }, // GR
  '31': { min: 9, max: 9 }, // NL
  '32': { min: 8, max: 9 }, // BE
  '33': { min: 9, max: 9 }, // FR
  '34': { min: 9, max: 9 }, // ES
  '36': { min: 8, max: 9 }, // HU
  '39': { min: 9, max: 10 }, // IT
  '40': { min: 9, max: 9 }, // RO
  '41': { min: 9, max: 9 }, // CH
  '43': { min: 10, max: 13 }, // AT
  '44': { min: 10, max: 10 }, // GB
  '45': { min: 8, max: 8 }, // DK
  '46': { min: 7, max: 9 }, // SE
  '47': { min: 8, max: 8 }, // NO
  '48': { min: 9, max: 9 }, // PL
  '49': { min: 10, max: 11 }, // DE
  '51': { min: 8, max: 9 }, // PE
  '52': { min: 10, max: 10 }, // MX
  '53': { min: 8, max: 8 }, // CU
  '54': { min: 10, max: 10 }, // AR
  '55': { min: 10, max: 11 }, // BR
  '56': { min: 8, max: 9 }, // CL
  '57': { min: 10, max: 10 }, // CO
  '58': { min: 10, max: 10 }, // VE
  '60': { min: 9, max: 10 }, // MY
  '61': { min: 9, max: 9 }, // AU
  '62': { min: 9, max: 12 }, // ID
  '63': { min: 10, max: 10 }, // PH
  '64': { min: 8, max: 10 }, // NZ
  '65': { min: 8, max: 8 }, // SG
  '66': { min: 8, max: 9 }, // TH
  '81': { min: 10, max: 10 }, // JP
  '82': { min: 9, max: 10 }, // KR
  '84': { min: 9, max: 10 }, // VN
  '86': { min: 11, max: 11 }, // CN
  '90': { min: 10, max: 10 }, // TR
  '91': { min: 10, max: 10 }, // IN
  '92': { min: 10, max: 10 }, // PK
  '93': { min: 9, max: 9 }, // AF
  '94': { min: 9, max: 9 }, // LK
  '95': { min: 8, max: 10 }, // MM
  '98': { min: 10, max: 10 }, // IR

  '211': { min: 9, max: 9 }, // SS
  '212': { min: 9, max: 9 }, // MA
  '213': { min: 9, max: 9 }, // DZ
  '216': { min: 8, max: 8 }, // TN
  '218': { min: 9, max: 9 }, // LY
  '220': { min: 7, max: 7 }, // GM
  '221': { min: 9, max: 9 }, // SN
  '222': { min: 8, max: 8 }, // MR
  '223': { min: 8, max: 8 }, // ML
  '224': { min: 9, max: 9 }, // GN
  '225': { min: 10, max: 10 }, // CI
  '226': { min: 8, max: 8 }, // BF
  '227': { min: 8, max: 8 }, // NE
  '228': { min: 8, max: 8 }, // TG
  '229': { min: 8, max: 8 }, // BJ
  '230': { min: 8, max: 8 }, // MU
  '231': { min: 7, max: 9 }, // LR
  '232': { min: 8, max: 8 }, // SL
  '233': { min: 9, max: 9 }, // GH
  '234': { min: 10, max: 10 }, // NG
  '235': { min: 8, max: 8 }, // TD
  '236': { min: 8, max: 8 }, // CF
  '237': { min: 9, max: 9 }, // CM
  '238': { min: 7, max: 7 }, // CV
  '239': { min: 7, max: 7 }, // ST
  '240': { min: 9, max: 9 }, // GQ
  '241': { min: 7, max: 8 }, // GA
  '242': { min: 9, max: 9 }, // CG
  '243': { min: 9, max: 9 }, // CD
  '244': { min: 9, max: 9 }, // AO
  '245': { min: 7, max: 7 }, // GW
  '246': { min: 7, max: 7 }, // IO
  '248': { min: 7, max: 7 }, // SC
  '249': { min: 9, max: 9 }, // SD
  '250': { min: 9, max: 9 }, // RW
  '251': { min: 9, max: 9 }, // ET
  '252': { min: 8, max: 9 }, // SO
  '253': { min: 8, max: 8 }, // DJ
  '254': { min: 9, max: 9 }, // KE
  '255': { min: 9, max: 9 }, // TZ
  '256': { min: 9, max: 9 }, // UG
  '257': { min: 8, max: 8 }, // BI
  '258': { min: 9, max: 9 }, // MZ
  '260': { min: 9, max: 9 }, // ZM
  '261': { min: 9, max: 10 }, // MG
  '262': { min: 9, max: 9 }, // RE / YT
  '263': { min: 9, max: 9 }, // ZW
  '264': { min: 9, max: 9 }, // NA
  '265': { min: 9, max: 9 }, // MW
  '266': { min: 8, max: 8 }, // LS
  '267': { min: 8, max: 8 }, // BW
  '268': { min: 8, max: 8 }, // SZ
  '269': { min: 7, max: 7 }, // KM
  '290': { min: 4, max: 5 }, // SH
  '291': { min: 7, max: 7 }, // ER
  '297': { min: 7, max: 7 }, // AW
  '298': { min: 6, max: 6 }, // FO
  '299': { min: 6, max: 6 }, // GL

  '350': { min: 8, max: 8 }, // GI
  '351': { min: 9, max: 9 }, // PT
  '352': { min: 9, max: 9 }, // LU
  '353': { min: 9, max: 9 }, // IE
  '354': { min: 7, max: 9 }, // IS
  '355': { min: 8, max: 9 }, // AL
  '356': { min: 8, max: 8 }, // MT
  '357': { min: 8, max: 8 }, // CY
  '358': { min: 9, max: 10 }, // FI
  '359': { min: 8, max: 9 }, // BG
  '370': { min: 8, max: 8 }, // LT
  '371': { min: 8, max: 8 }, // LV
  '372': { min: 7, max: 8 }, // EE
  '373': { min: 8, max: 8 }, // MD
  '374': { min: 8, max: 8 }, // AM
  '375': { min: 9, max: 9 }, // BY
  '376': { min: 6, max: 9 }, // AD
  '377': { min: 8, max: 9 }, // MC
  '378': { min: 6, max: 10 }, // SM
  '380': { min: 9, max: 9 }, // UA
  '381': { min: 8, max: 9 }, // RS
  '382': { min: 8, max: 8 }, // ME
  '383': { min: 8, max: 8 }, // XK
  '385': { min: 8, max: 9 }, // HR
  '386': { min: 8, max: 8 }, // SI
  '387': { min: 8, max: 8 }, // BA
  '389': { min: 8, max: 8 }, // MK
  '420': { min: 9, max: 9 }, // CZ
  '421': { min: 9, max: 9 }, // SK
  '423': { min: 7, max: 7 }, // LI

  '500': { min: 5, max: 5 }, // FK
  '501': { min: 7, max: 7 }, // BZ
  '502': { min: 8, max: 8 }, // GT
  '503': { min: 8, max: 8 }, // SV
  '504': { min: 8, max: 8 }, // HN
  '505': { min: 8, max: 8 }, // NI
  '506': { min: 8, max: 8 }, // CR
  '507': { min: 7, max: 8 }, // PA
  '508': { min: 6, max: 6 }, // PM
  '509': { min: 8, max: 8 }, // HT
  '590': { min: 9, max: 9 }, // GP / BL / MF
  '591': { min: 8, max: 8 }, // BO
  '592': { min: 7, max: 7 }, // GY
  '593': { min: 9, max: 9 }, // EC
  '594': { min: 9, max: 9 }, // GF
  '595': { min: 9, max: 9 }, // PY
  '596': { min: 9, max: 9 }, // MQ
  '597': { min: 6, max: 7 }, // SR
  '598': { min: 8, max: 8 }, // UY
  '599': { min: 7, max: 8 }, // CW / BQ

  '670': { min: 7, max: 8 }, // TL
  '672': { min: 5, max: 6 }, // NF / AQ
  '673': { min: 7, max: 7 }, // BN
  '674': { min: 7, max: 7 }, // NR
  '675': { min: 7, max: 8 }, // PG
  '676': { min: 5, max: 7 }, // TO
  '677': { min: 7, max: 7 }, // SB
  '678': { min: 5, max: 7 }, // VU
  '679': { min: 7, max: 7 }, // FJ
  '680': { min: 7, max: 7 }, // PW
  '681': { min: 6, max: 6 }, // WF
  '682': { min: 5, max: 5 }, // CK
  '683': { min: 4, max: 4 }, // NU
  '685': { min: 5, max: 7 }, // WS
  '686': { min: 5, max: 8 }, // KI
  '687': { min: 6, max: 6 }, // NC
  '688': { min: 5, max: 6 }, // TV
  '689': { min: 6, max: 8 }, // PF
  '690': { min: 4, max: 4 }, // TK
  '691': { min: 7, max: 7 }, // FM
  '692': { min: 7, max: 7 }, // MH

  '850': { min: 8, max: 10 }, // KP
  '852': { min: 8, max: 8 }, // HK
  '853': { min: 8, max: 8 }, // MO
  '855': { min: 8, max: 9 }, // KH
  '856': { min: 8, max: 10 }, // LA
  '880': { min: 10, max: 10 }, // BD
  '886': { min: 9, max: 9 }, // TW

  '960': { min: 7, max: 7 }, // MV
  '961': { min: 7, max: 8 }, // LB
  '962': { min: 9, max: 9 }, // JO
  '963': { min: 9, max: 9 }, // SY
  '964': { min: 10, max: 10 }, // IQ
  '965': { min: 8, max: 8 }, // KW
  '966': { min: 9, max: 9 }, // SA
  '967': { min: 9, max: 9 }, // YE
  '968': { min: 8, max: 8 }, // OM
  '970': { min: 9, max: 9 }, // PS
  '971': { min: 9, max: 9 }, // AE
  '972': { min: 8, max: 9 }, // IL
  '973': { min: 8, max: 8 }, // BH
  '974': { min: 8, max: 8 }, // QA
  '975': { min: 8, max: 8 }, // BT
  '976': { min: 8, max: 8 }, // MN
  '977': { min: 10, max: 10 }, // NP
  '992': { min: 9, max: 9 }, // TJ
  '993': { min: 8, max: 8 }, // TM
  '994': { min: 9, max: 9 }, // AZ
  '995': { min: 9, max: 9 }, // GE
  '996': { min: 9, max: 9 }, // KG
  '998': { min: 9, max: 9 }, // UZ
};

const DEFAULT_PHONE_DIGITS = { min: 6, max: 15 };

export function normalizeCountryDial(countryCode: string): string {
  return countryCode.replace(/\D/g, '');
}

export function phoneDigitRule(countryCode: string): { min: number; max: number } {
  const cc = normalizeCountryDial(countryCode);
  return PHONE_DIGIT_RULES[cc] ?? DEFAULT_PHONE_DIGITS;
}

/** Strip a single leading trunk 0 (common when users paste local format). */
export function normalizeNationalPhone(
  countryCode: string,
  phoneNumber: string,
): string {
  let digits = phoneNumber.replace(/\D/g, '');
  const cc = normalizeCountryDial(countryCode);
  // Common trunk-prefix countries
  if (
    digits.startsWith('0') &&
    [
      '91',
      '44',
      '61',
      '64',
      '27',
      '33',
      '39',
      '49',
      '34',
      '351',
      '353',
      '92',
      '880',
      '94',
      '977',
    ].includes(cc)
  ) {
    digits = digits.slice(1);
  }
  return digits;
}

export function isValidNationalPhone(
  countryCode: string,
  phoneNumber: string,
): boolean {
  const digits = normalizeNationalPhone(countryCode, phoneNumber);
  const { min, max } = phoneDigitRule(countryCode);
  return digits.length >= min && digits.length <= max;
}

export function phoneLengthMessage(countryCode: string): string {
  const { min, max } = phoneDigitRule(countryCode);
  if (min === max) return `Enter a ${min}-digit phone number`;
  return `Enter a phone number with ${min}–${max} digits`;
}
