import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { SOCKET_EVENT, SOCKET_ROOM } from '../../../shared/socket/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONSOLE_HTML_PATH = join(__dirname, 'console.html');

/** Client→server | server→client | request/response pair */
export type EventDirection = 'c2s' | 's2c' | 'both';

export type SocketCatalogEvent = {
  key: string;
  name: string;
  /** High-level product area (sidebar group) */
  group: string;
  /** Finer module (displayed under group) */
  module: string;
  /** Direction of typical traffic */
  direction: EventDirection;
  /** Human docs for this wire event */
  comment: string;
  /** Suggested JSON for Emit panel (c2s / inspect) */
  sample: unknown;
  rooms?: string[];
  notes?: string;
};

export type SocketEventCatalog = {
  generatedAt: string;
  rooms: Record<string, string>;
  modules: Array<{ id: string; title: string; summary: string }>;
  events: SocketCatalogEvent[];
  total: number;
};

const MODULES = [
  {
    id: 'system',
    title: 'System',
    summary: 'Connection handshake, ping/pong, heartbeat, global errors',
  },
  {
    id: 'presence',
    title: 'Presence',
    summary: 'Online / last-seen visibility, typing indicators',
  },
  {
    id: 'chat',
    title: 'Chat',
    summary: 'DM / group messaging, receipts, pins, reactions, members',
  },
  {
    id: 'channel',
    title: 'Channel',
    summary: 'Broadcast channels (follow, admin post, updates)',
  },
  {
    id: 'call',
    title: 'Calls',
    summary:
      '1:1 + group audio/video signaling (Agora is separate). States: ringing → ongoing → ended|missed|declined|cancelled. WhatsApp-style Accept switches calls; group decline/leave does not tear down others.',
  },
  {
    id: 'social',
    title: 'Social',
    summary: 'Feed posts, comments, vibes, follow edges, block',
  },
  {
    id: 'notify',
    title: 'Notifications',
    summary: 'In-app notification push + client ack',
  },
  {
    id: 'media',
    title: 'Media',
    summary: 'Media pipeline push (thumbnails / stream ready)',
  },
] as const;

type Meta = {
  group: string;
  module: string;
  direction: EventDirection;
  comment: string;
  sample?: unknown;
  rooms?: string[];
  notes?: string;
};

const sampleComment = {
  id: 'COMMENT_UUID',
  body: 'Nice post!',
  parentId: null as string | null,
  likesCount: 0,
  repliesCount: 0,
  createdAt: new Date().toISOString(),
  user: {
    id: 'USER_UUID',
    username: 'alice',
    fullName: 'Alice',
    profilePicture: null as string | null,
    isVerified: false,
  },
};

/**
 * Per-event documentation + sample payloads for the Socket Console.
 * Samples for c2s are emit-ready; s2c samples show what the client receives.
 */
