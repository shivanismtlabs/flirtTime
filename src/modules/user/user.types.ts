export interface UserStats {
  postCount: number;
  reelCount: number;
  followerCount: number;
  followingCount: number;
}

/**
 * Viewer ↔ profile relationship (GET /users/:id when authenticated).
 * - isFollowing: viewer follows this user (accepted)
 * - isFollowedBy: this user follows the viewer (accepted)
 * - isRequestedByMe: viewer has a pending request to this user
 * - isRequestedToMe: this user has a pending request to the viewer
 * - isBlocked: viewer blocked this user
 * - blockedByOwner: this user blocked the viewer
 * - isSelf: viewer is this user
 */
export interface UserRelationship {
  isFollowing: boolean;
  isFollowedBy: boolean;
  isRequestedByMe: boolean;
  isRequestedToMe: boolean;
  isBlocked: boolean;
  blockedByOwner: boolean;
  isSelf: boolean;
}

export interface UserProfile {
  id: string;
  username: string;
  fullName: string | null;
  /** @deprecated use fullName */
  displayName: string | null;
  bio: string | null;
  /** Short “what I’m up to” status message */
  statusText: string | null;
  profilePicture: string | null;
  /** @deprecated use profilePicture */
  avatarUrl: string | null;
  gender: string | null;
  nationality: string | null;
  /** Flag image URL from countries.flag_url */
  nationalityFlag: string | null;
  /** Country name resolved from nationality, localized to the request language */
  country: string | null;
  profession: string | null;
  link: string | null;
  dob: string | null;
  /** Living address / place text */
  living: string | null;
  isPrivate: boolean;
  /** Verified profile badge */
  isVerified: boolean;
  createdAt: string;
  /** Public share URL: `{origin}/api/v1/share/{username}` */
  shareLink: string;
  /** Distance from viewer origin in km, rounded to 2 decimals. Whole km has no point (`11`); fraction keeps the point (`11.45`). Null if either side has no coords. */
  distanceKm: number | null;
  stats: UserStats;
  relationship: UserRelationship;
  /** Total non-deleted users on the app */
  totalAppUsers?: number;
  total_app_users?: number;
}

/** Authenticated self profile — all account + detail fields + stats */
export interface UserMeProfile extends UserProfile {
  email: string | null;
  countryCode: string | null;
  phoneNumber: string | null;
  status: string;
  appLanguage: string;
  contentTranslation: string;
  locationPermission: boolean;
  longitude: number | null;
  latitude: number | null;
  location: string | null;
  updatedAt: string;
  totalAppUsers: number;
  /** Alias for native clients */
  total_app_users: number;
}

export interface UpdateProfileInput {
  fullName?: string;
  /** Alias for fullName */
  displayName?: string;
  /** Preferred; also accept `username` on the wire (normalized in schema) */
  userName?: string;
  /** Alias for userName */
  username?: string;
  /** YYYY-MM-DD */
  dob?: string;
  bio?: string;
  /** Empty string clears status_text */
  statusText?: string;
  gender?: string;
  nationality?: string;
  profession?: string;
  link?: string;
  /** Living address; empty string clears */
  living?: string;
  isPrivate?: boolean;
  profilePicture?: string | null;
  locationPermission?: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

export interface PeopleListFilters {
  q?: string;
  gender?: string;
  /** @deprecated prefer `nationalities` */
  nationality?: string;
  /** Country names, ISO codes, UUIDs, and/or demonyms (expanded via `countries` → match `user_details.nationality`) */
  nationalities?: string[];
  /** Alias of `nationalities` from query `country` / `countries`. */
  countries?: string[];
  profession?: string;
  ageMin?: number;
  ageMax?: number;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
}

export interface PeopleListPage {
  rows: UserProfile[];
  total: number;
}

/** User the viewer has blocked */
export interface BlockedUser extends UserProfile {
  blockedAt: string;
}

export interface BlockedUsersPage {
  rows: BlockedUser[];
  total: number;
}

/** Per-id outcome for bulk block / unblock */
export interface BulkBlockSkipped {
  userId: string;
  reason: string;
}

export interface BulkBlockResult {
  /** Successfully blocked public UUIDs */
  blocked: string[];
  /** Skipped (self, missing, error) */
  skipped: BulkBlockSkipped[];
}

export interface BulkUnblockResult {
  /** Successfully unblocked public UUIDs */
  unblocked: string[];
  /** Skipped (not blocked / missing / error) */
  skipped: BulkBlockSkipped[];
}

/** Nearby map pin — users sharing location within radius */
export interface NearbyUser {
  id: string;
  username: string;
  fullName: string | null;
  statusText: string | null;
  profilePicture: string | null;
  isVerified: boolean;
  latitude: number;
  longitude: number;
  /** Distance in km from query `latitude`/`longitude` (caller GPS), rounded to 2 decimals. Whole km has no point (`11`); fraction keeps the point (`11.45`). */
  distanceKm: number;
  profession: string | null;
  nationality: string | null;
  /** Flag image URL from countries.flag_url */
  nationalityFlag: string | null;
  /** Country name resolved from nationality, localized to the request language */
  country: string | null;
  relationship: UserRelationship;
}

export type NearbySearchOrigin = 'user' | 'city';

export interface NearbyUsersPage {
  rows: NearbyUser[];
  total: number;
  radiusKm: number;
  /** Active, non-deleted users with locationPermission true (not radius-limited). */
  locationEnabledCount: number;
  /** Radius filter / sort origin. `distanceKm` is always from query latitude/longitude. */
  searchOrigin: NearbySearchOrigin;
}
