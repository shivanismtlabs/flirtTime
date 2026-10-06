import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { SettingController } from './setting.controller.js';
import {
  updateCommentSettingsBodySchema,
  updateFollowersFollowingPrivacyBodySchema,
  updateMessagePrivacyBodySchema,
  updateOffensiveSettingsBodySchema,
  updatePostSettingsBodySchema,
  updateStorySettingsBodySchema,
  updateTagVisibilityBodySchema,
  updateUserVisibilityBodySchema,
} from './setting.schema.js';

/**
 * Linkgram-compatible settings under `/api/v1/setting/*`.
 */
export async function settingRoutes(app: FastifyInstance): Promise<void> {
  const controller = new SettingController();
  tagRoutes(app, 'Setting');
  app.addHook('preHandler', authenticate);

  app.get(
    '/offensive-setting',
    {
      schema: requireBearer({
        summary: 'Get offensive content settings',
        description:
          'Returns real-time filter / multilingual / warning prefs. Defaults when none saved.',
      }),
    },
    controller.getOffensive,
  );

  app.put(
    '/offensive-setting',
    {
      schema: requireBearer({
        summary: 'Update offensive content settings',
        description:
          'Partial update of multilingualSupport, warningAndEducation, realTimeFiltering, preferredLanguage.',
        body: updateOffensiveSettingsBodySchema,
      }),
    },
    controller.updateOffensive,
  );

  app.get(
    '/get-message-privacy',
    {
      schema: requireBearer({
        summary: 'Get message privacy settings',
        description:
          'Returns messagePrivacy, allowMessageRequests, allowGroupAdds, readReceipts (creates defaults if missing).',
      }),
    },
    controller.getMessagePrivacy,
  );

  app.put(
    '/update-message-privacy',
    {
      schema: requireBearer({
        summary: 'Update message privacy settings',
        description:
          'Partial update. Empty strings for allowMessageRequests / allowGroupAdds are ignored. Enum: everyone | only_people_you_follow.',
        body: updateMessagePrivacyBodySchema,
      }),
    },
    controller.updateMessagePrivacy,
  );

  app.get(
    '/get-story-settings',
    {
      schema: requireBearer({
        summary: 'Get story settings',
        description:
          'Returns viewStoriesPermission, onlyShareWithPeoples, saveToCameraRoll, messageRepliesPermission, saveToArchive, allowSharing (creates defaults if missing).',
      }),
    },
    controller.getStorySettings,
  );

  app.put(
    '/update-story-settings',
    {
      schema: requireBearer({
        summary: 'Update story settings',
        description:
          'Partial update. Empty `messageRepliesPermission` is ignored. ' +
          '`viewStoriesPermission`: everyone | close_friends | followers. ' +
          '`messageRepliesPermission`: everyone | people_you_follow | off. ' +
          '`onlyShareWithPeoples`: up to 100 user UUIDs.',
        body: updateStorySettingsBodySchema,
      }),
    },
    controller.updateStorySettings,
  );

  app.get(
    '/comment-settings',
    {
      schema: requireBearer({
        summary: 'Get comment settings',
        description:
          'Returns allowCommentsPermission, hideOffensiveComments, enableManualFilters (creates defaults if missing).',
      }),
    },
    controller.getCommentSettings,
  );

  app.put(
    '/update-comment-settings',
    {
      schema: requireBearer({
        summary: 'Update comment settings',
        description:
          'Partial update (any subset of fields). Empty `allowCommentsPermission` is ignored. ' +
          '`allowCommentsPermission`: everyone | people_you_follow | no_one.',
        body: updateCommentSettingsBodySchema,
      }),
    },
    controller.updateCommentSettings,
  );

  app.get(
    '/post-settings',
    {
      schema: requireBearer({
        summary: 'Get post default settings',
        description:
          'Returns defaultAudience and specificPeople (creates defaults if missing).',
      }),
    },
    controller.getPostSettings,
  );

  app.put(
    '/post-settings',
    {
      schema: requireBearer({
        summary: 'Update post default settings',
        description:
          'Partial update. Empty `defaultAudience` is ignored. ' +
          '`defaultAudience`: everyone | people_you_follow | only_me | specific_people. ' +
          '`specificPeople`: up to 100 user UUIDs.',
        body: updatePostSettingsBodySchema,
      }),
    },
    controller.updatePostSettings,
  );

  app.get(
    '/tag-visibility',
    {
      schema: requireBearer({
        summary: 'Get tag / mention visibility settings',
        description:
          'Returns tagPermission, mentionPermission, tagPermissionUserId (creates defaults if missing).',
      }),
    },
    controller.getTagVisibility,
  );

  app.post(
    '/tag-visibility',
    {
      schema: requireBearer({
        summary: 'Update tag / mention visibility settings',
        description:
          'Partial update. Empty string enums are ignored. ' +
          '`tagPermission` / `mentionPermission`: everyone | people_you_follow | no_one. ' +
          '`tagPermissionUserId`: up to 100 user UUIDs.',
        body: updateTagVisibilityBodySchema,
      }),
    },
    controller.updateTagVisibility,
  );

  app.get(
    '/user-visibility',
    {
      schema: requireBearer({
        summary: 'Get online / last-seen visibility settings',
        description:
          'Returns onlineVisibility, lastSeenVisibility, blockedUsers (creates defaults if missing).',
      }),
    },
    controller.getUserVisibility,
  );

  app.post(
    '/user-visibility',
    {
      schema: requireBearer({
        summary: 'Update online / last-seen visibility settings',
        description:
          'Partial update. Empty string enums are ignored. ' +
          '`lastSeenVisibility`: everyone | my_contacts | my_contacts_except | nobody. ' +
          '`onlineVisibility`: everyone | my_contacts | my_contacts_except | nobody | same_as_last_seen. ' +
          '`blockedUsers`: up to 100 UUIDs (always hide + exception list for my_contacts_except).',
        body: updateUserVisibilityBodySchema,
      }),
    },
    controller.updateUserVisibility,
  );

  app.get(
    '/privacy/followers-following',
    {
      schema: requireBearer({
        summary: 'Get followers / following list privacy',
        description:
          'Returns `hideFollowersAndFollowing`. When true, other users cannot open your followers or following lists (you can still see your own).',
      }),
    },
    controller.getFollowersFollowingPrivacy,
  );

  app.put(
    '/privacy/followers-following',
    {
      schema: requireBearer({
        summary: 'Update followers / following list privacy',
        description:
          'Set `hideFollowersAndFollowing` to hide your followers and following lists from other accounts.',
        body: updateFollowersFollowingPrivacyBodySchema,
      }),
    },
    controller.updateFollowersFollowingPrivacy,
  );
}
