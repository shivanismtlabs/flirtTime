import { z } from 'zod';
import {
  ALLOW_COMMENTS_PERMISSION,
  DEFAULT_POST_AUDIENCE,
  LAST_SEEN_VISIBILITY,
  MESSAGE_AUDIENCE,
  MESSAGE_REPLIES_PERMISSION,
  ONLINE_VISIBILITY,
  PREFERRED_LANGUAGES,
  TAG_MENTION_PERMISSION,
  VIEW_STORIES_PERMISSION,
} from './setting.types.js';

/** Client often sends "" for untouched string enums — treat as omitted. */
function emptyToUndefined(value: unknown): unknown {
  if (value === '' || value === null) return undefined;
  return value;
}

export const updateOffensiveSettingsBodySchema = z
  .object({
    realTimeFiltering: z.boolean().optional(),
    multilingualSupport: z.boolean().optional(),
    preferredLanguage: z.enum(PREFERRED_LANGUAGES).optional(),
    warningAndEducation: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.realTimeFiltering !== undefined ||
      v.multilingualSupport !== undefined ||
      v.preferredLanguage !== undefined ||
      v.warningAndEducation !== undefined,
    { message: 'At least one offensive setting field is required' },
  );

export const updateMessagePrivacyBodySchema = z
  .object({
    messagePrivacy: z.boolean().optional(),
    allowMessageRequests: z.preprocess(
      emptyToUndefined,
      z.enum(MESSAGE_AUDIENCE).optional(),
    ),
    allowGroupAdds: z.preprocess(
      emptyToUndefined,
      z.enum(MESSAGE_AUDIENCE).optional(),
    ),
    readReceipts: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.messagePrivacy !== undefined ||
      v.allowMessageRequests !== undefined ||
      v.allowGroupAdds !== undefined ||
      v.readReceipts !== undefined,
    { message: 'At least one message privacy field is required' },
  );

export const updateStorySettingsBodySchema = z
  .object({
    viewStoriesPermission: z.preprocess(
      emptyToUndefined,
      z.enum(VIEW_STORIES_PERMISSION).optional(),
    ),
    onlyShareWithPeoples: z.array(z.string().uuid()).max(100).optional(),
    saveToCameraRoll: z.boolean().optional(),
    messageRepliesPermission: z.preprocess(
      emptyToUndefined,
      z.enum(MESSAGE_REPLIES_PERMISSION).optional(),
    ),
    saveToArchive: z.boolean().optional(),
    allowSharing: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.viewStoriesPermission !== undefined ||
      v.onlyShareWithPeoples !== undefined ||
      v.saveToCameraRoll !== undefined ||
      v.messageRepliesPermission !== undefined ||
      v.saveToArchive !== undefined ||
      v.allowSharing !== undefined,
    { message: 'At least one story setting field is required' },
  );

export const updateCommentSettingsBodySchema = z
  .object({
    allowCommentsPermission: z.preprocess(
      emptyToUndefined,
      z.enum(ALLOW_COMMENTS_PERMISSION).optional(),
    ),
    hideOffensiveComments: z.boolean().optional(),
    enableManualFilters: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.allowCommentsPermission !== undefined ||
      v.hideOffensiveComments !== undefined ||
      v.enableManualFilters !== undefined,
    { message: 'At least one comment setting field is required' },
  );

export const updatePostSettingsBodySchema = z
  .object({
    defaultAudience: z.preprocess(
      emptyToUndefined,
      z.enum(DEFAULT_POST_AUDIENCE).optional(),
    ),
    // Public user ids (UUID strings); keep permissive — clients may send mixed case
    specificPeople: z
      .array(z.string().trim().min(1).max(64))
      .max(100)
      .optional(),
  })
  .refine(
    (v) =>
      v.defaultAudience !== undefined || v.specificPeople !== undefined,
    { message: 'At least one post setting field is required' },
  );

export const updateTagVisibilityBodySchema = z
  .object({
    tagPermission: z.preprocess(
      emptyToUndefined,
      z.enum(TAG_MENTION_PERMISSION).optional(),
    ),
    mentionPermission: z.preprocess(
      emptyToUndefined,
      z.enum(TAG_MENTION_PERMISSION).optional(),
    ),
    tagPermissionUserId: z.array(z.string().uuid()).max(100).optional(),
  })
  .refine(
    (v) =>
      v.tagPermission !== undefined ||
      v.mentionPermission !== undefined ||
      v.tagPermissionUserId !== undefined,
    { message: 'At least one tag visibility field is required' },
  );

export const updateUserVisibilityBodySchema = z
  .object({
    onlineVisibility: z.preprocess(
      emptyToUndefined,
      z.enum(ONLINE_VISIBILITY).optional(),
    ),
    lastSeenVisibility: z.preprocess(
      emptyToUndefined,
      z.enum(LAST_SEEN_VISIBILITY).optional(),
    ),
    blockedUsers: z.array(z.string().uuid()).max(100).optional(),
  })
  .refine(
    (v) =>
      v.onlineVisibility !== undefined ||
      v.lastSeenVisibility !== undefined ||
      v.blockedUsers !== undefined,
    { message: 'At least one user visibility field is required' },
  );

export const updateFollowersFollowingPrivacyBodySchema = z.object({
  hideFollowersAndFollowing: z.boolean(),
});

export type UpdateFollowersFollowingPrivacyBody = z.infer<
  typeof updateFollowersFollowingPrivacyBodySchema
>;