const EVENT_META: Record<string, Meta> = {
  // ─── System ─────────────────────────────────────────────
  [SOCKET_EVENT.SYSTEM_READY]: {
    group: 'System',
    module: 'system',
    direction: 's2c',
    comment: 'Server ready after auth; client may sync state after this.',
    sample: { note: 'Server→client (receive only)', ok: true },
  },
  [SOCKET_EVENT.SYSTEM_PING]: {
    group: 'System',
    module: 'system',
    direction: 'c2s',
    comment: 'Client RTT check. Server replies with system:pong.',
    sample: { requestId: 'console-1', t: Date.now() },
  },
  [SOCKET_EVENT.SYSTEM_PONG]: {
    group: 'System',
    module: 'system',
    direction: 's2c',
    comment: 'Reply to system:ping.',
    sample: { requestId: 'console-1', t: Date.now() },
  },
  [SOCKET_EVENT.SYSTEM_HEARTBEAT]: {
    group: 'System',
    module: 'system',
    direction: 'c2s',
    comment:
      'Foreground pulse. Refresh every ~5s while AppState is active. Incoming VoIP/FCM is skipped while this is fresh — socket call:incoming still fires. Send `{ foreground: false }` immediately on background so CallKit/FCM can ring.',
    sample: { foreground: true },
  },
  [SOCKET_EVENT.SYSTEM_HEARTBEAT_ACK]: {
    group: 'System',
    module: 'system',
    direction: 's2c',
    comment: 'Ack for system:heartbeat.',
    sample: { ok: true },
  },
  [SOCKET_EVENT.ERROR]: {
    group: 'System',
    module: 'system',
    direction: 's2c',
    comment: 'Generic socket error payload (validation / auth / handler).',
    sample: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid payload',
      requestId: 'console-1',
    },
  },

  // ─── Presence ───────────────────────────────────────────
  [SOCKET_EVENT.PRESENCE_SET]: {
    group: 'Presence',
    module: 'presence',
    direction: 'c2s',
    comment: 'Optional client-reported status override (rarely used).',
    sample: { status: 'online' },
  },
  [SOCKET_EVENT.PRESENCE_GET]: {
    group: 'Presence',
    module: 'presence',
    direction: 'c2s',
    comment:
      'Request presence snapshots for user UUIDs. Server replies with privacy-filtered presence:update per viewer.',
    sample: { userIds: ['USER_UUID_A', 'USER_UUID_B'] },
    rooms: ['user:{me}'],
  },
  [SOCKET_EVENT.PRESENCE_UPDATE]: {
    group: 'Presence',
    module: 'presence',
    direction: 's2c',
    comment:
      'Privacy-aware presence for one user: online / lastSeenAt / status (null hides UI).',
    sample: {
      userId: 'USER_UUID',
      online: true,
      lastSeenAt: null,
      status: 'online',
    },
  },
  [SOCKET_EVENT.PRESENCE_ONLINE_LIST]: {
    group: 'Presence',
    module: 'presence',
    direction: 'c2s',
    comment: 'Bulk online query; ack on presence:online:list:ack.',
    sample: { userIds: ['USER_UUID_A', 'USER_UUID_B'] },
  },
  [SOCKET_EVENT.PRESENCE_ONLINE_LIST_ACK]: {
    group: 'Presence',
    module: 'presence',
    direction: 's2c',
    comment: 'Bulk online list response.',
    sample: {
      requestId: 'console-1',
      success: true,
      data: { onlineUserIds: ['USER_UUID_A'] },
    },
  },
  [SOCKET_EVENT.PRESENCE_TYPING]: {
    group: 'Presence',
    module: 'presence',
    direction: 'c2s',
    comment: 'Typing indicator for a conversation (client → server).',
    sample: { conversationId: 'CONVERSATION_UUID', isTyping: true },
    rooms: ['conversation:{id}'],
  },
  [SOCKET_EVENT.PRESENCE_TYPING_UPDATE]: {
    group: 'Presence',
    module: 'presence',
    direction: 's2c',
    comment: 'Someone is typing in a conversation you watch.',
    sample: {
      conversationId: 'CONVERSATION_UUID',
      userId: 'USER_UUID',
      isTyping: true,
    },
  },

  // ─── Chat rooms ─────────────────────────────────────────
  [SOCKET_EVENT.CHAT_CONVERSATION_JOIN]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment:
      'Join conversation room (participants only). Denied joins emit `error`.',
    sample: 'CONVERSATION_UUID',
    rooms: ['conversation:{id}'],
    notes: 'Payload may be bare string id or object depending on client.',
  },
  [SOCKET_EVENT.CHAT_CONVERSATION_LEAVE]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Leave conversation room.',
    sample: 'CONVERSATION_UUID',
  },
  [SOCKET_EVENT.CHAT_CONVERSATION_VIEWING]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment:
      'Client reports focused / blurred chat. Suppresses FCM and auto-marks the thread read while active.',
    sample: { conversationId: 'CONVERSATION_UUID', active: true },
  },

  // ─── Chat messages ──────────────────────────────────────
  [SOCKET_EVENT.CHAT_MESSAGE_SEND]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment:
      'Send a text message (participant-only; persists + realtime via ChatService). Prefer REST for rich types.',
    sample: {
      requestId: 'console-1',
      conversationId: 'CONVERSATION_UUID',
      body: 'Hello from socket console',
      clientMsgId: 'client-msg-1',
    },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_SEND_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Ack for chat:message:send (full message on success, error on deny).',
    sample: {
      requestId: 'console-1',
      success: true,
      data: { id: 'MESSAGE_UUID', conversationId: 'CONVERSATION_UUID' },
    },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_NEW]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'New message for conversation room + participant user rooms.',
    sample: {
      id: 'MESSAGE_UUID',
      conversationId: 'CONVERSATION_UUID',
      body: 'Hello',
      senderId: 'USER_UUID',
      createdAt: new Date().toISOString(),
    },
    rooms: ['conversation:{id}', 'user:{participant}'],
  },
  [SOCKET_EVENT.CHAT_MESSAGE_EDIT]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Edit own message body.',
    sample: {
      requestId: 'console-1',
      messageId: 'MESSAGE_UUID',
      body: 'Edited message',
    },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_EDIT_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Ack for edit.',
    sample: { requestId: 'console-1', success: true, data: {} },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_EDITED]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Broadcast edited message to room.',
    sample: {
      id: 'MESSAGE_UUID',
      conversationId: 'CONVERSATION_UUID',
      body: 'Edited',
    },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_DELETE]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Soft-delete a message.',
    sample: { requestId: 'console-1', messageId: 'MESSAGE_UUID' },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_DELETE_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Ack for delete.',
    sample: { requestId: 'console-1', success: true, data: {} },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_DELETED]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Message removed for participants.',
    sample: {
      messageId: 'MESSAGE_UUID',
      conversationId: 'CONVERSATION_UUID',
    },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_LIST]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Paginated history via socket (optional; REST preferred in webapp).',
    sample: {
      requestId: 'console-1',
      conversationId: 'CONVERSATION_UUID',
      limit: 20,
    },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_LIST_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'History page ack.',
    sample: { requestId: 'console-1', success: true, data: { rows: [] } },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_DELIVERED]: {
    group: 'Chat',
    module: 'chat',
    direction: 'both',
    comment:
      'Delivery receipt. Client may emit; server also pushes delivered ticks to sender.',
    sample: {
      conversationId: 'CONVERSATION_UUID',
      messageId: 'MESSAGE_UUID',
    },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_SEEN]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Mark message (and older) as seen.',
    sample: {
      requestId: 'console-1',
      conversationId: 'CONVERSATION_UUID',
      messageId: 'MESSAGE_UUID',
    },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_SEEN_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Ack for seen.',
    sample: { requestId: 'console-1', success: true, data: {} },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_STATUS]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Aggregate status change broadcast (delivered/seen).',
    sample: {
      conversationId: 'CONVERSATION_UUID',
      messageId: 'MESSAGE_UUID',
      status: 'seen',
    },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_INFO]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'WhatsApp-style detailed receipts for one message.',
    sample: { requestId: 'console-1', messageId: 'MESSAGE_UUID' },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_INFO_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Receipts payload for chat:message:info.',
    sample: { requestId: 'console-1', success: true, data: { receipts: [] } },
  },
  [SOCKET_EVENT.CHAT_UNREAD_GET]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Total unread counts for inbox badge.',
    sample: { requestId: 'console-1' },
  },
  [SOCKET_EVENT.CHAT_UNREAD_GET_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Unread totals ack.',
    sample: {
      requestId: 'console-1',
      success: true,
      data: { total: 0 },
    },
  },
  [SOCKET_EVENT.CHAT_INBOX_REFRESH]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Soft signal to re-fetch inbox (ordering / preview changed).',
    sample: { reason: 'message_new' },
    rooms: ['user:{id}'],
  },

  // ─── Chat conversations ─────────────────────────────────
  [SOCKET_EVENT.CHAT_CONVERSATION_CREATE]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Create direct or group conversation.',
    sample: {
      requestId: 'console-1',
      type: 'direct',
      participantIds: ['PEER_USER_UUID'],
    },
  },
  [SOCKET_EVENT.CHAT_CONVERSATION_CREATE_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Created conversation payload.',
    sample: {
      requestId: 'console-1',
      success: true,
      data: { id: 'CONVERSATION_UUID' },
    },
  },
  [SOCKET_EVENT.CHAT_CONVERSATION_LIST]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'List inbox conversations (socket path).',
    sample: { requestId: 'console-1', limit: 20 },
  },
  [SOCKET_EVENT.CHAT_CONVERSATION_LIST_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Inbox rows ack.',
    sample: { requestId: 'console-1', success: true, data: { rows: [] } },
  },
  [SOCKET_EVENT.CHAT_CONVERSATION_GET]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Fetch one conversation detail.',
    sample: {
      requestId: 'console-1',
      conversationId: 'CONVERSATION_UUID',
    },
  },
  [SOCKET_EVENT.CHAT_CONVERSATION_GET_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Conversation detail ack.',
    sample: {
      requestId: 'console-1',
      success: true,
      data: { id: 'CONVERSATION_UUID' },
    },
  },
  [SOCKET_EVENT.CHAT_CONVERSATION_DELETE]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Delete / leave conversation for actor.',
    sample: {
      requestId: 'console-1',
      conversationId: 'CONVERSATION_UUID',
    },
  },
  [SOCKET_EVENT.CHAT_CONVERSATION_DELETE_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Delete ack.',
    sample: { requestId: 'console-1', success: true, data: {} },
  },
  [SOCKET_EVENT.CHAT_CONVERSATION_DELETED]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Conversation gone for participants — remove from UI.',
    sample: { conversationId: 'CONVERSATION_UUID' },
  },
  [SOCKET_EVENT.CHAT_CONVERSATION_SETTINGS_UPDATE]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Mute / pin / notification settings for a conversation.',
    sample: {
      requestId: 'console-1',
      conversationId: 'CONVERSATION_UUID',
      isMuted: false,
    },
  },
  [SOCKET_EVENT.CHAT_CONVERSATION_SETTINGS_UPDATE_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Settings update ack.',
    sample: { requestId: 'console-1', success: true, data: {} },
  },
  [SOCKET_EVENT.CHAT_CONVERSATION_SETTINGS_UPDATED]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Settings changed push to participants.',
    sample: {
      conversationId: 'CONVERSATION_UUID',
      isMuted: true,
    },
  },
  [SOCKET_EVENT.CHAT_CONVERSATION_STATUS_GET]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Fetch conversation status flags.',
    sample: {
      requestId: 'console-1',
      conversationId: 'CONVERSATION_UUID',
    },
  },
  [SOCKET_EVENT.CHAT_CONVERSATION_STATUS_GET_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Status flags ack.',
    sample: { requestId: 'console-1', success: true, data: {} },
  },
  [SOCKET_EVENT.CHAT_SYSTEM_MESSAGE]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'System line in chat (member joined, call ended, etc.).',
    sample: {
      conversationId: 'CONVERSATION_UUID',
      body: 'User joined the group',
      type: 'system',
    },
  },
  [SOCKET_EVENT.CHAT_SCREENSHOT]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Privacy: client reports screenshot of conversation (policy hook).',
    sample: { conversationId: 'CONVERSATION_UUID' },
  },

  // ─── Chat group ─────────────────────────────────────────
  [SOCKET_EVENT.CHAT_MEMBER_ADD]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Add members to group conversation.',
    sample: {
      requestId: 'console-1',
      conversationId: 'CONVERSATION_UUID',
      userIds: ['USER_UUID_HERE'],
    },
  },
  [SOCKET_EVENT.CHAT_MEMBER_ADD_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Add members ack.',
    sample: { requestId: 'console-1', success: true, data: {} },
  },
  [SOCKET_EVENT.CHAT_MEMBER_ADDED]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Member added broadcast.',
    sample: {
      conversationId: 'CONVERSATION_UUID',
      userIds: ['USER_UUID'],
    },
  },
  [SOCKET_EVENT.CHAT_MEMBER_REMOVE]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Remove a group member (admin).',
    sample: {
      requestId: 'console-1',
      conversationId: 'CONVERSATION_UUID',
      userId: 'USER_UUID_HERE',
    },
  },
  [SOCKET_EVENT.CHAT_MEMBER_REMOVE_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Remove member ack.',
    sample: { requestId: 'console-1', success: true, data: {} },
  },
  [SOCKET_EVENT.CHAT_MEMBER_REMOVED]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Member removed broadcast.',
    sample: {
      conversationId: 'CONVERSATION_UUID',
      userId: 'USER_UUID',
    },
  },
  [SOCKET_EVENT.CHAT_MEMBER_LEAVE]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Self leave group.',
    sample: {
      requestId: 'console-1',
      conversationId: 'CONVERSATION_UUID',
    },
  },
  [SOCKET_EVENT.CHAT_MEMBER_LEAVE_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Leave ack.',
    sample: { requestId: 'console-1', success: true, data: {} },
  },
  [SOCKET_EVENT.CHAT_MEMBER_ROLE_UPDATED]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Admin/mod role changed.',
    sample: {
      conversationId: 'CONVERSATION_UUID',
      userId: 'USER_UUID',
      role: 'admin',
    },
  },
  [SOCKET_EVENT.CHAT_GROUP_UPDATE]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Update group title / avatar.',
    sample: {
      requestId: 'console-1',
      conversationId: 'CONVERSATION_UUID',
      title: 'Updated group name',
      avatarPath: null,
    },
  },
  [SOCKET_EVENT.CHAT_GROUP_UPDATE_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Group update ack.',
    sample: { requestId: 'console-1', success: true, data: {} },
  },
  [SOCKET_EVENT.CHAT_GROUP_UPDATED]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Group metadata changed push.',
    sample: {
      conversationId: 'CONVERSATION_UUID',
      title: 'New title',
    },
  },

  // ─── Chat pin / react / poll ────────────────────────────
  [SOCKET_EVENT.CHAT_MESSAGE_PIN]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Pin or unpin a message in conversation.',
    sample: {
      requestId: 'console-1',
      conversationId: 'CONVERSATION_UUID',
      messageId: 'MESSAGE_UUID',
      pinned: true,
    },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_PIN_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Pin ack.',
    sample: { requestId: 'console-1', success: true, data: {} },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_PIN_LIST]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'List pinned messages.',
    sample: {
      requestId: 'console-1',
      conversationId: 'CONVERSATION_UUID',
    },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_PIN_LIST_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Pinned list ack.',
    sample: { requestId: 'console-1', success: true, data: { rows: [] } },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_PIN_UPDATED]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Pin state changed for room.',
    sample: {
      conversationId: 'CONVERSATION_UUID',
      messageId: 'MESSAGE_UUID',
      pinned: true,
    },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_PIN_EXPIRED]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Timed pin expired.',
    sample: {
      conversationId: 'CONVERSATION_UUID',
      messageId: 'MESSAGE_UUID',
    },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_REACT]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Add/toggle emoji reaction on a message.',
    sample: {
      requestId: 'console-1',
      messageId: 'MESSAGE_UUID',
      emoji: '👍',
    },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_REACT_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'React ack.',
    sample: { requestId: 'console-1', success: true, data: {} },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_REACTED]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Reaction update broadcast.',
    sample: {
      messageId: 'MESSAGE_UUID',
      conversationId: 'CONVERSATION_UUID',
      emoji: '👍',
      userId: 'USER_UUID',
    },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_FORWARD]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Forward one or more messages into target conversations.',
    sample: {
      requestId: 'console-1',
      messageIds: ['MESSAGE_UUID'],
      targetConversationIds: ['CONVERSATION_UUID'],
    },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_FORWARD_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Forward ack.',
    sample: { requestId: 'console-1', success: true, data: {} },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_TRANSLATE]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Request live translation for a message.',
    sample: {
      requestId: 'console-1',
      messageId: 'MESSAGE_UUID',
      targetLang: 'en',
    },
  },
  [SOCKET_EVENT.CHAT_MESSAGE_TRANSLATE_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Translation result or failure.',
    sample: {
      requestId: 'console-1',
      success: true,
      data: { text: 'Translated…' },
    },
  },
  [SOCKET_EVENT.CHAT_POLL_VOTE]: {
    group: 'Chat',
    module: 'chat',
    direction: 'c2s',
    comment: 'Vote on an in-chat poll.',
    sample: {
      requestId: 'console-1',
      pollId: 'POLL_UUID',
      optionId: 'OPTION_UUID',
    },
  },
  [SOCKET_EVENT.CHAT_POLL_VOTE_ACK]: {
    group: 'Chat',
    module: 'chat',
    direction: 's2c',
    comment: 'Poll vote ack with tallies.',
    sample: { requestId: 'console-1', success: true, data: {} },
  },

  // ─── Channel ────────────────────────────────────────────
  [SOCKET_EVENT.CHANNEL_JOIN]: {
    group: 'Channel',
    module: 'channel',
    direction: 'c2s',
    comment:
      'Join channel room for live posts (members only). Denied joins emit `error`.',
    sample: 'CHANNEL_UUID',
    rooms: ['channel:{id}'],
  },
  [SOCKET_EVENT.CHANNEL_LEAVE]: {
    group: 'Channel',
    module: 'channel',
    direction: 'c2s',
    comment: 'Leave channel room.',
    sample: 'CHANNEL_UUID',
  },
  [SOCKET_EVENT.CHANNEL_VIEWING]: {
    group: 'Channel',
    module: 'channel',
    direction: 'c2s',
    comment:
      'Client reports focused / blurred channel thread. Suppresses unread +1 while active.',
    sample: { channelId: 'CHANNEL_UUID', active: true },
  },
  [SOCKET_EVENT.CHANNEL_CREATE]: {
    group: 'Channel',
    module: 'channel',
    direction: 'c2s',
    comment: 'Create a broadcast channel.',
    sample: {
      requestId: 'console-1',
      name: 'My channel',
      description: 'Created from console',
      isPublic: true,
      participantIds: [],
      adminIds: [],
    },
  },
  [SOCKET_EVENT.CHANNEL_CREATE_ACK]: {
    group: 'Channel',
    module: 'channel',
    direction: 's2c',
    comment: 'Channel create result.',
    sample: {
      requestId: 'console-1',
      success: true,
      data: { id: 'CHANNEL_UUID' },
    },
  },
  [SOCKET_EVENT.CHANNEL_EDIT]: {
    group: 'Channel',
    module: 'channel',
    direction: 'c2s',
    comment: 'Edit channel metadata (admin).',
    sample: {
      requestId: 'console-1',
      channelId: 'CHANNEL_UUID',
      name: 'Renamed channel',
    },
  },
  [SOCKET_EVENT.CHANNEL_EDIT_ACK]: {
    group: 'Channel',
    module: 'channel',
    direction: 's2c',
    comment: 'Channel edit ack.',
    sample: { requestId: 'console-1', success: true, data: {} },
  },
  [SOCKET_EVENT.CHANNEL_DELETE]: {
    group: 'Channel',
    module: 'channel',
    direction: 'c2s',
    comment: 'Delete channel (owner/admin).',
    sample: { requestId: 'console-1', channelId: 'CHANNEL_UUID' },
  },
  [SOCKET_EVENT.CHANNEL_DELETE_ACK]: {
    group: 'Channel',
    module: 'channel',
    direction: 's2c',
    comment: 'Channel delete ack.',
    sample: { requestId: 'console-1', success: true, data: {} },
  },
  [SOCKET_EVENT.CHANNEL_LIST]: {
    group: 'Channel',
    module: 'channel',
    direction: 'c2s',
    comment: 'Browse / search channels.',
    sample: { requestId: 'console-1', limit: 20 },
  },
  [SOCKET_EVENT.CHANNEL_LIST_ACK]: {
    group: 'Channel',
    module: 'channel',
    direction: 's2c',
    comment: 'Channel list rows.',
    sample: { requestId: 'console-1', success: true, data: { rows: [] } },
  },
  [SOCKET_EVENT.CHANNEL_FOLLOWED_LIST]: {
    group: 'Channel',
    module: 'channel',
    direction: 'c2s',
    comment: 'Channels the user follows.',
    sample: { requestId: 'console-1', limit: 20 },
  },
  [SOCKET_EVENT.CHANNEL_FOLLOWED_LIST_ACK]: {
    group: 'Channel',
    module: 'channel',
    direction: 's2c',
    comment: 'Followed channel list ack.',
    sample: { requestId: 'console-1', success: true, data: { rows: [] } },
  },
  [SOCKET_EVENT.CHANNEL_FOLLOW]: {
    group: 'Channel',
    module: 'channel',
    direction: 'c2s',
    comment: 'Follow or toggle follow on a channel.',
    sample: { requestId: 'console-1', channelId: 'CHANNEL_UUID' },
  },
  [SOCKET_EVENT.CHANNEL_FOLLOW_ACK]: {
    group: 'Channel',
    module: 'channel',
    direction: 's2c',
    comment: 'Follow ack.',
    sample: { requestId: 'console-1', success: true, data: {} },
  },
  [SOCKET_EVENT.CHANNEL_UPDATED]: {
    group: 'Channel',
    module: 'channel',
    direction: 's2c',
    comment: 'Channel metadata or last-message style refresh.',
    sample: { channelId: 'CHANNEL_UUID' },
  },
  [SOCKET_EVENT.CHANNEL_FOLLOWERS_UPDATED]: {
    group: 'Channel',
    module: 'channel',
    direction: 's2c',
    comment: 'Follower count / membership change for room watchers.',
    sample: { channelId: 'CHANNEL_UUID', followersCount: 12 },
  },
  [SOCKET_EVENT.CHANNEL_MESSAGE_SEND]: {
    group: 'Channel',
    module: 'channel',
    direction: 'c2s',
    comment: 'Admin/poster sends channel message.',
    sample: {
      requestId: 'console-1',
      channelId: 'CHANNEL_UUID',
      body: 'Hello channel',
    },
  },
  [SOCKET_EVENT.CHANNEL_MESSAGE_SEND_ACK]: {
    group: 'Channel',
    module: 'channel',
    direction: 's2c',
    comment: 'Channel message send ack.',
    sample: {
      requestId: 'console-1',
      success: true,
      data: { id: 'MESSAGE_UUID' },
    },
  },
  [SOCKET_EVENT.CHANNEL_MESSAGE_NEW]: {
    group: 'Channel',
    module: 'channel',
    direction: 's2c',
    comment: 'New channel post for followers / room.',
    sample: {
      channelId: 'CHANNEL_UUID',
      id: 'MESSAGE_UUID',
      body: 'Hello channel',
    },
    rooms: ['channel:{id}', 'user:{follower}'],
  },
  [SOCKET_EVENT.CHANNEL_MESSAGE_ADMIN_EDIT]: {
    group: 'Channel',
    module: 'channel',
    direction: 'c2s',
    comment: 'Admin edits a channel message.',
    sample: {
      requestId: 'console-1',
      messageId: 'MESSAGE_UUID',
      body: 'Edited channel post',
    },
  },
  [SOCKET_EVENT.CHANNEL_MESSAGE_ADMIN_EDIT_ACK]: {
    group: 'Channel',
    module: 'channel',
    direction: 's2c',
    comment: 'Admin edit ack.',
    sample: { requestId: 'console-1', success: true, data: {} },
  },
  [SOCKET_EVENT.CHANNEL_MESSAGE_EDITED]: {
    group: 'Channel',
    module: 'channel',
    direction: 's2c',
    comment: 'Edited channel message push.',
    sample: {
      channelId: 'CHANNEL_UUID',
      messageId: 'MESSAGE_UUID',
      body: 'Edited',
    },
  },
  [SOCKET_EVENT.CHANNEL_MESSAGE_ADMIN_DELETE]: {
    group: 'Channel',
    module: 'channel',
    direction: 'c2s',
    comment: 'Admin deletes a channel message.',
    sample: {
      requestId: 'console-1',
      messageId: 'MESSAGE_UUID',
    },
  },
  [SOCKET_EVENT.CHANNEL_MESSAGE_ADMIN_DELETE_ACK]: {
    group: 'Channel',
    module: 'channel',
    direction: 's2c',
    comment: 'Admin delete ack.',
    sample: { requestId: 'console-1', success: true, data: {} },
  },
  [SOCKET_EVENT.CHANNEL_MESSAGE_DELETED]: {
    group: 'Channel',
    module: 'channel',
    direction: 's2c',
    comment: 'Channel message deleted push (scope=everyone).',
    sample: {
      channelId: 'CHANNEL_UUID',
      messageId: 'MESSAGE_UUID',
      actorId: 'USER_UUID',
      scope: 'everyone',
    },
  },
  [SOCKET_EVENT.CHANNEL_MESSAGE_SEEN]: {
    group: 'Channel',
    module: 'channel',
    direction: 'both',
    comment:
      'Mark channel read (and older). Server also pushes to the reader’s devices so inbox unread goes to 0.',
    sample: {
      requestId: 'console-1',
      channelId: 'CHANNEL_UUID',
      messageId: 'MESSAGE_UUID',
    },
    rooms: ['channel:{id}', 'user:{reader}'],
  },
  [SOCKET_EVENT.CHANNEL_MESSAGE_SEEN_ACK]: {
    group: 'Channel',
    module: 'channel',
    direction: 's2c',
    comment: 'Ack for channel:message:seen.',
    sample: {
      requestId: 'console-1',
      success: true,
      data: { channelId: 'CHANNEL_UUID', unreadCount: 0 },
    },
  },
  [SOCKET_EVENT.CHANNEL_MESSAGE_UNREAD]: {
    group: 'Channel',
    module: 'channel',
    direction: 'both',
    comment:
      'Force at least one unread on this channel. Pushed to the actor’s devices with server unreadCount.',
    sample: { requestId: 'console-1', channelId: 'CHANNEL_UUID' },
    rooms: ['user:{actor}'],
  },
  [SOCKET_EVENT.CHANNEL_MESSAGE_UNREAD_ACK]: {
    group: 'Channel',
    module: 'channel',
    direction: 's2c',
    comment: 'Ack for channel:message:unread.',
    sample: {
      requestId: 'console-1',
      success: true,
      data: { channelId: 'CHANNEL_UUID', unreadCount: 1 },
    },
  },

  // ─── Calls ──────────────────────────────────────────────
  // Flow (1:1): create → create:ack (caller) + incoming (callee, + FCM/VoIP push)
  //   → accept → join (sessions) → end|decline → end:ack / rejected|cancelled|busy
  // Group: same, but one decline/leave keeps others on Calling… / in-call UI.
  // Accept while on another call supersedes the old call (end:ack + optional cancelled).
  [SOCKET_EVENT.CALL_CREATE]: {
    group: 'Calls',
    module: 'call',
    direction: 'c2s',
    comment:
      'Start an audio or video call on a direct or group conversation. Caller joins the call room immediately and receives Agora credentials on ack. Invitees get call:incoming immediately; iOS VoIP + Android FCM in parallel unless the invitee is in the foreground. Prefer this over REST for realtime.',
    sample: {
      requestId: 'console-1',
      conversationId: 'CONVERSATION_UUID',
      type: 'audio',
    },
    rooms: ['call:{id}', 'user:{invitee}'],
    notes:
      'Payload: conversationId (uuid, required), type: audio|video (default audio), requestId (optional correlation). Caller prior zombie ringing/ongoing rows are superseded. Direct: callee still rings if busy — they can Accept to switch (WhatsApp). Failures return call:create:ack success:false.',
  },
  [SOCKET_EVENT.CALL_CREATE_ACK]: {
    group: 'Calls',
    module: 'call',
    direction: 's2c',
    comment:
      'Reply to call:create. On success, data is a CallSession (call DTO + Agora token/uid/appId). On failure, error.code is BUSY or CREATE_FAILED.',
    sample: {
      requestId: 'console-1',
      success: true,
      data: {
        call: {
          id: 'CALL_UUID',
          conversationId: 'CONVERSATION_UUID',
          conversationType: 'direct',
          type: 'audio',
          status: 'ringing',
          channelName: 'call_CHANNEL',
          callerId: 'USER_UUID',
          calleeId: 'PEER_UUID',
          participants: [],
          appId: 'AGORA_APP_ID',
          startedAt: null,
          endedAt: null,
          createdAt: '2026-08-07T12:00:00.000Z',
        },
        token: 'AGORA_RTC_TOKEN',
        uid: 'AGORA_UID',
        appId: 'AGORA_APP_ID',
      },
    },
    notes:
      'Error sample: { requestId, success:false, error:{ code:"BUSY"|"CREATE_FAILED", message:"User is busy" } }. Client should show toast and leave outgoing UI.',
  },
  [SOCKET_EVENT.CALL_INCOMING]: {
    group: 'Calls',
    module: 'call',
    direction: 's2c',
    comment:
      'Ring signal to invitees after a successful create. Always emitted. APNs VoIP (iOS) and FCM (Android) fire in parallel unless the invitee app is in the foreground. Clients dedupe by callId. Already on a call should offer Accept/Decline swap.',
    sample: {
      call: {
        id: 'CALL_UUID',
        conversationId: 'CONVERSATION_UUID',
        conversationType: 'direct',
        type: 'video',
        status: 'ringing',
        channelName: 'call_CHANNEL',
        callerId: 'USER_UUID',
        calleeId: 'PEER_UUID',
        caller: {
          id: 'USER_UUID',
          username: 'alice',
          fullName: 'Alice',
          profilePicture: null,
          isVerified: false,
        },
        participants: [],
        appId: 'AGORA_APP_ID',
        startedAt: null,
        endedAt: null,
        createdAt: '2026-08-07T12:00:00.000Z',
      },
      caller: {
        id: 'USER_UUID',
        username: 'alice',
        fullName: 'Alice',
        profilePicture: null,
        isVerified: false,
      },
    },
    rooms: ['user:{invitee}'],
    notes:
      'Ring timeout (~30s) marks missed and emits call:end:ack { status:"missed", reason:"missed" }. Deep link / notification Accept uses call:accept with the same callId.',
  },
  [SOCKET_EVENT.CALL_ACCEPT]: {
    group: 'Calls',
    module: 'call',
    direction: 'c2s',
    comment:
      'Accept a ringing call or rejoin/join an ongoing group call. Server ends any other live call for this user first (supersede), then returns the session on call:join and notifies peers.',
    sample: { requestId: 'console-1', callId: 'CALL_UUID' },
    rooms: ['call:{id}'],
    notes:
      'Required: callId. Optional: requestId. Response event is call:join (not a separate accept:ack). On supersede, peers of the old call get call:end:ack with supersededBy + optional call:cancelled.',
  },
  [SOCKET_EVENT.CALL_JOIN]: {
    group: 'Calls',
    module: 'call',
    direction: 's2c',
    comment:
      'Accept/join result and peer fan-out. Emitted to the accepter as the ACK for call:accept, and to already-joined peers with a fresh Agora session when someone joins. Includes success/error and optional participantJoined.',
    sample: {
      requestId: 'console-1',
      success: true,
      data: {
        call: {
          id: 'CALL_UUID',
          status: 'ongoing',
          type: 'audio',
          conversationId: 'CONVERSATION_UUID',
          channelName: 'call_CHANNEL',
          callerId: 'USER_UUID',
          appId: 'AGORA_APP_ID',
        },
        token: 'AGORA_RTC_TOKEN',
        uid: 'AGORA_UID',
        appId: 'AGORA_APP_ID',
      },
      participantJoined: 'USER_UUID_JOINER',
    },
    rooms: ['user:{peer}', 'call:{id}'],
    notes:
      'Failure: { requestId, success:false, error:{ code:"ACCEPT_FAILED"|"UNAUTHORIZED"|"VALIDATION", message } }. Caller who pre-joined Agora should promote UI to active on success, not re-enter media twice.',
  },
  [SOCKET_EVENT.CALL_DECLINE]: {
    group: 'Calls',
    module: 'call',
    direction: 'c2s',
    comment:
      'Decline a ringing invite. Direct: ends the call as declined. Group: marks only this participant declined; call continues while others are still ringing or joined. Use reason:"busy" when auto-declining because you cannot take the call.',
    sample: {
      requestId: 'console-1',
      callId: 'CALL_UUID',
      reason: 'declined',
    },
    notes:
      'reason optional: "busy" | omit/"declined". Server always emits call:declined. call:rejected / call:busy / call:end:ack only when callEnded:true (1:1 or last remaining group invitee). Partial group decline must NOT tear down Calling… UI for others.',
  },
  [SOCKET_EVENT.CALL_DECLINED]: {
    group: 'Calls',
    module: 'call',
    direction: 's2c',
    comment:
      'Broadcast that a participant declined. Listeners should check callEnded: if false (typical group), refresh roster / keep outgoing or active UI; if true, hang up and show Call declined / User is busy from reason.',
    sample: {
      requestId: 'console-1',
      callId: 'CALL_UUID',
      by: 'USER_UUID',
      callEnded: false,
      reason: 'declined',
      call: { id: 'CALL_UUID', status: 'ringing' },
    },
    rooms: ['user:{participant}'],
    notes:
      'reason: "busy" | "declined". Emitted to the decliner and to notifyUuids. Group: by !== me → stay connected; by === me → close own incoming UI only.',
  },
  [SOCKET_EVENT.CALL_REJECTED]: {
    group: 'Calls',
    module: 'call',
    direction: 's2c',
    comment:
      'Caller-facing explicit reject. Emitted only when the decline actually ended the call (direct decline, or group with no invitees left ringing). Show "Call declined" and clear outgoing UI.',
    sample: {
      callId: 'CALL_UUID',
      by: 'USER_UUID',
      callEnded: true,
      reason: 'rejected',
      call: { id: 'CALL_UUID', status: 'declined' },
    },
    rooms: ['user:{caller}'],
    notes:
      'Do not emit/handle as call-ending on partial group declines. Often paired with call:declined and call:end:ack.',
  },
  [SOCKET_EVENT.CALL_CANCELLED]: {
    group: 'Calls',
    module: 'call',
    direction: 's2c',
    comment:
      'Call was cancelled before pickup: caller hung up while status was ringing, or a ringing call was superseded when the user Accepted another call. Callee should hide the incoming screen without treating it as a reject toast when they are the one switching.',
    sample: {
      callId: 'CALL_UUID',
      by: 'USER_UUID',
      status: 'cancelled',
      reason: 'cancelled',
      supersededBy: 'OTHER_CALL_UUID',
    },
    rooms: ['user:{participant}'],
    notes:
      'DB status becomes cancelled (not missed). missed is reserved for ring timeout. supersededBy present → peer left for another call.',
  },
  [SOCKET_EVENT.CALL_BUSY]: {
    group: 'Calls',
    module: 'call',
    direction: 's2c',
    comment:
      'Caller-facing busy signal when a decline used reason busy and the call ended. Show "User is busy". Same shape as declined/rejected; only sent when callEnded:true.',
    sample: {
      callId: 'CALL_UUID',
      by: 'USER_UUID',
      callEnded: true,
      reason: 'busy',
      call: { id: 'CALL_UUID', status: 'declined' },
    },
    rooms: ['user:{caller}'],
    notes:
      'Also mirrored on call:declined with reason:"busy" and call:end:ack reason:"busy". create may return BUSY on create:ack for hard conflicts.',
  },
  [SOCKET_EVENT.CALL_LEAVE]: {
    group: 'Calls',
    module: 'call',
    direction: 'c2s',
    comment:
      'Leave the call. Direct conversations: leave === end for everyone. Group: marks this user left; if zero joined remain, call becomes ended (or missed if still ringing). Use on page refresh/unload for group; use call:end for intentional hangup of a 1:1.',
    sample: { requestId: 'console-1', callId: 'CALL_UUID' },
    rooms: ['call:{id}'],
    notes:
      'REST fallback: POST /api/v1/calls/:callId/leave (keepalive on unload). Peers get call:participant:left; call:end:ack only if callEnded.',
  },
  [SOCKET_EVENT.CALL_LEAVE_ACK]: {
    group: 'Calls',
    module: 'call',
    direction: 's2c',
    comment:
      'Ack to the leaving socket for call:leave. Includes whether the whole call ended.',
    sample: {
      requestId: 'console-1',
      callId: 'CALL_UUID',
      status: 'ongoing',
      callEnded: false,
      userId: 'USER_UUID',
    },
    notes:
      'If callEnded:true, server also emits call:end:ack to remaining participants.',
  },
  [SOCKET_EVENT.CALL_END]: {
    group: 'Calls',
    module: 'call',
    direction: 'c2s',
    comment:
      'End the call for all participants. If the call is still ringing and the actor is the caller, status becomes cancelled (caller hung up before pickup). Otherwise status becomes ended. Prefer for 1:1 hangup and caller cancel.',
    sample: { requestId: 'console-1', callId: 'CALL_UUID' },
    rooms: ['call:{id}'],
    notes:
      'REST fallback: POST /api/v1/calls/:callId/end (keepalive). Server replies with call:end:ack (reason cancelled|ended) and may also emit call:cancelled.',
  },
  [SOCKET_EVENT.CALL_END_ACK]: {
    group: 'Calls',
    module: 'call',
    direction: 's2c',
    comment:
      'Authoritative call-finished (or miss) signal. Tear down media/UI when this call is your current callId. Check reason for toast copy. Do not treat partial group leaves as end — those use participant:left with callEnded:false only.',
    sample: {
      requestId: 'console-1',
      callId: 'CALL_UUID',
      status: 'ended',
      reason: 'ended',
      callEnded: true,
    },
    rooms: ['user:{participant}'],
    notes:
      'reason values: cancelled | rejected | busy | missed | ended. Optional: supersededBy (peer took another call), disconnected (socket drop hangup). Ring timeout: { callId, status:"missed", reason:"missed" }.',
  },
  [SOCKET_EVENT.CALL_PARTICIPANT_JOINED]: {
    group: 'Calls',
    module: 'call',
    direction: 's2c',
    comment:
      'A participant joined (accept). Sent to still-ringing invitees and watchers so Join/Rejoin banners and rosters update. May include the updated call DTO.',
    sample: {
      callId: 'CALL_UUID',
      userId: 'USER_UUID',
      call: {
        id: 'CALL_UUID',
        status: 'ongoing',
        conversationId: 'CONVERSATION_UUID',
        type: 'audio',
      },
    },
    rooms: ['user:{ringing|watcher}'],
    notes:
      'Joined peers usually get call:join with a full Agora session instead of only this event.',
  },
  [SOCKET_EVENT.CALL_PARTICIPANT_LEFT]: {
    group: 'Calls',
    module: 'call',
    direction: 's2c',
    comment:
      'A participant left. If callEnded is false, the group call is still live — keep the calling/in-call popup open and update roster only. If callEnded is true, hang up locally.',
    sample: {
      callId: 'CALL_UUID',
      userId: 'USER_UUID',
      callEnded: false,
      status: 'ongoing',
    },
    rooms: ['user:{participant}'],
    notes:
      'Emitted on leave, disconnect hangup, and REST hangup fan-out. Never treat callEnded:false as a full refresh/rejoin for remaining members.',
  },

  // ─── Social / block ──────────────────────────────────
  [SOCKET_EVENT.USER_BLOCKED]: {
    group: 'Social',
    module: 'social',
    direction: 's2c',
    comment:
      'You blocked someone — update chat UI (Unblock / Delete). Emitted ONLY to the blocker room; the blocked user never receives this.',
    sample: {
      actorId: 'USER_UUID_A',
      targetId: 'USER_UUID_B',
      blocked: true,
      conversationId: 'CONVERSATION_UUID_OR_NULL',
      isPeerBlocked: true,
    },
    rooms: ['user:{actor}'],
  },
  [SOCKET_EVENT.USER_UNBLOCKED]: {
    group: 'Social',
    module: 'social',
    direction: 's2c',
    comment:
      'You unblocked someone — emitted ONLY to the unblocker. Blocked party is never told.',
    sample: {
      actorId: 'USER_UUID_A',
      targetId: 'USER_UUID_B',
      blocked: false,
      conversationId: 'CONVERSATION_UUID_OR_NULL',
      isPeerBlocked: false,
    },
    rooms: ['user:{actor}'],
  },

  // Profile rooms
  [SOCKET_EVENT.PROFILE_JOIN]: {
    group: 'Social',
    module: 'social',
    direction: 'c2s',
    comment:
      'Join profile:{userId} while viewing a profile grid (create/delete posts).',
    sample: { userId: 'USER_UUID_HERE' },
    rooms: ['profile:{userId}'],
  },
  [SOCKET_EVENT.PROFILE_LEAVE]: {
    group: 'Social',
    module: 'social',
    direction: 'c2s',
    comment: 'Leave profile room when leaving the grid.',
    sample: { userId: 'USER_UUID_HERE' },
  },

  // Feed posts
  [SOCKET_EVENT.FEED_POST_JOIN]: {
    group: 'Social',
    module: 'social',
    direction: 'c2s',
    comment:
      'Join post:{postId} for live likes/comments/stats (and comment:* events).',
    sample: { postId: 'POST_UUID_HERE' },
    rooms: ['post:{postId}'],
  },
  [SOCKET_EVENT.FEED_POST_LEAVE]: {
    group: 'Social',
    module: 'social',
    direction: 'c2s',
    comment: 'Leave post room.',
    sample: { postId: 'POST_UUID_HERE' },
  },
  [SOCKET_EVENT.FEED_POST_CREATED]: {
    group: 'Social',
    module: 'social',
    direction: 's2c',
    comment:
      'New root post. Rooms: profile:{author} + user rooms (author + ≤200 followers).',
    sample: {
      postId: 'POST_UUID',
      authorId: 'USER_UUID',
      privacy: 'public',
      createdAt: new Date().toISOString(),
    },
    rooms: ['profile:{authorId}', 'user:{follower}'],
    notes: 'Driven by publishSocialRealtime post.created after REST create.',
  },
  [SOCKET_EVENT.FEED_POST_DELETED]: {
    group: 'Social',
    module: 'social',
    direction: 's2c',
    comment: 'Post soft-deleted — remove from feed / grid.',
    sample: { postId: 'POST_UUID', authorId: 'USER_UUID' },
    rooms: ['profile:{authorId}', 'post:{postId}', 'user:{follower}'],
  },
  [SOCKET_EVENT.FEED_POST_UPDATED]: {
    group: 'Social',
    module: 'social',
    direction: 's2c',
    comment:
      'Stats or meta change. kind=stats → post room; kind=meta also profile room. stats uses likeCount, commentCount, …',
    sample: {
      postId: 'POST_UUID',
      authorId: 'USER_UUID',
      kind: 'stats',
      stats: { likeCount: 12, commentCount: 3 },
    },
    rooms: ['post:{postId}', 'profile:{authorId} (meta)'],
  },

  // Feed comments
  [SOCKET_EVENT.FEED_COMMENT_CREATED]: {
    group: 'Social',
    module: 'social',
    direction: 's2c',
    comment:
      'New comment on a post. Emitted to post:{id}. Also bumps feed:post:updated commentCount.',
    sample: {
      contentType: 'post',
      contentId: 'POST_UUID',
      contentAuthorId: 'USER_UUID',
      postId: 'POST_UUID',
      commentCount: 4,
      comment: sampleComment,
    },
    rooms: ['post:{postId}'],
    notes: 'Join feed:post:join before expecting live comments.',
  },
  [SOCKET_EVENT.FEED_COMMENT_DELETED]: {
    group: 'Social',
    module: 'social',
    direction: 's2c',
    comment:
      'Comment deleted (replies cascade for top-level). Includes new commentCount.',
    sample: {
      contentType: 'post',
      contentId: 'POST_UUID',
      contentAuthorId: 'USER_UUID',
      postId: 'POST_UUID',
      commentId: 'COMMENT_UUID',
      parentId: null,
      commentCount: 3,
    },
    rooms: ['post:{postId}'],
  },
  [SOCKET_EVENT.FEED_COMMENT_UPDATED]: {
    group: 'Social',
    module: 'social',
    direction: 's2c',
    comment: 'Comment like count (or repliesCount) updated.',
    sample: {
      contentType: 'post',
      contentId: 'POST_UUID',
      contentAuthorId: 'USER_UUID',
      postId: 'POST_UUID',
      commentId: 'COMMENT_UUID',
      kind: 'stats',
      stats: { likeCount: 5 },
    },
    rooms: ['post:{postId}'],
  },

  // Vibes
  [SOCKET_EVENT.VIBE_JOIN]: {
    group: 'Social',
    module: 'social',
    direction: 'c2s',
    comment: 'Join vibe:{vibeId} for live stats + comment events.',
    sample: { vibeId: 'VIBE_UUID_HERE' },
    rooms: ['vibe:{vibeId}'],
  },
  [SOCKET_EVENT.VIBE_LEAVE]: {
    group: 'Social',
    module: 'social',
    direction: 'c2s',
    comment: 'Leave vibe room.',
    sample: { vibeId: 'VIBE_UUID_HERE' },
  },
  [SOCKET_EVENT.VIBE_CREATED]: {
    group: 'Social',
    module: 'social',
    direction: 's2c',
    comment:
      'Root vibe: profile + ≤200 followers. Child reply: vibe:{parentId} only (includes `reply` row + parent `repliesCount`).',
    sample: {
      vibeId: 'VIBE_UUID',
      authorId: 'USER_UUID',
      privacy: 'public',
      createdAt: new Date().toISOString(),
      parentId: null,
    },
    rooms: ['profile:{authorId}', 'user:{follower}', 'vibe:{parentId}'],
  },
  [SOCKET_EVENT.VIBE_DELETED]: {
    group: 'Social',
    module: 'social',
    direction: 's2c',
    comment:
      'Vibe deleted. Replies also emit to vibe:{parentId} so open thread sheets can remove the row.',
    sample: { vibeId: 'VIBE_UUID', authorId: 'USER_UUID', parentId: null },
    rooms: ['profile:{authorId}', 'vibe:{vibeId}', 'vibe:{parentId}', 'user:{follower}'],
  },
  [SOCKET_EVENT.VIBE_UPDATED]: {
    group: 'Social',
    module: 'social',
    direction: 's2c',
    comment:
      'Vibe stats/meta (likes, comments, poll votesCount). Child reply create can also update parent room.',
    sample: {
      vibeId: 'VIBE_UUID',
      authorId: 'USER_UUID',
      kind: 'stats',
      stats: { likeCount: 2, votesCount: 10 },
    },
    rooms: ['vibe:{vibeId}'],
  },
  [SOCKET_EVENT.VIBE_COMMENT_CREATED]: {
    group: 'Social',
    module: 'social',
    direction: 's2c',
    comment: 'New comment on a vibe (vibe room). Mirrors feed comment shape.',
    sample: {
      contentType: 'vibe',
      contentId: 'VIBE_UUID',
      contentAuthorId: 'USER_UUID',
      vibeId: 'VIBE_UUID',
      commentCount: 2,
      comment: sampleComment,
    },
    rooms: ['vibe:{vibeId}'],
  },
  [SOCKET_EVENT.VIBE_COMMENT_DELETED]: {
    group: 'Social',
    module: 'social',
    direction: 's2c',
    comment: 'Vibe comment deleted.',
    sample: {
      contentType: 'vibe',
      contentId: 'VIBE_UUID',
      contentAuthorId: 'USER_UUID',
      vibeId: 'VIBE_UUID',
      commentId: 'COMMENT_UUID',
      parentId: null,
      commentCount: 1,
    },
    rooms: ['vibe:{vibeId}'],
  },
  [SOCKET_EVENT.VIBE_COMMENT_UPDATED]: {
    group: 'Social',
    module: 'social',
    direction: 's2c',
    comment: 'Vibe comment like stats updated.',
    sample: {
      contentType: 'vibe',
      contentId: 'VIBE_UUID',
      contentAuthorId: 'USER_UUID',
      vibeId: 'VIBE_UUID',
      commentId: 'COMMENT_UUID',
      kind: 'stats',
      stats: { likeCount: 3 },
    },
    rooms: ['vibe:{vibeId}'],
  },

  // Follow
  [SOCKET_EVENT.FOLLOW_CHANGED]: {
    group: 'Social',
    module: 'social',
    direction: 's2c',
    comment:
      'Follow edge transition. status: requested | following | none. Includes live actor/target counts. Always both user rooms.',
    sample: {
      actorId: 'USER_UUID_ACTOR',
      targetId: 'USER_UUID_TARGET',
      status: 'following',
      direction: 'outbound',
      actorCounts: { followerCount: 10, followingCount: 42 },
      targetCounts: { followerCount: 120, followingCount: 8 },
    },
    rooms: ['user:{actorId}', 'user:{targetId}'],
    notes:
      'REST follow/unfollow/approve/reject/removeFollower/publish via publishSocialRealtime(follow.changed).',
  },

  // ─── Notifications ──────────────────────────────────────
  [SOCKET_EVENT.NOTIFY_NEW]: {
    group: 'Notifications',
    module: 'notify',
    direction: 's2c',
    comment:
      'New in-app notification (like, comment, follow request, …). Fan-out via notify bridge — independent of social sockets.',
    sample: {
      id: 'NOTIFICATION_UUID',
      type: 'like',
      title: 'New like',
      body: 'Alice liked your post',
      entityType: 'post',
      entityId: 'POST_UUID',
    },
    rooms: ['user:{recipient}'],
  },
  [SOCKET_EVENT.NOTIFY_ACK]: {
    group: 'Notifications',
    module: 'notify',
    direction: 'c2s',
    comment: 'Client ack that a notification was displayed / opened.',
    sample: { notificationId: 'NOTIFICATION_UUID' },
  },

  // ─── Media ──────────────────────────────────────────────
  [SOCKET_EVENT.MEDIA_THUMBNAIL_READY]: {
    group: 'Media',
    module: 'media',
    direction: 's2c',
    comment: 'Async media pipeline finished thumbnail / playback key.',
    sample: {
      mediaId: 'MEDIA_UUID',
      thumbnailUrl: 'https://…',
      isStreamAvailable: true,
    },
    rooms: ['user:{owner}'],
  },
};

