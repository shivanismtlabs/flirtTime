import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes, withBodyExample } from '../../shared/swagger/route-meta.js';
import { ChatController } from './chat.controller.js';
import {
  addMembersBodySchema,
  bulkArchiveBodySchema,
  conversationIdParamsSchema,
  conversationMemberParamsSchema,
  conversationMessageParamsSchema,
  conversationSettingsBodySchema,
  conversationsQuerySchema,
  createConversationBodySchema,
  deleteMessageQuerySchema,
  deleteMessagesBodySchema,
  deleteConversationQuerySchema,
  editMessageBodySchema,
  forwardMessagesBodySchema,
  markDeliveredBodySchema,
  markReadBodySchema,
  messageIdParamsSchema,
  messagesQuerySchema,
  pinMessageBodySchema,
  pollIdParamsSchema,
  pollVotersParamsSchema,
  pollVotersQuerySchema,
  reactMessageBodySchema,
  reactMessagesBodySchema,
  sendMessageBodySchema,
  translateMessageBodySchema,
  translateMessagesBodySchema,
  updateConversationBodySchema,
  updateMemberRoleBodySchema,
  votePollBodySchema,
} from './chat.schema.js';
import { groupCandidatesQuerySchema } from '../user/user.schema.js';

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  const controller = new ChatController();
  tagRoutes(app, 'Chat');
  app.addHook('preHandler', authenticate);

  app.get(
    '/group-candidates',
    {
      schema: requireBearer({
        summary: 'List users for group create / add members',
        description:
          'Alias of `GET /users/group-candidates`. Same response as `GET /users`: `{ rows, total }` with profile, `stats`, and `relationship`.\n\n' +
          'Honors `allowGroupAdds` privacy. Filters + optional `conversationId` as on users route.',
        querystring: groupCandidatesQuerySchema,
      }),
    },
    controller.listGroupCandidates,
  );

  app.get(
    '/conversations',
    {
      schema: requireBearer({
        summary: 'List conversations',
        description:
          'Inbox ordered by pin then recent activity. Pass `archived=true` for archived chats. Keyset via `cursor` (sort_at).\n\n' +
          '**When you blocked a DM peer:** `isPeerBlocked: true` and `peerBlockActions: { unblock, deleteChat }` — show only those two actions (no send). ' +
          'Unblock: `DELETE /users/:peerId/block`. Delete chat: `DELETE /chat/conversations/:id?scope=me` (your side only; peer sees no change).\n\n' +
          'If **you** were blocked, `isPeerBlocked` stays false — no special UI. Sends succeed with `receiptStatus: sent` only; they never deliver.',
        querystring: conversationsQuerySchema,
      }),
    },
    controller.listConversations,
  );

  app.post(
    '/conversations/archive',
    {
      schema: requireBearer({
        summary: 'Archive / unarchive conversations (bulk)',
        description:
          'Set `isArchived` for 1–50 conversation UUIDs for **you only** (peer never notified). ' +
          'Partial success: `{ updated: string[], skipped: { conversationId, reason }[], archived: boolean }`. ' +
          'Realtime: `chat:conversation:settings:updated` + `chat:inbox:refresh` to your devices only.',
        body: withBodyExample(bulkArchiveBodySchema, {
          conversationIds: [
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
          ],
          archived: true,
        }),
      }),
    },
    controller.archiveConversations,
  );

  app.post(
    '/conversations',
    {
      schema: requireBearer({
        summary: 'Create conversation',
        description:
          'Create a direct DM (exactly one other user) or a group (`title` required). DMs are idempotent.',
        body: createConversationBodySchema,
      }),
    },
    controller.createConversation,
  );

  app.get(
    '/conversations/:id',
    {
      schema: requireBearer({
        summary: 'Get conversation',
        description:
          'Conversation detail including members and your settings. DM: `isPeerBlocked` when you blocked the peer (Unblock / Delete for me UI).',
        params: conversationIdParamsSchema,
      }),
    },
    controller.getConversation,
  );

  app.patch(
    '/conversations/:id',
    {
      schema: requireBearer({
        summary: 'Update channel',
        description:
          'Update group title and/or avatar. Admin only. Direct chats cannot be updated.',
        params: conversationIdParamsSchema,
        body: updateConversationBodySchema,
      }),
    },
    controller.updateConversation,
  );

  app.patch(
    '/conversations/:id/settings',
    {
      schema: requireBearer({
        summary: 'Update conversation settings',
        description:
          'Per-user mute / pin / archive flags for this conversation. Peer is never notified. ' +
          'Realtime (you only): `chat:conversation:settings:updated` + `chat:inbox:refresh`. ' +
          'For many chats use `POST /chat/conversations/archive`.',
        params: conversationIdParamsSchema,
        body: conversationSettingsBodySchema,
      }),
    },
    controller.updateSettings,
  );

  app.delete(
    '/conversations/:id',
    {
      schema: requireBearer({
        summary: 'Delete conversation',
        description:
          '`scope=me` (default): leave your inbox and hide history for you only; peer keeps full chat (use this for Delete after block).\n\n' +
          '`scope=everyone`: permanently destroy for everyone (direct only) — prefer `scope=me` when you blocked someone so they never notice.',
        params: conversationIdParamsSchema,
        querystring: deleteConversationQuerySchema,
      }),
    },
    controller.deleteConversation,
  );

  app.post(
    '/conversations/:id/read',
    {
      schema: requireBearer({
        summary: 'Mark conversation read',
        description:
          'Clear unread badge. Optional `messageId` (public UUID); defaults to latest message. ' +
          'Also runs automatically when you focus the thread (`chat:conversation:viewing`). ' +
          'Blue ticks go to others only if **you** have read receipts on; if **they** have receipts off they never see `read` (mutual).',
        params: conversationIdParamsSchema,
        body: markReadBodySchema,
      }),
    },
    controller.markRead,
  );

  app.post(
    '/conversations/:id/unread',
    {
      schema: requireBearer({
        summary: 'Mark conversation unread',
        description: 'Force an unread badge on this chat (at least 1).',
        params: conversationIdParamsSchema,
      }),
    },
    controller.markUnread,
  );

  app.post(
    '/conversations/:id/delivered',
    {
      schema: requireBearer({
        summary: 'Mark messages delivered',
        description:
          'Advance your delivered cursor so senders can show double-check. Optional messageId. ' +
          'Server also marks delivered when you are socket-online (new messages) or on connect.',
        params: conversationIdParamsSchema,
        body: markDeliveredBodySchema,
      }),
    },
    controller.markDelivered,
  );

  app.post(
    '/delivered/sync',
    {
      schema: requireBearer({
        summary: 'Sync delivered for inbox',
        description:
          'When you come online, mark pending conversations delivered so senders get double-check.',
      }),
    },
    controller.syncInboxDelivered,
  );

  app.get(
    '/conversations/:id/members',
    {
      schema: requireBearer({
        summary: 'List members',
        description: 'Active participants with roles.',
        params: conversationIdParamsSchema,
      }),
    },
    controller.listMembers,
  );

  app.post(
    '/conversations/:id/members',
    {
      schema: requireBearer({
        summary: 'Add members',
        description: 'Add users to a group. Admin only.',
        params: conversationIdParamsSchema,
        body: addMembersBodySchema,
      }),
    },
    controller.addMembers,
  );

  app.delete(
    '/conversations/:id/members/:userId',
    {
      schema: requireBearer({
        summary: 'Remove member / leave',
        description:
          'Admin can remove others; any member can leave themselves. Cannot remove the last admin.',
        params: conversationMemberParamsSchema,
      }),
    },
    controller.removeMember,
  );

  app.patch(
    '/conversations/:id/members/:userId',
    {
      schema: requireBearer({
        summary: 'Update member role',
        description:
          'Promote or demote admin/member. Admin only. Cannot demote the last admin.',
        params: conversationMemberParamsSchema,
        body: updateMemberRoleBodySchema,
      }),
    },
    controller.updateMemberRole,
  );

  app.get(
    '/conversations/:id/messages',
    {
      schema: requireBearer({
        summary: 'List messages',
        description:
          'List messages in a conversation. Use query `cursor` (internal message id) for older pages. Also marks delivered.',
        params: conversationIdParamsSchema,
        querystring: messagesQuerySchema,
      }),
    },
    controller.listMessages,
  );

  app.get(
    '/conversations/:id/pinned-message',
    {
      schema: requireBearer({
        summary: 'Get pinned message',
        description: 'Returns the single pinned message for this conversation, if any.',
        params: conversationIdParamsSchema,
      }),
    },
    controller.getPinnedMessage,
  );

  app.patch(
    '/conversations/:id/messages/:messageId/pin',
    {
      schema: requireBearer({
        summary: 'Pin or unpin a message',
        description: 'At most one pin per conversation. Replaces any existing pin.',
        params: conversationMessageParamsSchema,
        body: pinMessageBodySchema,
      }),
    },
    controller.pinMessage,
  );

  app.post(
    '/messages',
    {
      schema: requireBearer({
        summary: 'Send message',
        description:
          'Send text, media, location, poll, or shared post. Shared post: `type=post` + `postId` — stores a static Instagram-style preview JSON in `meta.sharedPost` (image, caption, author); response includes `sharedPost`.\n\n' +
          '**Block (WhatsApp-style):** If the peer blocked you, send still succeeds with single-tick `receiptStatus: sent`. ' +
          'The message is never delivered, pushed, or shown to them (including after they unblock). ' +
          'You must not surface any “blocked” error — UI stays normal on the blocked side.',
        body: sendMessageBodySchema,
      }),
    },
    controller.sendMessage,
  );

  app.patch(
    '/messages/:messageId',
    {
      schema: requireBearer({
        summary: 'Edit message',
        description: 'Edit your own text message. Sets isEdited.',
        params: messageIdParamsSchema,
        body: editMessageBodySchema,
      }),
    },
    controller.editMessage,
  );

  app.get(
    '/messages/:messageId/info',
    {
      schema: requireBearer({
        summary: 'Message info (WhatsApp-style)',
        description:
          'Delivery and read receipt details for a message **you sent** (personal DM or group).\n\n' +
          'Returns:\n' +
          '- `status` overall tick: `sent` | `delivered` | `read`\n' +
          '- `sentAt` / `deliveredAt` / `readAt` (ISO timestamps; times are from participant cursors)\n' +
          '- `recipients[]` per peer: status + deliveredAt + readAt + profile\n\n' +
          '1:1: one recipient (the other user). Groups: each other active member.\n' +
          'Only the sender may call this endpoint. If **your** read receipts are off, `read` is masked to `delivered` (no `readAt`).',
        params: messageIdParamsSchema,
      }),
    },
    controller.getMessageInfo,
  );

  app.post(
    '/messages/react',
    {
      schema: requireBearer({
        summary: 'React to messages (bulk)',
        description:
          'Add/toggle the same emoji on 1–10 messages in **one** request. Same emoji again removes the reaction.',
        body: reactMessagesBodySchema,
      }),
    },
    controller.reactMessages,
  );

  app.post(
    '/messages/:messageId/react',
    {
      schema: requireBearer({
        summary: 'React to a message',
        description:
          'Alias of bulk react for a single id. Prefer `POST /messages/react`.',
        params: messageIdParamsSchema,
        body: reactMessageBodySchema,
      }),
    },
    controller.reactMessage,
  );

  app.post(
    '/messages/translate',
    {
      schema: requireBearer({
        summary: 'Translate messages (bulk)',
        description:
          'Translate 1–10 text messages to `targetLanguage` in **one** request. Saved per user.',
        body: translateMessagesBodySchema,
      }),
    },
    controller.translateMessages,
  );

  app.post(
    '/messages/:messageId/translate',
    {
      schema: requireBearer({
        summary: 'Translate a message',
        description:
          'Alias of bulk translate for a single id. Prefer `POST /messages/translate`.',
        params: messageIdParamsSchema,
        body: translateMessageBodySchema,
      }),
    },
    controller.translateMessage,
  );

  app.post(
    '/messages/delete',
    {
      schema: requireBearer({
        summary: 'Delete messages (bulk)',
        description:
          'Delete 1–10 messages in **one** request. `scope=me` hides for you only; realtime `chat:message:deleted` + `chat:inbox:refresh` go to **your** sockets only (multi-device). ' +
          '`scope=everyone` soft-deletes for all (you must be the sender of every message); broadcasts room + all participants with `messageIds[]`.',
        body: deleteMessagesBodySchema,
      }),
    },
    controller.deleteMessages,
  );

  app.delete(
    '/messages/:messageId',
    {
      schema: requireBearer({
        summary: 'Delete message',
        description:
          'Alias of bulk delete for a single id. Prefer `POST /messages/delete` for single or multi. `scope=me` | `everyone`.',
        params: messageIdParamsSchema,
        querystring: deleteMessageQuerySchema,
      }),
    },
    controller.deleteMessage,
  );

  app.post(
    '/messages/forward',
    {
      schema: requireBearer({
        summary: 'Forward messages',
        description:
          'Copy 1–10 messages into 1–5 target conversations. Marks forwarded. ' +
          'Each new message emits `chat:message:new` to the target conversation room + other participants (inbox refresh). ' +
          'Shadow-hidden targets (e.g. you are blocked by peer) get no fan-out.',
        body: forwardMessagesBodySchema,
      }),
    },
    controller.forwardMessages,
  );

  app.post(
    '/polls/:pollId/vote',
    {
      schema: requireBearer({
        summary: 'Vote on a poll',
        description:
          'Cast or change your vote. Returns compact poll summary (counts only, no voter list).',
        params: pollIdParamsSchema,
        body: votePollBodySchema,
      }),
    },
    controller.votePoll,
  );

  app.post(
    '/polls/:pollId/close',
    {
      schema: requireBearer({
        summary: 'Close a poll',
        description: 'Creator or conversation admin can close voting.',
        params: pollIdParamsSchema,
      }),
    },
    controller.closePoll,
  );

  app.get(
    '/polls/:pollId/options/:optionId/voters',
    {
      schema: requireBearer({
        summary: 'List poll option voters',
        description:
          'Paginated voters for one option. Blocked for anonymous polls. Keyset cursor.',
        params: pollVotersParamsSchema,
        querystring: pollVotersQuerySchema,
      }),
    },
    controller.listPollVoters,
  );
}
