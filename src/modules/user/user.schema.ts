import { z } from 'zod';
import {
  emptyAsUndefined,
  nullableUuidSchema,
  paginationQuerySchema,
} from '../../shared/utils/index.js';
import { AuthMessages } from '../auth/auth.messages.js';

export const userIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const usernameParamsSchema = z.object({
  username: z.string().min(3).max(32),
});

function ageFromDob(isoDate: string): number {
  const birth = new Date(`${isoDate}T00:00:00.000Z`);
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birth.getUTCMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getUTCDate() < birth.getUTCDate())
  ) {
    age--;
  }
  return age;
}

const profileUsernameSchema = z
  .string({
    required_error: AuthMessages.usernameEmpty,
    invalid_type_error: AuthMessages.usernameEmpty,
  })
  .trim()
  .min(1, AuthMessages.usernameEmpty)
  .superRefine((value, ctx) => {
    if (value.length < 3) {
      ctx.addIssue({ code: 'custom', message: AuthMessages.usernameTooShort });
      return;
    }
    if (value.length > 20) {
      ctx.addIssue({ code: 'custom', message: AuthMessages.usernameTooLong });
      return;
    }
    if (!/^[a-zA-Z0-9_.]+$/.test(value)) {
      ctx.addIssue({ code: 'custom', message: AuthMessages.usernameInvalid });
    }
  })
  .transform((v) => v.toLowerCase());

const profileDobSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, AuthMessages.dobInvalidFormat)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), {
    message: AuthMessages.dobInvalid,
  })
  .refine((value) => ageFromDob(value) >= 13, {
    message: AuthMessages.underMinimumAge,
  });

export const updateProfileBodySchema = z
  .object({
    fullName: z.string().min(1).max(120).optional(),
    displayName: z.string().min(1).max(120).optional(),
    /** Preferred field name (Linkgram-compatible). Alias: `username`. */
    userName: profileUsernameSchema.optional(),
    username: profileUsernameSchema.optional(),
    /** Date of birth as YYYY-MM-DD; must be at least 13 years old. */
    dob: profileDobSchema.optional(),
    bio: z.string().max(2000).optional(),
    /** Short “what I’m up to” status; empty string clears. */
    statusText: z.string().max(280).optional(),
    gender: z.string().max(32).optional(),
    nationality: z.string().max(64).optional(),
    profession: z.string().max(120).optional(),
    link: z.string().max(500).optional(),
    /** Living address; empty string clears. */
    living: z.string().max(255).optional(),
    isPrivate: z.boolean().optional(),
    profilePicture: nullableUuidSchema,
    locationPermission: z.boolean().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
  })
  .transform((data) => {
    const { username, userName, ...rest } = data;
    return {
      ...rest,
      userName: userName ?? username,
    };
  });

/** Missing / `""` / whitespace → undefined (no validation error). */
function blankToUndefined(value: unknown): unknown {
  if (value == null) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
}

/** Optional coerced number; blank query values are omitted (not coerced to 0/NaN). */
function optionalQueryNumber(schema: z.ZodNumber) {
  return z.preprocess(blankToUndefined, schema.optional());
}

/** Accept `a,b` or repeated `?nationality=a&nationality=b` query values.
 *  `all` / blank is treated as “no filter” (default). */
function parseStringList(value: unknown): string[] | undefined {
  if (value == null || value === '') return undefined;
  const parts = Array.isArray(value)
    ? value.flatMap((v) => String(v).split(','))
    : String(value).split(',');
  const out = [
    ...new Set(
      parts
        .map((s) => s.trim())
        .filter((s) => Boolean(s) && s.toLowerCase() !== 'all')
        .map((s) => s.slice(0, 64)),
    ),
  ];
  // Huge list ≈ "select all countries" → no nationality filter.
  if (out.length >= 150) return undefined;
  return out.length ? out : undefined;
}

