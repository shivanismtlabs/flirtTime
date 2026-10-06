export type ProfileVisitorCountryRow = {
  /** Country display name, localized to the request language (e.g. India / भारत) */
  countryName: string;
  /** Distinct visitors from this country */
  visitCount: number;
  /** Flag image URL from countries.flag_url */
  flag: string;
  countryCode: string;
  nationality: string;
  lastVisitedAt: string;
  /** Linkgram-compatible alias of visitCount */
  peoplecount: number;
};

export type ProfileVisitorsFilter = 'today' | 'past7days' | 'past30days';

export type ListProfileVisitorsInput = {
  page: number;
  limit: number;
  filter?: ProfileVisitorsFilter;
};

export type ListProfileVisitorsResult = {
  rows: ProfileVisitorCountryRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type RecordProfileViewInput = {
  /** Profile owner public UUID */
  userId: string;
};

export type RecordProfileViewResult = {
  recorded: boolean;
  alreadyViewed: boolean;
};
