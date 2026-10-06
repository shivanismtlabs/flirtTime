import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { ChannelController } from './channel.controller.js';
import {
  channelBrowseQuerySchema,
  channelIdParamsSchema,
  channelMessageIdParamsSchema,
  channelMessagesQuerySchema,
  channelSlugParamsSchema,
  channelSlugQuerySchema,
  channelSettingsBodySchema,
  channelsQuerySchema,
  createChannelBodySchema,
  deleteChannelMessageQuerySchema,
  deleteChannelMessagesBodySchema,
  editChannelMessageBodySchema,
  markChannelReadBodySchema,
  sendChannelMessageBodySchema,
  updateChannelBodySchema,
} from './channel.schema.js';

export async function channelRoutes(app: FastifyInstance): Promise<void> {
  const controller = new ChannelController();
  tagRoutes(app, 'Channels');
  app.addHook('preHandler', authenticate);

  app.get(
    '/channels',
    {
      schema: requireBearer({
        summary: 'List channels',
        description:
          'Your Channel tab inbox (pin + recent). Pass `archived=true` for archived channels. Keyset via `cursor` (sort_at).',
        querystring: channelsQuerySchema,
      }),
    },
    controller.listChannels,
  );

  app.get(
    '/channels/browse',
    {
      schema: requireBearer({
        summary: 'Browse public channels',
        description:
          'Search public channels. Returns `isFollowing` for each row. Keyset via `cursor`.',
        querystring: channelBrowseQuerySchema,
      }),
    },
    controller.browseChannels,
  );

  app.get(
    '/channels/slug-available',
    {
      schema: requireBearer({
        summary: 'Check invite slug availability',
        description:
          'Instagram-style invite handle check. Pass `excludeChannelId` when editing. Returns `{ slug, available, reason? }`.',
        querystring: channelSlugQuerySchema,
      }),
    },
    controller.checkInviteSlug,
  );

  app.post(
    '/channels',
    {
      schema: requireBearer({
        summary: 'Create channel',
        description:
          'Create a broadcast channel. Creator becomes owner. Optional `inviteSlug` (auto-generated if omitted). `participantIds` are initial followers; `adminIds` (subset) become admins. Only owner/admin may post messages.',
        body: createChannelBodySchema,
      }),
    },
    controller.createChannel,
  );

  app.get(
    '/channels/by-slug/:slug',
    {
      schema: requireBearer({
        summary: 'Get channel by invite slug',
        description:
          'Resolve invite/public link slug to channel detail. Works for private invite links too.',
        params: channelSlugParamsSchema,
      }),
    },
    controller.getChannelBySlug,
  );

  app.get(
    '/channels/:id',
    {
      schema: requireBearer({
        summary: 'Get channel',
        description:
          'Channel detail. Members get full access; non-members can view public channels (no follower list).',
        params: channelIdParamsSchema,
      }),
    },
    controller.getChannel,
  );

  app.patch(
    '/channels/:id',
    {
      schema: requireBearer({
        summary: 'Update channel',
        description:
          'Owner/admin only. Update name, description, avatar, public/private, or invite slug.',
        params: channelIdParamsSchema,
        body: updateChannelBodySchema,
      }),
    },
    controller.updateChannel,
  );

  app.post(
    '/channels/:id/follow',
    {
      schema: requireBearer({
        summary: 'Follow channel',
        description: 'Join a public channel as a follower.',
        params: channelIdParamsSchema,
      }),
    },
    controller.followChannel,
  );

  app.post(
    '/channels/:id/read',
    {
      schema: requireBearer({
        summary: 'Mark channel read',
        description:
          'Clear unread for this channel. Optional `messageId` (defaults to latest).',
        params: channelIdParamsSchema,
        body: markChannelReadBodySchema,
      }),
    },
    controller.markRead,
  );

  app.post(
    '/channels/:id/unread',
    {
      schema: requireBearer({
        summary: 'Mark channel unread',
        description: 'Force at least one unread on this channel in the inbox.',
        params: channelIdParamsSchema,
      }),
    },
    controller.markUnread,
  );

  app.patch(
    '/channels/:id/settings',
    {
      schema: requireBearer({
        summary: 'Update channel settings',
        description:
          'Mute, pin, or archive a channel for the current user only.',
        params: channelIdParamsSchema,
        body: channelSettingsBodySchema,
      }),
    },
    controller.updateSettings,
  );

  app.post(
    '/channels/:id/leave',
    {
      schema: requireBearer({
        summary: 'Unfollow / leave channel',
        description:
          'Leave the channel (unfollow). Owner cannot leave — delete the channel instead.',
        params: channelIdParamsSchema,
      }),
    },
    controller.leaveChannel,
  );

  app.delete(
    '/channels/:id',
    {
      schema: requireBearer({
        summary: 'Delete channel',
        description: 'Owner/admin only. Soft-deletes the channel for everyone.',
        params: channelIdParamsSchema,
      }),
    },
    controller.deleteChannel,
  );

  app.get(
    '/channels/:id/messages',
    {
      schema: requireBearer({
        summary: 'List channel messages',
        description:
          'Keyset pagination via `cursor` (message uuid). Newest first.',
        params: channelIdParamsSchema,
        querystring: channelMessagesQuerySchema,
      }),
    },
    controller.listMessages,
  );

  app.post(
    '/channels/messages',
    {
      schema: requireBearer({
        summary: 'Send channel message',
        description:
          'Owner/admin only. Text or image (`type` + `mediaIds`). Optional `replyToId`. Followers cannot post.',
        body: sendChannelMessageBodySchema,
      }),
    },
    controller.sendMessage,
  );

  app.patch(
    '/channels/messages/:messageId',
    {
      schema: requireBearer({
        summary: 'Edit channel message',
        description: 'Owner/admin only. Edit a text channel post.',
        params: channelMessageIdParamsSchema,
        body: editChannelMessageBodySchema,
      }),
    },
    controller.editMessage,
  );

  app.post(
    '/channels/messages/delete',
    {
      schema: requireBearer({
        summary: 'Delete channel messages (single or bulk)',
        description:
          'Delete 1–10 messages in one request. `scope=me` (default): hide for you only. `scope=everyone`: soft-delete for all (owner/admin only). Prefer this over per-message DELETE. All ids must be in the same channel.',
        body: deleteChannelMessagesBodySchema,
      }),
    },
    controller.deleteMessages,
  );

  app.delete(
    '/channels/messages/:messageId',
    {
      schema: requireBearer({
        summary: 'Delete channel message',
        description:
          'Alias of bulk delete for a single id. Prefer `POST /channels/messages/delete`. `scope=me` | `everyone`.',
        params: channelMessageIdParamsSchema,
        querystring: deleteChannelMessageQuerySchema,
      }),
    },
    controller.deleteMessage,
  );
}