const FALLBACK_META: Meta = {
  group: 'Other',
  module: 'system',
  direction: 'both',
  comment: 'Documented sample not customized — replace placeholders with real UUIDs.',
};

function sampleForEvent(name: string, meta: Meta): unknown {
  if (meta.sample !== undefined) return meta.sample;
  if (
    name.endsWith(':ack') ||
    meta.direction === 's2c' ||
    name.includes(':incoming')
  ) {
    return {
      note: 'Server→client (usually receive-only)',
      requestId: 'console-1',
    };
  }
  return { requestId: 'console-1' };
}

function roomDocs(): Record<string, string> {
  return {
    [SOCKET_ROOM.user('UUID')]: 'Personal inbox / notify / follow / home blasts',
    [SOCKET_ROOM.presence('UUID')]: 'Presence subscription for a user',
    [SOCKET_ROOM.conversation('UUID')]: 'Open chat thread',
    [SOCKET_ROOM.channel('UUID')]: 'Open channel',
    [SOCKET_ROOM.call('UUID')]: 'Active call participants',
    [SOCKET_ROOM.profile('UUID')]: 'Profile grid watchers',
    [SOCKET_ROOM.post('UUID')]: 'Post detail / open feed rows for stats + comments',
    [SOCKET_ROOM.vibe('UUID')]: 'Vibe detail / list rows for stats + comments',
  };
}