const peopleFiltersFields = {
  q: emptyAsUndefined(z.string().min(1).max(64).optional()),
  gender: emptyAsUndefined(z.string().max(32).optional()),
  nationality: z.preprocess(
    parseStringList,
    z.array(z.string().min(1).max(64)).max(300).optional(),
  ),
  /** Same as `nationality` — country name, ISO code, uuid, or demonym. */
  country: z.preprocess(
    parseStringList,
    z.array(z.string().min(1).max(64)).max(300).optional(),
  ),
  countries: z.preprocess(
    parseStringList,
    z.array(z.string().min(1).max(64)).max(300).optional(),
  ),
  profession: emptyAsUndefined(z.string().max(120).optional()),
  ageMin: optionalQueryNumber(z.coerce.number().int().min(13).max(120)),
  ageMax: optionalQueryNumber(z.coerce.number().int().min(13).max(120)),
  latitude: optionalQueryNumber(z.coerce.number().min(-90).max(90)),
  longitude: optionalQueryNumber(z.coerce.number().min(-180).max(180)),
  radiusKm: optionalQueryNumber(z.coerce.number().min(1).max(500)),
};

function refinePeopleFilters(
  data: {
    ageMin?: number;
    ageMax?: number;
    latitude?: number;
    longitude?: number;
  },
  ctx: z.RefinementCtx,
) {
  if (
    data.ageMin != null &&
    data.ageMax != null &&
    data.ageMin > data.ageMax
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'ageMin must be <= ageMax',
      path: ['ageMin'],
    });
  }
  const hasLat = data.latitude != null;
  const hasLng = data.longitude != null;
  if (hasLat !== hasLng) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'latitude and longitude must be provided together',
      path: ['latitude'],
    });
  }
}

export const listUsersQuerySchema = paginationQuerySchema
  .extend(peopleFiltersFields)
  .superRefine(refinePeopleFilters);

export const discoverPeopleQuerySchema = paginationQuerySchema
  .extend(peopleFiltersFields)
  .superRefine(refinePeopleFilters);

/**
 * Group invite picker — same filters/response as `GET /users` (`{ rows, total }`).
 * Optional `conversationId` excludes current group members (admin-only).
 */
export const groupCandidatesQuerySchema = paginationQuerySchema
  .extend({
    ...peopleFiltersFields,
    conversationId: emptyAsUndefined(z.string().uuid().optional()),
  })
  .superRefine(refinePeopleFilters);

export const nearbyUsersQuerySchema = z
  .object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
    /** Optional city center: who is nearby is filtered around this point. */
    cityLatitude: optionalQueryNumber(z.coerce.number().min(-90).max(90)),
    cityLongitude: optionalQueryNumber(z.coerce.number().min(-180).max(180)),
    radiusKm: z.preprocess(
      blankToUndefined,
      z.coerce.number().positive().max(500).optional().default(50),
    ),
    profession: emptyAsUndefined(z.string().max(120).optional()),
    gender: emptyAsUndefined(z.enum(['MALE', 'FEMALE']).optional()),
    /** Filter users with `user_details.is_verified` true */
    verified: emptyAsUndefined(z.enum(['true', 'false', '1', '0']).optional()),
    limit: z.preprocess(
      blankToUndefined,
      z.coerce.number().int().positive().max(100).optional().default(50),
    ),
  })
  .superRefine((data, ctx) => {
    const hasCityLat = data.cityLatitude != null;
    const hasCityLng = data.cityLongitude != null;
    if (hasCityLat !== hasCityLng) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cityLatitude and cityLongitude must be provided together',
        path: ['cityLatitude'],
      });
    }
  });

/** Confirm account deletion with the current password. */
export const deleteAccountBodySchema = z.object({
  password: z.string().min(1).max(128),
});

/** Apply verified change_email OTP to the authenticated account. */
export const applyChangeEmailBodySchema = z.object({
  verificationId: z.string().uuid(),
});

/** Apply verified change_phone OTP to the authenticated account. */
export const applyChangePhoneBodySchema = z.object({
  verificationId: z.string().uuid(),
});

/** Bulk block / unblock by public user UUIDs (max 50). */
export const bulkBlockBodySchema = z.object({
  userIds: z
    .array(z.string().uuid())
    .min(1, 'userIds must include at least one id')
    .max(50, 'userIds max is 50'),
});
