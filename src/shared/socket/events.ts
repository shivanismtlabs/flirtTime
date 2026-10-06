/**
 * OneVibe Socket.IO event names
 *
 * Convention: `{domain}:{action}` (+ optional `:ack` / result)
 * - Client → server: imperative verb (`chat:message:send`)
 * - Server → client push: noun / past (`chat:message:new`)
 * - Request/response: same event + `:ack`
 *
 * Phased rollout:
 * - Phase 1 (MVP): system, presence, chat message/conversation, notify, inbox
 * - Phase 2: group, pin, react, poll
 * - Phase 3: channel, call
 * - Phase 4: social (feed post, vibe, follow)
 */

export const SOCKET_EVENT = {
  // ─── System ───────────────────────────────────────────────
  SYSTEM_READY: 'system:ready',
  SYSTEM_PING: 'system:ping',
  SYSTEM_PONG: 'system:pong',
  SYSTEM_HEARTBEAT: 'system:heartbeat',
  SYSTEM_HEARTBEAT_ACK: 'system:heartbeat:ack',
  ERROR: 'error',

  // ─── Presence ─────────────────────────────────────────────
  PRESENCE_SET: 'presence:set',
  PRESENCE_GET: 'presence:get',
  PRESENCE_UPDATE: 'presence:update',
  PRESENCE_ONLINE_LIST: 'presence:online:list',
  PRESENCE_ONLINE_LIST_ACK: 'presence:online:list:ack',
  PRESENCE_TYPING: 'presence:typing',
  PRESENCE_TYPING_UPDATE: 'presence:typing:update',

  // ─── Chat — rooms ─────────────────────────────────────────
  CHAT_CONVERSATION_JOIN: 'chat:conversation:join',
  CHAT_CONVERSATION_LEAVE: 'chat:conversation:leave',
  /** Focused chat screen (WhatsApp-style: skip FCM + auto-read while active) */
  CHAT_CONVERSATION_VIEWING: 'chat:conversation:viewing',

  // ─── Chat — messages (Phase 1) ────────────────────────────
  CHAT_MESSAGE_SEND: 'chat:message:send',
  CHAT_MESSAGE_SEND_ACK: 'chat:message:send:ack',
  CHAT_MESSAGE_NEW: 'chat:message:new',
  CHAT_MESSAGE_EDIT: 'chat:message:edit',
  CHAT_MESSAGE_EDIT_ACK: 'chat:message:edit:ack',
  CHAT_MESSAGE_EDITED: 'chat:message:edited',
  CHAT_MESSAGE_DELETE: 'chat:message:delete',
  CHAT_MESSAGE_DELETE_ACK: 'chat:message:delete:ack',
  CHAT_MESSAGE_DELETED: 'chat:message:deleted',
  CHAT_MESSAGE_LIST: 'chat:message:list',
  CHAT_MESSAGE_LIST_ACK: 'chat:message:list:ack',
  CHAT_MESSAGE_DELIVERED: 'chat:message:delivered',
  CHAT_MESSAGE_SEEN: 'chat:message:seen',
  CHAT_MESSAGE_SEEN_ACK: 'chat:message:seen:ack',
  CHAT_MESSAGE_STATUS: 'chat:message:status',
  /** Client → server: WhatsApp-style message info (receipts) */
  CHAT_MESSAGE_INFO: 'chat:message:info',
  CHAT_MESSAGE_INFO_ACK: 'chat:message:info:ack',
  CHAT_UNREAD_GET: 'chat:unread:get',
  CHAT_UNREAD_GET_ACK: 'chat:unread:get:ack',
  CHAT_INBOX_REFRESH: 'chat:inbox:refresh',

  // ─── Chat — conversations (Phase 1) ───────────────────────
  CHAT_CONVERSATION_CREATE: 'chat:conversation:create',
  CHAT_CONVERSATION_CREATE_ACK: 'chat:conversation:create:ack',
  CHAT_CONVERSATION_LIST: 'chat:conversation:list',
  CHAT_CONVERSATION_LIST_ACK: 'chat:conversation:list:ack',
  CHAT_CONVERSATION_GET: 'chat:conversation:get',
  CHAT_CONVERSATION_GET_ACK: 'chat:conversation:get:ack',
  CHAT_CONVERSATION_DELETE: 'chat:conversation:delete',
  CHAT_CONVERSATION_DELETE_ACK: 'chat:conversation:delete:ack',
  /** Server push — conversation permanently deleted for all participants */
  CHAT_CONVERSATION_DELETED: 'chat:conversation:deleted',
  CHAT_CONVERSATION_SETTINGS_UPDATE: 'chat:conversation:settings:update',
  CHAT_CONVERSATION_SETTINGS_UPDATE_ACK: 'chat:conversation:settings:update:ack',
  CHAT_CONVERSATION_SETTINGS_UPDATED: 'chat:conversation:settings:updated',
  CHAT_CONVERSATION_STATUS_GET: 'chat:conversation:status:get',
  CHAT_CONVERSATION_STATUS_GET_ACK: 'chat:conversation:status:get:ack',
  CHAT_SYSTEM_MESSAGE: 'chat:system:message',
  CHAT_SCREENSHOT: 'chat:screenshot',

  // ─── Chat — group / members (Phase 2) ─────────────────────
  CHAT_MEMBER_ADD: 'chat:member:add',
  CHAT_MEMBER_ADD_ACK: 'chat:member:add:ack',
  CHAT_MEMBER_ADDED: 'chat:member:added',
  CHAT_MEMBER_REMOVE: 'chat:member:remove',
  CHAT_MEMBER_REMOVE_ACK: 'chat:member:remove:ack',
  CHAT_MEMBER_REMOVED: 'chat:member:removed',
  CHAT_MEMBER_LEAVE: 'chat:member:leave',
  CHAT_MEMBER_LEAVE_ACK: 'chat:member:leave:ack',
  CHAT_MEMBER_ROLE_UPDATED: 'chat:member:role:updated',
  CHAT_GROUP_UPDATE: 'chat:group:update',
  CHAT_GROUP_UPDATE_ACK: 'chat:group:update:ack',
  /** Server push — group title/avatar changed */
  CHAT_GROUP_UPDATED: 'chat:group:updated',

  // ─── Chat — pin / react / poll / forward (Phase 2) ────────
  CHAT_MESSAGE_PIN: 'chat:message:pin',
  CHAT_MESSAGE_PIN_ACK: 'chat:message:pin:ack',
  CHAT_MESSAGE_PIN_LIST: 'chat:message:pin:list',
  CHAT_MESSAGE_PIN_LIST_ACK: 'chat:message:pin:list:ack',
  CHAT_MESSAGE_PIN_UPDATED: 'chat:message:pin:updated',
  CHAT_MESSAGE_PIN_EXPIRED: 'chat:message:pin:expired',
  CHAT_MESSAGE_REACT: 'chat:message:react',
  CHAT_MESSAGE_REACT_ACK: 'chat:message:react:ack',
  CHAT_MESSAGE_REACTED: 'chat:message:reacted',
  CHAT_MESSAGE_FORWARD: 'chat:message:forward',
  CHAT_MESSAGE_FORWARD_ACK: 'chat:message:forward:ack',
  CHAT_MESSAGE_TRANSLATE: 'chat:message:translate',
  CHAT_MESSAGE_TRANSLATE_ACK: 'chat:message:translate:ack',
  CHAT_POLL_VOTE: 'chat:poll:vote',
  CHAT_POLL_VOTE_ACK: 'chat:poll:vote:ack',

  // ─── Channel (Phase 3) ────────────────────────────────────
  CHANNEL_JOIN: 'channel:join',
  CHANNEL_LEAVE: 'channel:leave',
  /** Focused channel thread (WhatsApp-style: skip unread +1 / push while active) */
  CHANNEL_VIEWING: 'channel:viewing',
  CHANNEL_CREATE: 'channel:create',
  CHANNEL_CREATE_ACK: 'channel:create:ack',
  CHANNEL_EDIT: 'channel:edit',
  CHANNEL_EDIT_ACK: 'channel:edit:ack',
  CHANNEL_DELETE: 'channel:delete',
  CHANNEL_DELETE_ACK: 'channel:delete:ack',
  CHANNEL_LIST: 'channel:list',
  CHANNEL_LIST_ACK: 'channel:list:ack',
  CHANNEL_FOLLOWED_LIST: 'channel:followed:list',
  CHANNEL_FOLLOWED_LIST_ACK: 'channel:followed:list:ack',
  CHANNEL_FOLLOW: 'channel:follow',
  CHANNEL_FOLLOW_ACK: 'channel:follow:ack',
  CHANNEL_UPDATED: 'channel:updated',
  CHANNEL_FOLLOWERS_UPDATED: 'channel:followers:updated',
  CHANNEL_MESSAGE_SEND: 'channel:message:send',
  CHANNEL_MESSAGE_SEND_ACK: 'channel:message:send:ack',
  CHANNEL_MESSAGE_NEW: 'channel:message:new',
  CHANNEL_MESSAGE_ADMIN_EDIT: 'channel:message:admin:edit',
  CHANNEL_MESSAGE_ADMIN_EDIT_ACK: 'channel:message:admin:edit:ack',
  CHANNEL_MESSAGE_EDITED: 'channel:message:edited',
  CHANNEL_MESSAGE_ADMIN_DELETE: 'channel:message:admin:delete',
  CHANNEL_MESSAGE_ADMIN_DELETE_ACK: 'channel:message:admin:delete:ack',
  CHANNEL_MESSAGE_DELETED: 'channel:message:deleted',
  CHANNEL_MESSAGE_SEEN: 'channel:message:seen',
  CHANNEL_MESSAGE_SEEN_ACK: 'channel:message:seen:ack',
  CHANNEL_MESSAGE_UNREAD: 'channel:message:unread',
  CHANNEL_MESSAGE_UNREAD_ACK: 'channel:message:unread:ack',

  // ─── Calls (Phase 3) ──────────────────────────────────────
  CALL_CREATE: 'call:create',
  CALL_CREATE_ACK: 'call:create:ack',
  CALL_INCOMING: 'call:incoming',
  CALL_ACCEPT: 'call:accept',
  CALL_JOIN: 'call:join',
  CALL_DECLINE: 'call:decline',
  CALL_DECLINED: 'call:declined',
  /** Callee explicitly rejected (alias of declined without busy) */
  CALL_REJECTED: 'call:rejected',
  /** Caller cancelled before pickup */
  CALL_CANCELLED: 'call:cancelled',
  /** Callee was already on another call — same shape as CALL_DECLINED with reason busy */
  CALL_BUSY: 'call:busy',
  CALL_LEAVE: 'call:leave',
  CALL_LEAVE_ACK: 'call:leave:ack',
  CALL_END: 'call:end',
  CALL_END_ACK: 'call:end:ack',
  CALL_PARTICIPANT_JOINED: 'call:participant:joined',
  CALL_PARTICIPANT_LEFT: 'call:participant:left',

  // ─── Social / relationship ────────────────────────────────
  /** Server push — actor blocked target (both user rooms + optional DM room) */
  USER_BLOCKED: 'user:blocked',
  /** Server push — actor unblocked target */
  USER_UNBLOCKED: 'user:unblocked',

  // ─── Social feed / vibe / follow (Phase 4) ────────────────
  /** Client → join watchers of an author profile grid */
  PROFILE_JOIN: 'profile:join',
  PROFILE_LEAVE: 'profile:leave',
  /** Client → join open post detail for live stats */
  FEED_POST_JOIN: 'feed:post:join',
  FEED_POST_LEAVE: 'feed:post:leave',
  /** Server push — new root post published */
  FEED_POST_CREATED: 'feed:post:created',
  FEED_POST_DELETED: 'feed:post:deleted',
  FEED_POST_UPDATED: 'feed:post:updated',
  /** Server push — comment added on a post */
  FEED_COMMENT_CREATED: 'feed:comment:created',
  FEED_COMMENT_DELETED: 'feed:comment:deleted',
  /** Server push — comment like count / nested repliesCount */
  FEED_COMMENT_UPDATED: 'feed:comment:updated',
  /** Client → join open vibe detail */
  VIBE_JOIN: 'vibe:join',
  VIBE_LEAVE: 'vibe:leave',
  VIBE_CREATED: 'vibe:created',
  VIBE_DELETED: 'vibe:deleted',
  VIBE_UPDATED: 'vibe:updated',
  VIBE_COMMENT_CREATED: 'vibe:comment:created',
  VIBE_COMMENT_DELETED: 'vibe:comment:deleted',
  VIBE_COMMENT_UPDATED: 'vibe:comment:updated',
  /**
   * Server push — relationship edge changed for actor + target.
   * status: requested | following | none
   */
  FOLLOW_CHANGED: 'follow:changed',

  // ─── Notifications ────────────────────────────────────────
  NOTIFY_NEW: 'notify:new',
  NOTIFY_ACK: 'notify:ack',

  /**
   * Server → client: this device's session was revoked (other login / logout).
   * Client should clear tokens and show login. Socket is disconnected right after.
   */
  AUTH_SESSION_REVOKED: 'auth:session_revoked',

  // ─── Media ────────────────────────────────────────────────
  MEDIA_THUMBNAIL_READY: 'media:thumbnail:ready',
} as const;

export type SocketEventName = (typeof SOCKET_EVENT)[keyof typeof SOCKET_EVENT];

/** Room name helpers — keep room keys consistent across nodes */
export const SOCKET_ROOM = {
  user: (userId: string) => `user:${userId}`,
  /** Watchers of a user's online / last-seen status */
  presence: (userId: string) => `presence:${userId}`,
  conversation: (conversationId: string) => `conversation:${conversationId}`,
  channel: (channelId: string) => `channel:${channelId}`,
  call: (callId: string) => `call:${callId}`,
  /** Watchers of a profile grid (public UUID) */
  profile: (userId: string) => `profile:${userId}`,
  /** Watchers of a post detail (public post UUID) */
  post: (postId: string) => `post:${postId}`,
  /** Watchers of a vibe detail (public post UUID for vibe) */
  vibe: (vibeId: string) => `vibe:${vibeId}`,
} as const;

/** Standard ack / error payload shapes for request–response events */
export type SocketAckOk<T = unknown> = {
  requestId?: string
  success: true
  data: T
}

export type SocketAckErr = {
  requestId?: string
  success: false
  error: { code: string; message: string }
}

export type SocketAck<T = unknown> = SocketAckOk<T> | SocketAckErr