/** Build full catalog for `/console/events.json` — every SOCKET_EVENT entry. */
export function buildEventCatalog(): SocketEventCatalog {
  const events: SocketCatalogEvent[] = Object.entries(SOCKET_EVENT).map(
    ([key, name]) => {
      const meta = EVENT_META[name] ?? {
        ...FALLBACK_META,
        group: groupFallback(name),
        module: moduleFallback(name),
      };
      return {
        key,
        name,
        group: meta.group,
        module: meta.module,
        direction: meta.direction,
        comment: meta.comment,
        sample: sampleForEvent(name, meta),
        rooms: meta.rooms,
        notes: meta.notes,
      };
    },
  );

  // Sort by group module then event name (stable module order)
  const moduleOrder = MODULES.map((m) => m.id);
  events.sort((a, b) => {
    const mi = moduleOrder.indexOf(a.module as (typeof moduleOrder)[number]);
    const mj = moduleOrder.indexOf(b.module as (typeof moduleOrder)[number]);
    const oi = mi === -1 ? 99 : mi;
    const oj = mj === -1 ? 99 : mj;
    if (oi !== oj) return oi - oj;
    if (a.group !== b.group) return a.group.localeCompare(b.group);
    return a.name.localeCompare(b.name);
  });

  return {
    generatedAt: new Date().toISOString(),
    rooms: roomDocs(),
    modules: MODULES.map((m) => ({
      id: m.id,
      title: m.title,
      summary: m.summary,
    })),
    events,
    total: events.length,
  };
}

