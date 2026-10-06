import type { UserProfile } from '../user/user.types.js';

export interface NormalizedContact {
  /** Digits-only phone (no country dial). */
  phoneNumber: string;
  displayName: string | null;
}

export interface SyncContactsInput {
  /** Raw phone strings from the device phonebook */
  contacts: string[];
  replace?: boolean;
}

export interface SyncContactsResult {
  uploaded: number;
  matched: number;
  skipped: number;
  matches: UserProfile[];
}

export interface ContactMatchesPage {
  rows: UserProfile[];
  total: number;
}
