import type { FastifyInstance } from 'fastify';
import { authenticate, optionalAuthenticate } from '../../shared/middleware/index.js';
import { requireBearer, SWAGGER_DEMO_PASSWORD, tagRoutes, withBodyExample } from '../../shared/swagger/route-meta.js';
import { UserController } from './user.controller.js';
import { paginationQuerySchema } from '../../shared/utils/index.js';
import {
  bulkBlockBodySchema,
  deleteAccountBodySchema,
  discoverPeopleQuerySchema,
  groupCandidatesQuerySchema,
  listUsersQuerySchema,
  nearbyUsersQuerySchema,
  applyChangeEmailBodySchema,
  applyChangePhoneBodySchema,
  updateProfileBodySchema,
  userIdParamsSchema,
  usernameParamsSchema,
} from './user.schema.js';

export async function userRoutes(app: FastifyInstance): Promise<void> {
  const controller = new UserController();
  tagRoutes(app, 'Users');

  app.get(
    '/',
    {
      schema: requireBearer({
        summary: 'Search users',
        description:
          'Search / browse users (excludes self + mutual blocks). Filters: `q`, `gender`, `country` / `countries` / `nationality` (comma-separated or repeated; country name, ISO code, uuid, or demonym), `profession`, `ageMin`, `ageMax`, `latitude`+`longitude`+`radiusKm` (location sharing required). Ranking: people you recently DMed first (`last_message_at`), then popularity when `q` is omitted (otherwise account recency). Each row includes `stats`, `relationship`, `nationality`, localized `country` (request language), and `distanceKm` (km number, rounded to 2 decimals: `11` if whole, `11.45` if fractional). Distance uses query `latitude`+`longitude` when sent; otherwise the caller’s saved `user_details` coords. `null` if either side has no coords. Radius filter applies only when query lat/lng are sent (default 50 km).',
        querystring: listUsersQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.search,
  );

  app.get(
    '/discover-people',
    {
      schema: requireBearer({
        summary: 'Discover people',
        description:
          'Browse users to discover (excludes self and mutual blocks). Optional filters: `q`, `gender`, `country` / `countries` / `nationality` (comma-separated or repeated; country name, ISO code, uuid, or demonym), `profession`, `ageMin`, `ageMax`, `latitude`+`longitude`+`radiusKm`. Ordered by popularity then recency. Each row includes `stats` and `relationship`.',
        querystring: discoverPeopleQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.discoverPeople,
  );

  app.get(
    '/suggest-people',
    {
      schema: requireBearer({
        summary: 'Suggest people',
        description:
          'Suggested users to follow (excludes self, mutual blocks, and accounts you already follow). Contact matches rank first when contacts are synced. Optional filters: `q`, `gender`, `country` / `countries` / `nationality` (comma-separated or repeated), `profession`, `ageMin`, `ageMax`, `latitude`+`longitude`+`radiusKm`.',
        querystring: discoverPeopleQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.suggestPeople,
  );

  app.get(
    '/taggable',
    {
      schema: requireBearer({
        summary: 'Taggable users',
        description:
          'Users you may tag on a post/vibe (respects their tag visibility: everyone | people_you_follow | no_one + allowlist). Excludes self and mutual blocks. Same response as `GET /users` search: `{ rows, total }` with `stats` and `relationship` per row. People you follow are ranked first. Filters: `q`, `gender`, `country` / `nationality`, `profession`, `ageMin`, `ageMax`, `latitude`+`longitude`+`radiusKm`, plus `page`+`limit`.',
        querystring: listUsersQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.listTaggable,
  );

  app.get(
    '/group-candidates',
    {
      schema: requireBearer({
        summary: 'Group invite candidates',
        description:
          'Users you may add when creating a group chat (or adding members). Same response as `GET /users`: `{ rows, total }` with full profile, `stats`, and `relationship` per row.\n\n' +
          'Honors `allowGroupAdds` message privacy (`everyone` | `only_people_you_follow`). ' +
          'Excludes self and mutual blocks. Ranking: contacts, then people you follow, then popularity.\n\n' +
          'Optional `conversationId` (existing group): admin only; excludes current members.\n\n' +
          'Filters: `q`, `gender`, `country` / `countries` / `nationality`, `profession`, `ageMin`/`ageMax`, ' +
          '`latitude`+`longitude`+`radiusKm`, `page`+`limit`.',
        querystring: groupCandidatesQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.listGroupCandidates,
  );

  app.get(
    '/location-enabled-count',
    {
      schema: requireBearer({
        summary: 'Location-enabled user count',
        description:
          'Returns `{ count }` of users with `status=active`, not deleted, and `locationPermission` true. No user list.',
      }),
      preHandler: [authenticate],
    },
    controller.locationEnabledCount,
  );

  app.get(
    '/nearby',
    {
      schema: requireBearer({
        summary: 'Nearby people',
        description:
          'List users within `radiusKm` (default 50) who have `locationPermission` true (includes the authenticated user when they fall in range). Search origin is `cityLatitude`+`cityLongitude` when both are sent (must be a pair); otherwise query `latitude`+`longitude`. `distanceKm` is always Haversine from query `latitude`+`longitude` (caller GPS). Ordered nearest to the search origin. Optional `profession`, `gender`, `verified` (`is_verified` badge). Mutual blocks are still excluded. Each row includes avatar, statusText, coords, `distanceKm` (km number: `11` if whole, `11.45` if fractional), nationality, localized `country`, nationalityFlag, and `relationship`. Response includes `searchOrigin` (`user` | `city`) and `locationEnabledCount`: total active, non-deleted users with location sharing on (not limited to the radius).',
        querystring: nearbyUsersQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.nearby,
  );

  app.get(
    '/me',
    {
      schema: requireBearer({
        summary: 'Get my profile',
        description:
          'Full authenticated profile with account fields, user_details (including `living`), live stats, `relationship` (`isSelf: true`), `nationality` plus localized `country`, and `totalAppUsers` / `total_app_users` (count of all non-deleted users on the app).',
      }),
      preHandler: [authenticate],
    },
    controller.me,
  );

  app.get(
    '/me/blocked',
    {
      schema: requireBearer({
        summary: 'List blocked users',
        description:
          'Paginated list of users the authenticated user has blocked, newest first. Each row is a public profile plus `blockedAt`.',
        querystring: paginationQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.listBlocked,
  );

  app.post(
    '/block',
    {
      schema: requireBearer({
        summary: 'Block users (bulk)',
        description:
          'Block 1–50 users by public UUID in one request. Idempotent per id. ' +
          'Partial success: `{ blocked: string[], skipped: { userId, reason }[] }`. ' +
          'Self / missing ids go to `skipped`. Follow edges removed both ways per success. ' +
          'Realtime (`user.blocked`) only to you for each success — targets never notified. ' +
          'Chat: each blocked DM peer gets `isPeerBlocked` for you.',
        body: withBodyExample(bulkBlockBodySchema, {
          userIds: [
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
          ],
        }),
      }),
      preHandler: [authenticate],
    },
    controller.blockMany,
  );

  app.post(
    '/unblock',
    {
      schema: requireBearer({
        summary: 'Unblock users (bulk)',
        description:
          'Unblock 1–50 users by public UUID. Partial success: ' +
          '`{ unblocked: string[], skipped: { userId, reason }[] }`. ' +
          'Not-found blocks are skipped. Realtime only to you.',
        body: withBodyExample(bulkBlockBodySchema, {
          userIds: [
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
          ],
        }),
      }),
      preHandler: [authenticate],
    },
    controller.unblockMany,
  );

  app.get(
    '/by-username/:username',
    {
      schema: {
        summary: 'Get user by username',
        description:
          'Fetch a public user profile by handle, including `living`, `nationality`, localized `country`, stats, `shareLink` (`/api/v1/share/{username}`), and `totalAppUsers`. Optional `@` prefix is ignored. When Bearer token is sent, also returns `relationship`.',
        params: usernameParamsSchema,
      },
      preHandler: [optionalAuthenticate],
    },
    controller.getByUsername,
  );

  app.get(
    '/:id',
    {
      schema: {
        summary: 'Get user by id',
        description:
          'Fetch a public user profile by UUID, including `living`, `nationality`, localized `country`, stats, `shareLink` (`/api/v1/share/{username}`), and `totalAppUsers` / `total_app_users`. When Bearer token is sent, also returns `relationship`: `isFollowing`, `isFollowedBy`, `isRequestedByMe`, `isRequestedToMe`, `isBlocked`, `blockedByOwner`, `isSelf`.',
        params: userIdParamsSchema,
      },
      preHandler: [optionalAuthenticate],
    },
    controller.getById,
  );

  app.patch(
    '/me',
    {
      schema: requireBearer({
        summary: 'Update my profile',
        description:
          'Update the authenticated user’s profile on `user_details`. Fields: `userName` (alias `username`), `dob` (YYYY-MM-DD, age ≥ 12), fullName/displayName, bio, statusText, gender, nationality, profession, link, living, isPrivate, profilePicture, locationPermission, latitude, longitude. Only provided fields are changed. Empty `statusText` or `living` clears that field. Username must be unique.\n\n' +
          'To change **email** or **phone**, use the OTP flow:\n' +
          '1. `POST /auth/otp/send` with `purpose: change_email|change_phone` + Bearer\n' +
          '2. `POST /auth/otp/verify` with the code + Bearer\n' +
          '3. `PATCH /users/me/email` or `PATCH /users/me/phone` with `verificationId`',
        body: updateProfileBodySchema,
      }),
      preHandler: [authenticate],
    },
    controller.updateMe,
  );

  app.patch(
    '/me/email',
    {
      schema: requireBearer({
        summary: 'Change my email',
        description:
          'Apply a verified `change_email` OTP to the authenticated account.\n\n' +
          '1. `POST /auth/otp/send` `{ channel: "email", purpose: "change_email", email }` + Bearer\n' +
          '2. `POST /auth/otp/verify` with code + Bearer → `verificationId`\n' +
          '3. This endpoint with `{ verificationId }`\n\n' +
          'New email must not already be registered. Verification expires ~30 minutes after OTP verify.',
        body: withBodyExample(applyChangeEmailBodySchema, {
          verificationId: '13f2adb1-9740-453e-8bc5-199cc40fe975',
        }),
      }),
      preHandler: [authenticate],
    },
    controller.changeEmail,
  );

  app.patch(
    '/me/phone',
    {
      schema: requireBearer({
        summary: 'Change my phone',
        description:
          'Apply a verified `change_phone` OTP to the authenticated account.\n\n' +
          '1. `POST /auth/otp/send` `{ channel: "phone", purpose: "change_phone", countryCode, phoneNumber }` + Bearer\n' +
          '2. `POST /auth/otp/verify` with code + Bearer → `verificationId`\n' +
          '3. This endpoint with `{ verificationId }`\n\n' +
          'New phone must not already be registered. Verification expires ~30 minutes after OTP verify.',
        body: withBodyExample(applyChangePhoneBodySchema, {
          verificationId: '13f2adb1-9740-453e-8bc5-199cc40fe975',
        }),
      }),
      preHandler: [authenticate],
    },
    controller.changePhone,
  );

  app.delete(
    '/me',
    {
      schema: requireBearer({
        summary: 'Delete my account',
        description:
          'Soft-delete the authenticated account. Requires current `password`. Revokes refresh tokens and deactivates devices.',
        body: withBodyExample(deleteAccountBodySchema, {
          password: SWAGGER_DEMO_PASSWORD,
        }),
      }),
      preHandler: [authenticate],
    },
    controller.deleteMe,
  );

  app.post(
    '/:id/block',
    {
      schema: requireBearer({
        summary: 'Block user',
        description:
          'Block a user by public UUID. Removes follow edges both ways. Idempotent.\n\n' +
          '**Chat (WhatsApp-style):** For you (blocker) DM shows `isPeerBlocked: true` + `peerBlockActions` → UI only **Unblock** + **Delete chat**. ' +
          'Composer is disabled (server rejects send while you still block them). ' +
          'The blocked user is never notified and keeps chatting normally; their new messages to you stay single-tick and are never delivered to you.',
        params: userIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.block,
  );

  app.delete(
    '/:id/block',
    {
      schema: requireBearer({
        summary: 'Unblock user',
        description:
          'Remove a block on the target user. Only you (the unblocker) get realtime; the other user is not told. ' +
          'Chat composer unlocks again after `isPeerBlocked` becomes false. Messages they sent while blocked stay hidden from you forever.',
        params: userIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.unblock,
  );
}