function groupFallback(name: string): string {
  const prefix = name.split(':')[0] ?? 'other';
  const map: Record<string, string> = {
    system: 'System',
    presence: 'Presence',
    chat: 'Chat',
    channel: 'Channel',
    call: 'Calls',
    notify: 'Notifications',
    media: 'Media',
    error: 'System',
    feed: 'Social',
    vibe: 'Social',
    follow: 'Social',
    profile: 'Social',
    user: 'Social',
  };
  return map[prefix] ?? 'Other';
}

function moduleFallback(name: string): string {
  const prefix = name.split(':')[0] ?? 'system';
  if (prefix === 'call') return 'call';
  if (prefix === 'error') return 'system';
  if (['feed', 'vibe', 'follow', 'profile', 'user'].includes(prefix)) {
    return 'social';
  }
  return prefix;
}

function loadConsoleHtml(): string {
  return readFileSync(CONSOLE_HTML_PATH, 'utf8');
}

export function tryServeSocketConsole(
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  const path = (req.url ?? '').split('?')[0];

  if (path === '/console' || path === '/console/') {
    try {
      const html = loadConsoleHtml();
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
        pragma: 'no-cache',
        expires: '0',
      });
      res.end(html);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'console html missing';
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`Socket console unavailable: ${message}`);
    }
    return true;
  }

  if (path === '/console/events.json') {
    const body = JSON.stringify(buildEventCatalog(), null, 2);
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(body);
    return true;
  }

  return false;
}
