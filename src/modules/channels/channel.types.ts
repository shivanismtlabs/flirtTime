export type ChannelMemberRole = 'owner' | 'admin' | 'follower';

export type ChannelUserSummary = {
  id: string;
  username: string;
  fullName: string | null;
  profilePicture: string | null;
  isVerified: boolean;
};

export type ChannelMember = ChannelUserSummary & {
  role: ChannelMemberRole;
  joinedAt: string;
};

export type ChannelSettingsDto = {
  isMuted: boolean;
  isPinned: boolean;
  isArchived: boolean;
  lastReadMessageId: string | null;
  lastReadAt: string | null;
  unreadCount: number;
};

export type ChannelDto = {
  id: string;
  name: string;
  description: string | null;
  avatarPath: string | null;
  isPublic: boolean;
  inviteSlug: string;
  followersCount: number;
  adminsCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageType: string | null;
  lastMessageSenderId: string | null;
  settings: ChannelSettingsDto;
  myRole: ChannelMemberRole | null;
  createdAt: string;
};

export type ChannelDetail = ChannelDto & {
  members: ChannelMember[];
  myRole: ChannelMemberRole | null;
};

export type ChannelsPage = {
  rows: ChannelDto[];
  nextCursor: string | null;
  limit: number;
};

export type ChannelBrowseItem = {
  id: string;
  name: string;
  description: string | null;
  avatarPath: string | null;
  isPublic: boolean;
  inviteSlug: string;
  followersCount: number;
  isFollowing: boolean;
  createdAt: string;
};

export type ChannelBrowsePage = {
  rows: ChannelBrowseItem[];
  nextCursor: string | null;
  limit: number;
};

export type CreateChannelInput = {
  name: string;
  description?: string;
  avatarPath?: string;
  isPublic?: boolean;
  /** Optional custom invite slug; auto-generated when omitted */
  inviteSlug?: string;
  /** Initial followers (public user uuids). Creator becomes owner separately. */
  participantIds?: string[];
  /** Subset of participantIds promoted to admin */
  adminIds?: string[];
};

export type UpdateChannelInput = {
  name?: string;
  description?: string | null;
  avatarPath?: string | null;
  isPublic?: boolean;
  inviteSlug?: string;
};

export type ChannelMessageMedia = {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'voice' | 'file';
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
};

export type ChannelMessageReplyPreview = {
  id: string;
  body: string | null;
  senderId: string;
  type: string;
};

export type ChannelMessage = {
  id: string;
  channelId: string;
  senderId: string;
  type: string;
  body: string | null;
  replyToId: string | null;
  replyTo?: ChannelMessageReplyPreview | null;
  isEdited: boolean;
  editedAt: string | null;
  createdAt: string;
  medias?: ChannelMessageMedia[];
};

export type ChannelMessagesPage = {
  rows: ChannelMessage[];
  nextCursor: string | null;
  limit: number;
};

export type SendChannelMessageInput = {
  channelId: string;
  body?: string;
  type?: 'text' | 'image' | 'video';
  mediaIds?: string[];
  clientMessageId?: string;
  replyToId?: string;
};

export type EditChannelMessageInput = {
  body: string;
};

export type ChannelSettingsInput = {
  isMuted?: boolean;
  isPinned?: boolean;
  isArchived?: boolean;
};

export type DeleteChannelMessageInput = {
  scope: 'me' | 'everyone';
};

/** Bulk channel message delete: 1–10 ids, same scopes as single. */
export type DeleteChannelMessagesInput = {
  messageIds: string[];
  scope: 'me' | 'everyone';
};

export type MarkChannelReadInput = {
  messageId?: string;
};
