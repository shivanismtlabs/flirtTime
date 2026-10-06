export type ConversationType = 'direct' | 'group';
export type ParticipantRole = 'admin' | 'member';

export interface ChatUserSummary {
  id: string;
  username: string;
  fullName: string | null;
  profilePicture: string | null;
  isVerified: boolean;
  /**
   * Presence (privacy-masked for viewer).
   * - `status === null` → hide presence UI entirely
   * - Case lastSeen=nobody + online=everyone: only online/offline
   */
  online: boolean | null;
  lastSeenAt: string | null;
  status: 'online' | 'offline' | null;
}

/** Default before privacy enrichment (hidden). */
export const EMPTY_CHAT_PRESENCE = {
  online: null,
  lastSeenAt: null,
  status: null,
} as const satisfies Pick<
  ChatUserSummary,
  'online' | 'lastSeenAt' | 'status'
>;

export interface ConversationMember extends ChatUserSummary {
  role: ParticipantRole;
  joinedAt: string;
}

export interface ConversationSettingsDto {
  isMuted: boolean;
  isPinned: boolean;
  isArchived: boolean;
  unreadCount: number;
  lastReadMessageId: string | null;
  lastDeliveredMessageId: string | null;
  labelText: string | null;
  labelColor: string | null;
}

export interface ConversationDto {
  id: string;
  type: ConversationType;
  title: string | null;
  avatarPath: string | null;
  participantsCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageType: string | null;
  /** Public user uuid of last message sender */
  lastMessageSenderId: string | null;
  /** Receipt for last message when viewer sent it (DMs) */
  lastMessageReceiptStatus: 'sent' | 'delivered' | 'read' | null;
  /** DM peer (other user); null for groups */
  peer: ChatUserSummary | null;
  /** Viewer blocked the DM peer — show only Unblock + Delete chat */
  isPeerBlocked: boolean;
  /**
   * When you blocked the peer: recommended UI actions (no composer).
   * Null when not blocked / group chat.
   */
  peerBlockActions: { unblock: true; deleteChat: true } | null;
  settings: ConversationSettingsDto;
  createdAt: string;
}

export interface ConversationDetail extends ConversationDto {
  members: ConversationMember[];
  myRole: ParticipantRole | null;
}

export interface ChatPollOptionSummary {
  id: string;
  text: string;
  votesCount: number;
  percent: number;
}

export interface ChatPollSummary {
  id: string;
  question: string;
  allowMultiple: boolean;
  isAnonymous: boolean;
  isClosed: boolean;
  closesAt: string | null;
  totalVotes: number;
  version: number;
  options: ChatPollOptionSummary[];
  myOptionIds: string[];
  /** Public user uuid of poll creator (message sender) */
  createdBy?: string | null;
}

export interface ChatPollVoter {
  id: string;
  username: string;
  fullName: string | null;
  profilePicture: string | null;
  isVerified: boolean;
  votedAt: string;
}

export type MessageReceiptStatus = 'sent' | 'delivered' | 'read';

/** One recipient's delivery/read state (WhatsApp Message info row). */
export interface MessageInfoRecipient {
  id: string;
  username: string;
  fullName: string | null;
  profilePicture: string | null;
  isVerified: boolean;
  status: MessageReceiptStatus;
  deliveredAt: string | null;
  readAt: string | null;
}

/**
 * WhatsApp-style message info for a message you sent.
 * 1:1 → one recipient; groups → each active member except the sender.
 */
export interface MessageInfo {
  messageId: string;
  conversationId: string;
  conversationType: ConversationType;
  /** Overall tick: sent | delivered | read */
  status: MessageReceiptStatus;
  sentAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  type: string;
  body: string | null;
  recipients: MessageInfoRecipient[];
}

export interface ChatMessageReplyPreview {
  id: string;
  body: string | null;
  senderId: string;
  type: string;
}

export interface ChatMessageMedia {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'voice' | 'file';
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
}

export interface ChatMessageLocation {
  lat: number;
  lng: number;
  address?: string | null;
}

/** Instagram-style shared post/reel card — frozen at send time in messages.meta */
export interface ChatSharedPost {
  postId: string;
  /** Original content type: post | reel | vibe */
  contentType: string;
  caption: string | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | null;
  author: {
    id: string;
    username: string;
    fullName: string | null;
    profilePicture: string | null;
    isVerified: boolean;
  };
}

/** Stable group-event codes for `type: 'system'` messages (i18n-friendly). */
export type ChatSystemEvent =
  | 'group_created'
  | 'member_added'
  | 'member_removed'
  | 'member_left'
  | 'title_changed'
  | 'avatar_changed'
  | 'role_changed';

/** Structured payload in messages.meta.system for group lifecycle lines. */
export interface ChatSystemMeta {
  event: ChatSystemEvent;
  /** Public user uuid who performed the action */
  actorId: string;
  /** Public user uuids affected (added / removed / role-changed) */
  targetIds?: string[];
  role?: ParticipantRole;
  oldTitle?: string | null;
  newTitle?: string | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  body: string | null;
  replyToId: string | null;
  replyTo?: ChatMessageReplyPreview | null;
  isEdited: boolean;
  editedAt?: string | null;
  isPinned?: boolean;
  isForwarded?: boolean;
  /** Present on own messages for ✓ / ✓✓ ticks */
  receiptStatus?: MessageReceiptStatus | null;
  createdAt: string;
  poll?: ChatPollSummary | null;
  medias?: ChatMessageMedia[];
  location?: ChatMessageLocation | null;
  /** Static shared post/reel preview (type === 'post') */
  sharedPost?: ChatSharedPost | null;
  /** Group system event (type === 'system') */
  system?: ChatSystemMeta | null;
  /** Aggregated emoji reactions */
  reactions?: ChatMessageReaction[];
  /** Viewer's active reaction emoji, if any */
  myReaction?: string | null;
  /** Viewer's saved translation for this message */
  translation?: ChatMessageTranslation | null;
  /** Client-generated id — used to replace optimistic rows */
  clientMessageId?: string | null;
}

/** One emoji bucket on a message */
export interface ChatMessageReaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface ChatMessageTranslation {
  text: string;
  language: string;
  sourceLanguage?: string | null;
}

export interface ReactMessageInput {
  emoji: string;
}

/** Bulk react 1–10 messages in one request. */
export interface ReactMessagesInput {
  messageIds: string[];
  emoji: string;
}

export interface TranslateMessageInput {
  targetLanguage: string;
}

/** Bulk translate 1–10 messages in one request. */
export interface TranslateMessagesInput {
  messageIds: string[];
  targetLanguage: string;
}

export interface CreateConversationInput {
  participantIds: string[];
  type?: ConversationType;
  title?: string;
  avatarPath?: string;
}

export interface UpdateConversationInput {
  title?: string | null;
  avatarPath?: string | null;
}

export interface ConversationSettingsInput {
  isMuted?: boolean;
  isPinned?: boolean;
  isArchived?: boolean;
  /** Empty string clears the label */
  labelText?: string | null;
  labelColor?: string | null;
}

export interface BulkArchiveConversationsInput {
  conversationIds: string[];
  archived: boolean;
}

export interface BulkArchiveSkipped {
  conversationId: string;
  reason: string;
}

export interface BulkArchiveResult {
  /** Successfully updated conversation public UUIDs */
  updated: string[];
  skipped: BulkArchiveSkipped[];
  archived: boolean;
}

export interface AddMembersInput {
  userIds: string[];
}

export interface UpdateMemberRoleInput {
  role: ParticipantRole;
}

export interface MarkReadInput {
  messageId?: string;
}

export interface SendPollInput {
  question: string;
  options: string[];
  allowMultiple?: boolean;
  isAnonymous?: boolean;
  closesAt?: string | null;
}

export interface SendLocationInput {
  lat: number;
  lng: number;
  address?: string | null;
}

export interface SendMessageInput {
  conversationId: string;
  body?: string;
  type?: 'text' | 'poll' | 'image' | 'video' | 'audio' | 'location' | 'post';
  poll?: SendPollInput;
  mediaIds?: string[];
  location?: SendLocationInput;
  /** Public post UUID when type is post */
  postId?: string;
  clientMessageId?: string;
  replyToId?: string;
  /**
   * When false, skip `FeedService.sharePost` after a shared-post send
   * (feed multi-share orchestrates its own per-recipient share rows).
   * Default true.
   */
  recordFeedShare?: boolean;
}

export interface EditMessageInput {
  body: string;
}

export interface DeleteMessageInput {
  scope: 'me' | 'everyone';
}

/** Bulk delete 1–10 messages in one request (same room thread typically). */
export interface DeleteMessagesInput {
  messageIds: string[];
  scope: 'me' | 'everyone';
}

export interface ForwardMessagesInput {
  messageIds: string[];
  targetConversationIds: string[];
}

export interface PinMessageInput {
  pinned: boolean;
}

export interface MarkDeliveredInput {
  messageId?: string;
}

export interface VotePollInput {
  optionIds: string[];
}

export interface ConversationsPage {
  rows: ConversationDto[];
  nextCursor: string | null;
  limit: number;
}

export interface MessagesPage {
  rows: ChatMessage[];
  nextCursor: string | null;
  limit: number;
}

export interface PollVotersPage {
  rows: ChatPollVoter[];
  nextCursor: string | null;
  limit: number;
}
