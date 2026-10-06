import { logger } from '../../shared/logger/index.js';
import { resolveConversationLiveState } from '../../shared/chat/index.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors/index.js';
import { translateHandler } from '../../shared/translate/index.js';
import { getRawPresenceMany } from '../../shared/presence/index.js';
import type {
  AddMembersInput,
  ChatMessage,
  ChatMessageTranslation,
  ChatPollSummary,
  ChatSharedPost,
  ChatSystemEvent,
  ChatSystemMeta,
  ChatUserSummary,
  ConversationDetail,
  ConversationDto,
  ConversationMember,
  ConversationSettingsDto,
  ConversationSettingsInput,
  ConversationsPage,
  CreateConversationInput,
  BulkArchiveConversationsInput,
  BulkArchiveResult,
  DeleteMessageInput,
  DeleteMessagesInput,
  EditMessageInput,
  ForwardMessagesInput,
  MarkDeliveredInput,
  MarkReadInput,
  MessageInfo,
  MessageInfoRecipient,
  MessageReceiptStatus,
  MessagesPage,
  PinMessageInput,
  PollVotersPage,
  ReactMessagesInput,
  SendMessageInput,
  TranslateMessagesInput,
  UpdateConversationInput,
  UpdateMemberRoleInput,
  VotePollInput,
} from './chat.types.js';
import { publishChatRealtime } from './chat.realtime.js';
import { ChatPushNotifier } from './chat-push.notifier.js';
import { ChatRepository } from './chat.repository.js';
import { FeedService } from '../feed/feed.service.js';
import type { FeedPost } from '../feed/feed.types.js';
import { PrivacyEnforcement } from '../setting/privacy-enforcement.js';
import { HIDDEN_PRESENCE } from '../setting/setting.types.js';
import { VibeService } from '../vibe/vibe.service.js';
import { FollowRepository } from '../follow/follow.repository.js';
import { UserService } from '../user/user.service.js';
import type {
  PeopleListFilters,
  PeopleListPage,
} from '../user/user.types.js';

function overallReceiptStatus(
  recipients: MessageInfoRecipient[],
): MessageReceiptStatus {
  if (!recipients.length) return 'sent';
  if (recipients.every((r) => r.status === 'read')) return 'read';
  if (recipients.every((r) => r.status === 'delivered' || r.status === 'read')) {
    return 'delivered';
  }
  return 'sent';
}

/** WhatsApp mutual lock: viewer with receipts off never sees `read`. */
function hideReadStatus<T extends MessageReceiptStatus | null | undefined>(
  status: T,
): T {
  return (status === 'read' ? 'delivered' : status) as T;
}

function hideReadOnConversation<T extends ConversationDto>(row: T): T {
  if (row.lastMessageReceiptStatus !== 'read') return row;
  return { ...row, lastMessageReceiptStatus: 'delivered' };
}

function hideReadOnMessage(message: ChatMessage): ChatMessage {
  if (message.receiptStatus !== 'read') return message;
  return { ...message, receiptStatus: 'delivered' };
}

function hideReadOnMessageInfo(info: MessageInfo): MessageInfo {
  const recipients = info.recipients.map((r) => ({
    ...r,
    status: hideReadStatus(r.status),
    readAt: null,
  }));
  return {
    ...info,
    recipients,
    status: hideReadStatus(info.status),
    readAt: null,
  };
}

function pickEarliestTimestamp(values: string[]): string | null {
  if (!values.length) return null;
  let earliest = values[0]!;
  for (const v of values) {
    if (v < earliest) earliest = v;
  }
  return earliest;
}

function formatNameList(names: string[]): string {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (!cleaned.length) return 'Someone';
  if (cleaned.length === 1) return cleaned[0]!;
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(', ')}, and ${cleaned[cleaned.length - 1]}`;
}

/**
 * Chat business logic. Realtime fan-out happens in the Socket app
 * via Redis pub/sub — this service remains HTTP/write-path focused.
 */
export class ChatService {
  private vibeService: VibeService | null = null;

  constructor(
    private readonly repo = new ChatRepository(),
    private readonly chatPush = new ChatPushNotifier(),
    private readonly feed = new FeedService(),
    private readonly privacy = new PrivacyEnforcement(),
    private readonly follows = new FollowRepository(),
    private readonly users = new UserService(),
  ) {}

  /** Lazy to avoid ChatService ↔ VibeService construct cycles. */
  private vibes(): VibeService {
    if (!this.vibeService) {
      this.vibeService = new VibeService();
    }
    return this.vibeService;
  }

  /**
   * People the actor may add when creating a group (or adding members).
   * Filters by allowGroupAdds privacy + blocks; optional conversationId excludes
   * users already in that group.
   * Response shape matches GET /users: `{ rows, total }`.
   */
  async listGroupCandidates(
    actorUuid: string,
    filters: PeopleListFilters,
    page: number,
    limit: number,
    conversationUuid?: string,
  ): Promise<PeopleListPage> {
    return this.users.listGroupCandidates(
      actorUuid,
      filters,
      page,
      limit,
      conversationUuid,
    );
  }

  /**
   * Attach privacy-masked presence to chat user rows for the viewer.
   * status=null → client hides online/last-seen UI.
   */
  private async withPresenceOnUsers<T extends ChatUserSummary>(
    viewerUuid: string,
    users: T[],
  ): Promise<T[]> {
    if (!users.length) return users;

    const uniqueUuids = [...new Set(users.map((u) => u.id).filter(Boolean))];
    if (!uniqueUuids.length) return users;

    const viewerId = await this.repo.findUserIdByUuid(viewerUuid);
    if (!viewerId) return users;

    const rawByUuid = await getRawPresenceMany(uniqueUuids);
    const idByUuid = new Map<string, string>();
    await Promise.all(
      uniqueUuids.map(async (uuid) => {
        const id = await this.follows.findUserIdByUuid(uuid);
        if (id) idByUuid.set(uuid, id);
      }),
    );

    const viewByUuid = new Map<
      string,
      {
        online: boolean | null;
        lastSeenAt: string | null;
        status: 'online' | 'offline' | null;
      }
    >();

    await Promise.all(
      uniqueUuids.map(async (uuid) => {
        const ownerId = idByUuid.get(uuid);
        const raw = rawByUuid.get(uuid) ?? {
          online: false,
          lastSeenAt: null,
        };
        if (!ownerId) {
          viewByUuid.set(uuid, { ...HIDDEN_PRESENCE });
          return;
        }
        const view = await this.privacy.resolvePresenceView(ownerId, viewerId, {
          online: raw.online,
          lastSeenAt: raw.lastSeenAt,
        });
        viewByUuid.set(uuid, view);
      }),
    );

    return users.map((u) => {
      const view = viewByUuid.get(u.id) ?? HIDDEN_PRESENCE;
      return {
        ...u,
        online: view.online,
        lastSeenAt: view.lastSeenAt,
        status: view.status,
      } as T;
    });
  }

  private async withPresenceOnConversation(
    viewerUuid: string,
    row: ConversationDto,
  ): Promise<ConversationDto> {
    if (!row.peer) return row;
    const [peer] = await this.withPresenceOnUsers(viewerUuid, [row.peer]);
    return { ...row, peer: peer ?? row.peer };
  }

  private async withPresenceOnDetail(
    viewerUuid: string,
    detail: ConversationDetail,
  ): Promise<ConversationDetail> {
    const members = await this.withPresenceOnUsers(viewerUuid, detail.members);
    let peer = detail.peer;
    if (peer) {
      const found = members.find((m) => m.id === peer!.id);
      if (found) {
        peer = {
          id: found.id,
          username: found.username,
          fullName: found.fullName,
          profilePicture: found.profilePicture,
          isVerified: found.isVerified,
          online: found.online,
          lastSeenAt: found.lastSeenAt,
          status: found.status,
        };
      } else {
        const [enriched] = await this.withPresenceOnUsers(viewerUuid, [peer]);
        peer = enriched ?? peer;
      }
    }
    const enriched = { ...detail, members, peer };
    const viewerUserId = await this.resolveUserId(viewerUuid);
    return this.hideReadReceiptsIfNeeded(viewerUserId, enriched);
  }

  private buildSharedPostSnapshot(post: FeedPost): ChatSharedPost {
    const first = post.media?.[0];
    const mediaType =
      first?.fileType === 'video'
        ? 'video'
        : first?.fileType === 'image'
          ? 'image'
          : null;
    return {
      postId: post.id,
      contentType: post.type || 'post',
      caption: post.caption ?? null,
      thumbnailUrl: first?.thumbnail || first?.url || null,
      mediaUrl: first?.url || null,
      mediaType,
      author: {
        id: post.user.id,
        username: post.user.username,
        fullName: post.user.fullName,
        profilePicture: post.user.profilePicture,
        isVerified: post.user.isVerified ?? false,
      },
    };
  }

  private async resolveUserId(uuid: string): Promise<string> {
    const id = await this.repo.findUserIdByUuid(uuid);
    if (!id) {
      throw new NotFoundError('User not found');
    }
    return id;
  }

  /**
   * Clear this user's unread. Blue ticks go out only when their read-receipts
   * privacy is on; otherwise the sender still gets delivered (double tick).
   * Recipients who disabled receipts are omitted from `message.seen` (mutual).
   */
  private async markConversationReadForUser(opts: {
    actorUuid: string;
    userId: string;
    conversationInternalId: string;
    conversationUuid: string;
    messageInternalId: string;
    publicMessageId: string | null;
  }): Promise<void> {
    const sendReceipts = await this.privacy.isReadReceiptsEnabled(opts.userId);
    if (sendReceipts) {
      await this.repo.markSeen(
        opts.conversationInternalId,
        opts.userId,
        opts.messageInternalId,
      );
      const participants = await this.repo.listParticipantUuids(
        opts.conversationInternalId,
      );
      await publishChatRealtime({
        type: 'message.seen',
        conversationId: opts.conversationUuid,
        readerId: opts.actorUuid,
        messageId: opts.publicMessageId,
        notifyUserIds: await this.notifySeenUserIds(
          participants,
          opts.actorUuid,
        ),
      });
      return;
    }

    await this.repo.clearUnreadOnly(
      opts.conversationInternalId,
      opts.userId,
      opts.messageInternalId,
    );
    await this.publishDelivered({
      conversationInternalId: opts.conversationInternalId,
      conversationUuid: opts.conversationUuid,
      delivererUuid: opts.actorUuid,
      messageUuid: opts.publicMessageId,
      alsoNotifyDeliverer: true,
    });
  }

  /**
   * Reader always gets `seen` (own unread). Other participants only if they
   * still have read receipts on — WhatsApp-style mutual lock.
   */
  private async notifySeenUserIds(
    participantUuids: string[],
    readerUuid: string,
  ): Promise<string[]> {
    const idByUuid = await this.repo.findUserIdsByUuids(participantUuids);
    const flags = await this.privacy.areReadReceiptsEnabled([
      ...idByUuid.values(),
    ]);
    return participantUuids.filter((uuid) => {
      if (uuid === readerUuid) return true;
      const id = idByUuid.get(uuid);
      if (!id) return false;
      return flags.get(id) !== false;
    });
  }

  private async hideReadReceiptsIfNeeded<T extends ConversationDto>(
    viewerUserId: string,
    row: T,
  ): Promise<T> {
    if (row.lastMessageReceiptStatus !== 'read') return row;
    if (await this.privacy.isReadReceiptsEnabled(viewerUserId)) return row;
    return hideReadOnConversation(row);
  }

  private async hideReadReceiptsOnList<T extends ConversationDto>(
    viewerUserId: string,
    rows: T[],
  ): Promise<T[]> {
    if (!rows.some((r) => r.lastMessageReceiptStatus === 'read')) return rows;
    if (await this.privacy.isReadReceiptsEnabled(viewerUserId)) return rows;
    return rows.map(hideReadOnConversation);
  }

  private async publishDelivered(opts: {
    conversationInternalId: string;
    conversationUuid: string;
    delivererUuid: string;
    messageUuid: string | null;
    alsoNotifyDeliverer?: boolean;
  }): Promise<void> {
    const participants = await this.repo.listParticipantUuids(
      opts.conversationInternalId,
    );
    const notifyUserIds = opts.alsoNotifyDeliverer
      ? participants
      : participants.filter((id) => id !== opts.delivererUuid);
    await publishChatRealtime({
      type: 'message.delivered',
      conversationId: opts.conversationUuid,
      delivererId: opts.delivererUuid,
      messageId: opts.messageUuid,
      notifyUserIds,
    });
  }

  /**
   * After a message is stored: focused thread → read; socket-online → delivered.
   * Never throws — send must not fail on receipt side-effects.
   */
  private async applyLiveReceipts(input: {
    conversationInternalId: string;
    conversationUuid: string;
    messageInternalId: string;
    messageUuid: string;
    recipientUuids: string[];
  }): Promise<void> {
    const recipients = input.recipientUuids.filter(Boolean);
    if (!recipients.length) return;

    try {
      const [idByUuid, live] = await Promise.all([
        this.repo.findUserIdsByUuids(recipients),
        resolveConversationLiveState(input.conversationUuid, recipients),
      ]);

      await Promise.all(
        recipients.map(async (uuid) => {
          const recipientUserId = idByUuid.get(uuid);
          if (!recipientUserId) return;
          try {
            if (live.viewing.has(uuid)) {
              await this.markConversationReadForUser({
                actorUuid: uuid,
                userId: recipientUserId,
                conversationInternalId: input.conversationInternalId,
                conversationUuid: input.conversationUuid,
                messageInternalId: input.messageInternalId,
                publicMessageId: input.messageUuid,
              });
              return;
            }
            if (!live.online.has(uuid)) return;
            const updated = await this.repo.markDelivered(
              input.conversationInternalId,
              recipientUserId,
              input.messageInternalId,
            );
            if (!updated) return;
            await this.publishDelivered({
              conversationInternalId: input.conversationInternalId,
              conversationUuid: input.conversationUuid,
              delivererUuid: uuid,
              messageUuid: input.messageUuid,
            });
          } catch {
            // best-effort per recipient
          }
        }),
      );
    } catch {
      // never fail send on receipt errors
    }
  }

  private async attachLiveReceiptStatus(
    mapped: ChatMessage,
    conversationInternalId: string,
    viewerUserId: string,
    messageInternalId: string,
  ): Promise<void> {
    const cursors = await this.repo.getPeerReceiptCursors(
      conversationInternalId,
      viewerUserId,
    );
    const msgId = BigInt(messageInternalId);
    if (cursors.readId != null && cursors.readId >= msgId) {
      const canSeeRead =
        await this.privacy.isReadReceiptsEnabled(viewerUserId);
      mapped.receiptStatus = canSeeRead ? 'read' : 'delivered';
    } else if (cursors.deliveredId != null && cursors.deliveredId >= msgId) {
      mapped.receiptStatus = 'delivered';
    }
  }

  /** Socket + receipts + FCM after the send HTTP/socket ack already returned. */
  private async fanOutNewMessage(input: {
    conversationInternalId: string;
    conversationUuid: string;
    messageInternalId: string;
    mapped: ChatMessage;
    actorUuid: string;
  }): Promise<void> {
    const participants = await this.repo.listParticipantUuids(
      input.conversationInternalId,
    );
    const notifyUserIds = participants.filter((id) => id !== input.actorUuid);
    await this.applyLiveReceipts({
      conversationInternalId: input.conversationInternalId,
      conversationUuid: input.conversationUuid,
      messageInternalId: input.messageInternalId,
      messageUuid: input.mapped.id,
      recipientUuids: notifyUserIds,
    });
    const unreadByUserId = notifyUserIds.length
      ? await this.repo.listUnreadCountsByUserUuids(
          input.conversationInternalId,
          notifyUserIds,
        )
      : undefined;
    await publishChatRealtime({
      type: 'message.created',
      conversationId: input.conversationUuid,
      message: input.mapped,
      notifyUserIds,
      unreadByUserId,
    });
    void this.chatPush
      .notifyNewMessage({
        conversationInternalId: input.conversationInternalId,
        recipientUuids: notifyUserIds,
        message: input.mapped,
        senderUuid: input.actorUuid,
      })
      .catch(() => {
        // never fail send on push errors
      });
  }

  private async requireParticipant(conversationId: string, userId: string) {
    if (await this.repo.isParticipant(conversationId, userId)) {
      return;
    }

    // 1:1 only: self-heal if actor is one of the two users on direct_key.
    // Groups stay strict (leave/remove deactivates deliberately).
    const type = await this.repo.findConversationTypeById(conversationId);
    if (type === 'direct') {
      const key = await this.repo.findDirectKeyById(conversationId);
      const healed = await this.repo.ensureDirectParticipantIfOnKey(
        conversationId,
        userId,
        key,
      );
      if (healed) return;
    }

    throw new ForbiddenError('Not a conversation participant');
  }

  /**
   * Socket / room guards: actor must be an active conversation participant.
   * Uses public UUIDs (same as JWT `sub` + conversation id).
   * Direct chats self-heal via requireParticipant (see above).
   */
  async assertConversationParticipant(
    actorUuid: string,
    conversationUuid: string,
  ): Promise<void> {
    const userId = await this.resolveUserId(actorUuid);
    const conversationId =
      await this.repo.findConversationIdByUuid(conversationUuid);
    if (!conversationId) {
      throw new NotFoundError('Conversation not found');
    }
    await this.requireParticipant(conversationId, userId);
  }

  /**
   * True when this actor is in a direct chat with an active block either way.
   * Used to silence typing indicators so the blocked user can't detect the block,
   * and the blocker doesn't see presence leaks from the blocked user.
   */
  async shouldSilenceDirectPresence(
    actorUuid: string,
    conversationUuid: string,
  ): Promise<boolean> {
    const userId = await this.repo.findUserIdByUuid(actorUuid);
    if (!userId) return false;
    const conversationId =
      await this.repo.findConversationIdByUuid(conversationUuid);
    if (!conversationId) return false;
    const peerId = await this.repo.findDirectPeerUserId(
      conversationId,
      userId,
    );
    if (!peerId) return false;
    return this.repo.hasActiveBlockBetween(userId, peerId);
  }

  private async requireAdmin(conversationId: string, userId: string) {
    const role = await this.repo.getParticipantRole(conversationId, userId);
    if (role !== 'admin') {
      throw new ForbiddenError('Admin access required');
    }
  }

  /**
   * Persist a group system line and fan out as a normal chat message.
   * Clients render `type === 'system'` (use `system.event` for i18n; `body` as fallback).
   */
  private async createSystemMessage(input: {
    conversationId: string;
    conversationUuid: string;
    senderId: string;
    event: ChatSystemEvent;
    actorUuid: string;
    body: string;
    targetIds?: string[];
    role?: ChatSystemMeta['role'];
    oldTitle?: string | null;
    newTitle?: string | null;
    /** Extra public uuids to notify even if no longer active (e.g. removed user) */
    extraNotifyUuids?: string[];
  }): Promise<ChatMessage | null> {
    try {
      const system: ChatSystemMeta = {
        event: input.event,
        actorId: input.actorUuid,
        ...(input.targetIds?.length ? { targetIds: input.targetIds } : {}),
        ...(input.role ? { role: input.role } : {}),
        ...(input.oldTitle !== undefined ? { oldTitle: input.oldTitle } : {}),
        ...(input.newTitle !== undefined ? { newTitle: input.newTitle } : {}),
      };

      const saved = await this.repo.saveMessage({
        conversationId: input.conversationId,
        senderId: input.senderId,
        body: input.body,
        type: 'system',
        meta: { system },
        advanceSenderRead: await this.privacy.isReadReceiptsEnabled(
          input.senderId,
        ),
      });
      const mapped = await this.repo.mapSavedMessage(saved);
      const participants = await this.repo.listParticipantUuids(
        input.conversationId,
      );
      const notifySet = new Set([
        ...participants,
        ...(input.extraNotifyUuids ?? []),
      ]);
      const conversationUuid = mapped.conversationId || input.conversationUuid;
      const notifyUserIds = [...notifySet];
      const recipients = notifyUserIds.filter((id) => id !== input.actorUuid);
      await this.applyLiveReceipts({
        conversationInternalId: input.conversationId,
        conversationUuid,
        messageInternalId: String(saved.id),
        messageUuid: mapped.id,
        recipientUuids: recipients,
      });
      const unreadByUserId = notifyUserIds.length
        ? await this.repo.listUnreadCountsByUserUuids(
            input.conversationId,
            notifyUserIds,
          )
        : undefined;
      await publishChatRealtime({
        type: 'message.created',
        conversationId: conversationUuid,
        message: mapped,
        notifyUserIds,
        unreadByUserId,
      });
      return mapped;
    } catch {
      // System lines are best-effort; membership change already committed
      return null;
    }
  }

  private async labelUsers(userIds: string[]): Promise<string[]> {
    const labels = await this.repo.findUserDisplayLabelsByIds(userIds);
    return userIds.map((id) => labels.get(id) ?? 'Someone');
  }

  async createConversation(
    actorUuid: string,
    input: CreateConversationInput,
  ): Promise<ConversationDetail> {
    const creatorId = await this.resolveUserId(actorUuid);
    const uuidMap = await this.repo.findUserIdsByUuids(input.participantIds);
    if (uuidMap.size !== new Set(input.participantIds).size) {
      throw new NotFoundError('One or more participants not found');
    }
    const participantIds = [...uuidMap.values()].filter((id) => id !== creatorId);

    const type = input.type ?? 'direct';
    if (type === 'direct' && participantIds.length !== 1) {
      throw new ValidationError('Direct chat needs exactly one other participant');
    }
    if (type === 'group') {
      if (!input.title?.trim()) {
        throw new ValidationError('title is required for group conversations');
      }
      if (participantIds.length < 1) {
        throw new ValidationError('Group needs at least one other participant');
      }
    }

    if (type === 'direct' && participantIds.length === 1) {
      const peerId = participantIds[0]!;
      // Allow conversation create while blocked; sendMessage uses shadow-send
      // when the peer blocked the creator so messages never deliver to them.
      const existing = await this.repo.findDirectConversationUuidBetween(
        creatorId,
        peerId,
      );
      if (!existing) {
        const flags = await this.repo.getActiveDirectBlockFlags(
          creatorId,
          peerId,
        );
        // Skip privacy gate only when messaging is already "allowed via shadow"
        // or mutual acquaintance exists; first contact still respects privacy
        // unless either side has an active block (cannot start new outreach).
        if (!flags.aBlockedB && !flags.bBlockedA) {
          await this.privacy.assertCanStartDirectMessage(creatorId, peerId);
        }
      }
    }

    if (type === 'group') {
      for (const peerId of participantIds) {
        await this.privacy.assertCanAddToGroup(creatorId, peerId);
      }
    }

    const conversationUuid = await this.repo.createConversation({
      creatorId,
      participantIds,
      type,
      title: input.title,
      avatarPath: input.avatarPath,
    });

    if (type === 'group') {
      const meta = await this.repo.findConversationMeta(conversationUuid);
      if (meta) {
        const [creatorLabel, memberLabels] = await Promise.all([
          this.labelUsers([creatorId]),
          this.labelUsers(participantIds),
        ]);
        const creatorName = creatorLabel[0] ?? 'Someone';
        const membersText = formatNameList(memberLabels);
        const body =
          participantIds.length > 0
            ? `${creatorName} created the group and added ${membersText}`
            : `${creatorName} created the group`;
        const targetUuids = input.participantIds.filter((id) => id !== actorUuid);
        await this.createSystemMessage({
          conversationId: meta.id,
          conversationUuid,
          senderId: creatorId,
          event: 'group_created',
          actorUuid,
          body,
          targetIds: targetUuids.length ? targetUuids : undefined,
          newTitle: input.title?.trim() ?? null,
        });
      }
    }

    const detail = await this.repo.getConversationDetail(conversationUuid, creatorId);
    if (!detail) {
      throw new NotFoundError('Conversation not found after create');
    }
    return this.withPresenceOnDetail(actorUuid, detail);
  }

  async listConversations(
    actorUuid: string,
    opts: { limit: number; cursor?: string; archived?: boolean },
  ): Promise<ConversationsPage> {
    const userId = await this.resolveUserId(actorUuid);
    const result = await this.repo.listConversations(
      userId,
      opts.limit,
      opts.cursor,
      opts.archived ?? false,
    );
    const rows = await Promise.all(
      result.rows.map((row) => this.withPresenceOnConversation(actorUuid, row)),
    );
    return {
      rows: await this.hideReadReceiptsOnList(userId, rows),
      nextCursor: result.nextCursor,
      limit: opts.limit,
    };
  }

  async getConversation(
    actorUuid: string,
    conversationUuid: string,
  ): Promise<ConversationDetail> {
    const userId = await this.resolveUserId(actorUuid);
    const detail = await this.repo.getConversationDetail(conversationUuid, userId);
    if (!detail) {
      throw new NotFoundError('Conversation not found');
    }
    return this.withPresenceOnDetail(actorUuid, detail);
  }

  async updateConversation(
    actorUuid: string,
    conversationUuid: string,
    input: UpdateConversationInput,
  ): Promise<ConversationDetail> {
    const userId = await this.resolveUserId(actorUuid);
    const meta = await this.repo.findConversationMeta(conversationUuid);
    if (!meta) {
      throw new NotFoundError('Conversation not found');
    }
    if (meta.type !== 'group') {
      throw new ValidationError('Only group conversations can be updated');
    }
    await this.requireAdmin(meta.id, userId);

    if (input.title === undefined && input.avatarPath === undefined) {
      throw new ValidationError('At least one field is required');
    }
    if (input.title !== undefined && input.title !== null) {
      const title = input.title.trim();
      if (!title) {
        throw new ValidationError('title cannot be empty');
      }
      input = { ...input, title };
    }

    const oldTitle = meta.title;
    const titleChanged =
      input.title !== undefined && input.title !== oldTitle;
    const avatarChanged = input.avatarPath !== undefined;

    const ok = await this.repo.updateConversation(meta.id, input);
    if (!ok) {
      throw new NotFoundError('Conversation not found');
    }

    const detail = await this.repo.getConversationDetail(conversationUuid, userId);
    if (!detail) {
      throw new NotFoundError('Conversation not found');
    }

    const participantUuids = await this.repo.listParticipantUuids(meta.id);
    await publishChatRealtime({
      type: 'conversation.updated',
      conversationId: conversationUuid,
      actorId: actorUuid,
      conversation: {
        id: detail.id,
        type: detail.type,
        title: detail.title,
        avatarPath: detail.avatarPath,
        participantsCount: detail.participantsCount,
      },
      notifyUserIds: participantUuids.length ? participantUuids : [actorUuid],
    });

    const [actorLabel] = await this.labelUsers([userId]);
    const actorName = actorLabel ?? 'Someone';

    if (titleChanged) {
      const newTitle = detail.title?.trim() || input.title || 'group';
      await this.createSystemMessage({
        conversationId: meta.id,
        conversationUuid,
        senderId: userId,
        event: 'title_changed',
        actorUuid,
        body: `${actorName} changed the group name to "${newTitle}"`,
        oldTitle,
        newTitle: detail.title,
      });
    }
    if (avatarChanged) {
      await this.createSystemMessage({
        conversationId: meta.id,
        conversationUuid,
        senderId: userId,
        event: 'avatar_changed',
        actorUuid,
        body: `${actorName} changed the group photo`,
      });
    }

    return this.withPresenceOnDetail(actorUuid, detail);
  }

  async updateSettings(
    actorUuid: string,
    conversationUuid: string,
    input: ConversationSettingsInput,
    opts?: { silentRealtime?: boolean },
  ): Promise<{ conversationId: string; settings: ConversationSettingsDto }> {
    const userId = await this.resolveUserId(actorUuid);
    const meta = await this.repo.findConversationMeta(conversationUuid);
    if (!meta) {
      throw new NotFoundError('Conversation not found');
    }
    await this.requireParticipant(meta.id, userId);

    const settings = await this.repo.updateSettings(meta.id, userId, input);
    if (!settings) {
      throw new NotFoundError('Conversation settings not found');
    }

    // Personal settings only — actor devices (multi-tab / multi-device)
    if (
      !opts?.silentRealtime &&
      (input.isArchived !== undefined ||
        input.isMuted !== undefined ||
        input.isPinned !== undefined)
    ) {
      void publishChatRealtime({
        type: 'conversation.settings',
        conversationId: conversationUuid,
        conversationIds: [conversationUuid],
        actorId: actorUuid,
        settings: {
          isArchived: input.isArchived,
          isMuted: input.isMuted,
          isPinned: input.isPinned,
        },
        notifyUserIds: [actorUuid],
      });
    }

    return { conversationId: conversationUuid, settings };
  }

  /**
   * Archive / unarchive 1–50 conversations for the actor only (partial success).
   * Realtime: one `conversation.settings` + inbox refresh to actor devices.
   */
  async archiveConversations(
    actorUuid: string,
    input: BulkArchiveConversationsInput,
  ): Promise<BulkArchiveResult> {
    const unique = [
      ...new Set(
        (input.conversationIds ?? []).map((id) => id.trim()).filter(Boolean),
      ),
    ];
    if (!unique.length) {
      throw new ValidationError('conversationIds must include at least one id');
    }
    if (unique.length > 50) {
      throw new ValidationError('conversationIds max is 50');
    }

    const archived = Boolean(input.archived);
    const updated: string[] = [];
    const skipped: BulkArchiveResult['skipped'] = [];

    for (const conversationId of unique) {
      try {
        await this.updateSettings(
          actorUuid,
          conversationId,
          { isArchived: archived },
          { silentRealtime: true },
        );
        updated.push(conversationId);
      } catch (err) {
        skipped.push({
          conversationId,
          reason:
            err instanceof Error
              ? err.message
              : 'Could not update archive state',
        });
      }
    }

    if (updated.length) {
      await publishChatRealtime({
        type: 'conversation.settings',
        conversationId: updated[0]!,
        conversationIds: updated,
        actorId: actorUuid,
        settings: { isArchived: archived },
        notifyUserIds: [actorUuid],
      });
    }

    return { updated, skipped, archived };
  }

  async listMembers(
    actorUuid: string,
    conversationUuid: string,
  ): Promise<ConversationMember[]> {
    const userId = await this.resolveUserId(actorUuid);
    const meta = await this.repo.findConversationMeta(conversationUuid);
    if (!meta) {
      throw new NotFoundError('Conversation not found');
    }
    await this.requireParticipant(meta.id, userId);
    const members = await this.repo.listMembers(meta.id);
    return this.withPresenceOnUsers(actorUuid, members);
  }

  async addMembers(
    actorUuid: string,
    conversationUuid: string,
    input: AddMembersInput,
  ): Promise<ConversationDetail> {
    const userId = await this.resolveUserId(actorUuid);
    const meta = await this.repo.findConversationMeta(conversationUuid);
    if (!meta) {
      throw new NotFoundError('Conversation not found');
    }
    if (meta.type !== 'group') {
      throw new ValidationError('Members can only be added to group conversations');
    }
    await this.requireAdmin(meta.id, userId);

    const uuidMap = await this.repo.findUserIdsByUuids(input.userIds);
    if (uuidMap.size !== new Set(input.userIds).size) {
      throw new NotFoundError('One or more users not found');
    }
    const internalIds = [...uuidMap.values()].filter((id) => id !== userId);
    if (!internalIds.length) {
      throw new ValidationError('No new members to add');
    }
    for (const peerId of internalIds) {
      await this.privacy.assertCanAddToGroup(userId, peerId);
    }
    const actuallyAddedIds = await this.repo.addMembers(meta.id, internalIds);

    if (actuallyAddedIds.length) {
      const addedIdSet = new Set(actuallyAddedIds);
      const addedUuids = [...uuidMap.entries()]
        .filter(([, id]) => addedIdSet.has(id))
        .map(([uuid]) => uuid);

      const [actorLabels, targetLabels] = await Promise.all([
        this.labelUsers([userId]),
        this.labelUsers(actuallyAddedIds),
      ]);
      const actorName = actorLabels[0] ?? 'Someone';
      const targetsText = formatNameList(targetLabels);
      await this.createSystemMessage({
        conversationId: meta.id,
        conversationUuid,
        senderId: userId,
        event: 'member_added',
        actorUuid,
        body: `${actorName} added ${targetsText}`,
        targetIds: addedUuids,
      });
    }

    const detail = await this.repo.getConversationDetail(conversationUuid, userId);
    if (!detail) {
      throw new NotFoundError('Conversation not found');
    }
    return this.withPresenceOnDetail(actorUuid, detail);
  }

  async removeMember(
    actorUuid: string,
    conversationUuid: string,
    targetUserUuid: string,
  ): Promise<void> {
    const actorId = await this.resolveUserId(actorUuid);
    const meta = await this.repo.findConversationMeta(conversationUuid);
    if (!meta) {
      throw new NotFoundError('Conversation not found');
    }
    if (meta.type === 'direct') {
      throw new ValidationError(
        'Cannot remove members from a direct conversation. Delete the conversation instead.',
      );
    }

    const targetId = await this.resolveUserId(targetUserUuid);
    const isSelf = actorId === targetId;

    if (!isSelf) {
      await this.requireAdmin(meta.id, actorId);
    } else {
      await this.requireParticipant(meta.id, actorId);
    }

    const targetRole = await this.repo.getParticipantRole(meta.id, targetId);
    if (!targetRole) {
      throw new NotFoundError('Member not found');
    }

    if (targetRole === 'admin') {
      const adminCount = await this.repo.countActiveAdmins(meta.id);
      if (adminCount <= 1) {
        throw new ValidationError('Cannot remove the last admin');
      }
    }

    // System line first while target is still a participant — otherwise
    // saveMessage would clear their settings.deleted_at and re-show inbox.
    const labels = await this.labelUsers(
      isSelf ? [actorId] : [actorId, targetId],
    );
    if (isSelf) {
      const actorName = labels[0] ?? 'Someone';
      await this.createSystemMessage({
        conversationId: meta.id,
        conversationUuid,
        senderId: actorId,
        event: 'member_left',
        actorUuid,
        body: `${actorName} left the group`,
        targetIds: [actorUuid],
      });
    } else {
      const actorName = labels[0] ?? 'Someone';
      const targetName = labels[1] ?? 'Someone';
      await this.createSystemMessage({
        conversationId: meta.id,
        conversationUuid,
        senderId: actorId,
        event: 'member_removed',
        actorUuid,
        body: `${actorName} removed ${targetName}`,
        targetIds: [targetUserUuid],
      });
    }

    const ok = await this.repo.removeMember(meta.id, targetId);
    if (!ok) {
      throw new NotFoundError('Member not found');
    }
  }

  /**
   * Delete from conversation list.
   * - `me`: hide chat + history for actor only (other side keeps the thread).
   * - `everyone`: permanently destroy conversation + messages for all participants.
   */
  async deleteConversation(
    actorUuid: string,
    conversationUuid: string,
    scope: 'me' | 'everyone' = 'me',
  ): Promise<void> {
    const actorId = await this.resolveUserId(actorUuid);
    const meta = await this.repo.findConversationMeta(conversationUuid);
    if (!meta) {
      throw new NotFoundError('Conversation not found');
    }
    await this.requireParticipant(meta.id, actorId);

    if (scope === 'me') {
      const hidden = await this.repo.hideConversationForUser(meta.id, actorId);
      if (!hidden) {
        throw new NotFoundError('Conversation not found');
      }
      await publishChatRealtime({
        type: 'conversation.deleted',
        conversationId: conversationUuid,
        actorId: actorUuid,
        scope: 'me',
        notifyUserIds: [actorUuid],
      });
      return;
    }

    // Delete for everyone is only for 1:1 chats — not groups.
    if (meta.type !== 'direct') {
      throw new ValidationError(
        'Delete for everyone is only available for direct chats',
      );
    }

    const { participantUuids, destroyed } = await this.repo.destroyConversation(
      meta.id,
    );
    if (!destroyed) {
      throw new NotFoundError('Conversation not found');
    }

    await publishChatRealtime({
      type: 'conversation.deleted',
      conversationId: conversationUuid,
      actorId: actorUuid,
      scope: 'everyone',
      notifyUserIds: participantUuids.length
        ? participantUuids
        : [actorUuid],
    });
  }

  async updateMemberRole(
    actorUuid: string,
    conversationUuid: string,
    targetUserUuid: string,
    input: UpdateMemberRoleInput,
  ): Promise<ConversationMember[]> {
    const actorId = await this.resolveUserId(actorUuid);
    const meta = await this.repo.findConversationMeta(conversationUuid);
    if (!meta) {
      throw new NotFoundError('Conversation not found');
    }
    if (meta.type !== 'group') {
      throw new ValidationError('Roles only apply to group conversations');
    }
    await this.requireAdmin(meta.id, actorId);

    const targetId = await this.resolveUserId(targetUserUuid);
    const targetRole = await this.repo.getParticipantRole(meta.id, targetId);
    if (!targetRole) {
      throw new NotFoundError('Member not found');
    }

    if (targetRole === 'admin' && input.role === 'member') {
      const adminCount = await this.repo.countActiveAdmins(meta.id);
      if (adminCount <= 1) {
        throw new ValidationError('Cannot demote the last admin');
      }
    }

    if (targetRole === input.role) {
      const members = await this.repo.listMembers(meta.id);
      return this.withPresenceOnUsers(actorUuid, members);
    }

    const ok = await this.repo.updateMemberRole(meta.id, targetId, input.role);
    if (!ok) {
      throw new NotFoundError('Member not found');
    }

    const [actorLabels, targetLabels] = await Promise.all([
      this.labelUsers([actorId]),
      this.labelUsers([targetId]),
    ]);
    const actorName = actorLabels[0] ?? 'Someone';
    const targetName = targetLabels[0] ?? 'Someone';
    const body =
      input.role === 'admin'
        ? `${actorName} made ${targetName} an admin`
        : `${actorName} removed ${targetName} as admin`;
    await this.createSystemMessage({
      conversationId: meta.id,
      conversationUuid,
      senderId: actorId,
      event: 'role_changed',
      actorUuid,
      body,
      targetIds: [targetUserUuid],
      role: input.role,
    });

    const members = await this.repo.listMembers(meta.id);
    return this.withPresenceOnUsers(actorUuid, members);
  }

  async markRead(
    actorUuid: string,
    conversationUuid: string,
    input: MarkReadInput,
  ): Promise<{ conversationId: string; unreadCount: number }> {
    const userId = await this.resolveUserId(actorUuid);
    const meta = await this.repo.findConversationMeta(conversationUuid);
    if (!meta) {
      throw new NotFoundError('Conversation not found');
    }
    await this.requireParticipant(meta.id, userId);

    let messageId: string | null = null;
    if (input.messageId) {
      messageId = await this.repo.findMessageInternalId(meta.id, input.messageId);
      if (!messageId) {
        throw new NotFoundError('Message not found');
      }
      const hidden = await this.repo.isMessageHiddenForUser(
        meta.id,
        messageId,
        userId,
      );
      if (hidden) {
        messageId = await this.repo.findLatestVisibleMessageId(
          meta.id,
          userId,
        );
      }
    } else {
      messageId = await this.repo.findLatestVisibleMessageId(meta.id, userId);
    }

    if (messageId) {
      const publicMessageId =
        (await this.repo.findMessageUuidById(messageId)) ??
        input.messageId ??
        null;
      await this.markConversationReadForUser({
        actorUuid,
        userId,
        conversationInternalId: meta.id,
        conversationUuid,
        messageInternalId: messageId,
        publicMessageId,
      });
    }

    return { conversationId: conversationUuid, unreadCount: 0 };
  }

  /**
   * WhatsApp Message info — delivery/read times for a message you sent.
   * Uses per-participant delivered/read cursors (no per-message status table).
   */
  async getMessageInfo(
    actorUuid: string,
    messageUuid: string,
  ): Promise<MessageInfo> {
    const actorId = await this.resolveUserId(actorUuid);
    const ctx = await this.repo.findMessageInfoContext(messageUuid);
    if (!ctx) {
      throw new NotFoundError('Message not found');
    }

    await this.requireParticipant(ctx.conversationInternalId, actorId);

    if (String(ctx.senderInternalId) !== String(actorId)) {
      throw new ForbiddenError(
        'Only the sender can view message info for this message',
      );
    }

    // Shadow / delete-for-me on recipients: always single-tick message info
    const hiddenFromRecipients = await this.repo.isMessageHiddenFromAnyRecipient(
      ctx.conversationInternalId,
      ctx.messageInternalId,
      ctx.senderInternalId,
    );
    if (hiddenFromRecipients) {
      return {
        messageId: ctx.messageUuid,
        conversationId: ctx.conversationUuid,
        conversationType: ctx.conversationType,
        status: 'sent',
        sentAt: ctx.sentAt,
        deliveredAt: null,
        readAt: null,
        type: ctx.type,
        body: ctx.body,
        recipients: (
          await this.repo.listRecipientReceipts(
            ctx.conversationInternalId,
            ctx.senderInternalId,
          )
        ).map((p) => ({
          id: p.userUuid,
          username: p.username,
          fullName: p.fullName,
          profilePicture: p.profilePicture,
          isVerified: p.isVerified,
          status: 'sent' as MessageReceiptStatus,
          deliveredAt: null,
          readAt: null,
        })),
      };
    }

    const messageId = BigInt(ctx.messageInternalId);
    const peers = await this.repo.listRecipientReceipts(
      ctx.conversationInternalId,
      ctx.senderInternalId,
    );

    const receiptFlags = await this.privacy.areReadReceiptsEnabled(
      peers.map((p) => p.userId),
    );

    const recipients: MessageInfoRecipient[] = peers.map((p) => {
      const deliveredId =
        p.lastDeliveredMessageId != null
          ? BigInt(p.lastDeliveredMessageId)
          : null;
      const readId =
        p.lastReadMessageId != null ? BigInt(p.lastReadMessageId) : null;
      const receiptsOn = receiptFlags.get(p.userId) !== false;

      const delivered =
        deliveredId != null && deliveredId >= messageId;
      const read =
        receiptsOn && readId != null && readId >= messageId;

      let status: MessageReceiptStatus = 'sent';
      if (read) status = 'read';
      else if (delivered) status = 'delivered';

      return {
        id: p.userUuid,
        username: p.username,
        fullName: p.fullName,
        profilePicture: p.profilePicture,
        isVerified: p.isVerified,
        status,
        deliveredAt: delivered ? p.lastDeliveredAt : null,
        readAt: read ? p.lastReadAt : null,
      };
    });

    const overall = overallReceiptStatus(recipients);
    const deliveredAt = pickEarliestTimestamp(
      recipients
        .filter((r) => r.deliveredAt)
        .map((r) => r.deliveredAt as string),
    );
    const readAt = pickEarliestTimestamp(
      recipients.filter((r) => r.readAt).map((r) => r.readAt as string),
    );

    // DM: overall delivered/read only when the peer reached this message
    // Group same via all-must-reach for overall status times
    const allDelivered =
      recipients.length > 0 &&
      recipients.every((r) => r.status === 'delivered' || r.status === 'read');
    const allRead =
      recipients.length > 0 && recipients.every((r) => r.status === 'read');

    const info: MessageInfo = {
      messageId: ctx.messageUuid,
      conversationId: ctx.conversationUuid,
      conversationType: ctx.conversationType,
      status: overall,
      sentAt: ctx.sentAt,
      deliveredAt: allDelivered || allRead ? deliveredAt : null,
      readAt: allRead ? readAt : null,
      type: ctx.type,
      body: ctx.body,
      recipients,
    };
    if (await this.privacy.isReadReceiptsEnabled(actorId)) return info;
    return hideReadOnMessageInfo(info);
  }

  async markUnread(
    actorUuid: string,
    conversationUuid: string,
  ): Promise<{ conversationId: string; unreadCount: number }> {
    const userId = await this.resolveUserId(actorUuid);
    const meta = await this.repo.findConversationMeta(conversationUuid);
    if (!meta) {
      throw new NotFoundError('Conversation not found');
    }
    await this.requireParticipant(meta.id, userId);
    const unreadCount = await this.repo.markUnread(meta.id, userId);
    return { conversationId: conversationUuid, unreadCount };
  }

  async sendMessage(actorUuid: string, input: SendMessageInput): Promise<ChatMessage> {
    const userId = await this.resolveUserId(actorUuid);
    const conversationId = await this.repo.findConversationIdByUuid(input.conversationId);
    if (!conversationId) {
      throw new NotFoundError('Conversation not found');
    }

    await this.requireParticipant(conversationId, userId);

    /**
     * Block rules (A blocked B):
     * - A (blocker): cannot send — Unblock / Delete chat only
     * - B (blocked): can send; A never receives (shadow / single-tick forever)
     */
    const peerId = await this.repo.findDirectPeerUserId(conversationId, userId);
    let isShadow = false;
    let hideFromPeerId: string | null = null;
    if (peerId) {
      const flags = await this.repo.getActiveDirectBlockFlags(userId, peerId);
      if (flags.aBlockedB) {
        throw new ForbiddenError(
          'You blocked this user. Unblock to send messages.',
        );
      }
      if (flags.bBlockedA) {
        // Peer blocked me → permanent hide for peer, single tick for me
        isShadow = true;
        hideFromPeerId = peerId;
      }
    }

    const isPoll = input.type === 'poll' || Boolean(input.poll);
    const isMedia =
      input.type === 'image' ||
      input.type === 'video' ||
      input.type === 'audio' ||
      Boolean(input.mediaIds?.length);
    const isLocation = input.type === 'location' || Boolean(input.location);
    const isSharedPost = input.type === 'post' || Boolean(input.postId);

    if (isPoll) {
      if (!input.poll) {
        throw new ValidationError('poll is required when type is poll');
      }
      const options = input.poll.options.map((o) => o.trim()).filter(Boolean);
      if (options.length < 2 || options.length > 12) {
        throw new ValidationError('Poll needs 2–12 options');
      }
    } else if (isMedia) {
      if (!input.mediaIds?.length) {
        throw new ValidationError('mediaIds is required for media messages');
      }
    } else if (isLocation) {
      if (!input.location) {
        throw new ValidationError('location is required when type is location');
      }
      const { lat, lng } = input.location;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new ValidationError('Invalid location coordinates');
      }
    } else if (isSharedPost) {
      if (!input.postId) {
        throw new ValidationError('postId is required when type is post');
      }
    } else if (!input.body?.trim()) {
      throw new ValidationError('body is required');
    }

    const mediaType =
      input.type === 'video'
        ? 'video'
        : input.type === 'audio'
          ? 'audio'
          : 'image';

    let sharedPost: ChatSharedPost | undefined;
    if (isSharedPost && input.postId) {
      const post = await this.feed.getPost(input.postId, actorUuid);
      sharedPost = this.buildSharedPostSnapshot(post);
    }

    try {
      const message = await this.repo.saveMessage({
        conversationId,
        senderId: userId,
        body: input.body?.trim() ?? '',
        type: isPoll
          ? 'poll'
          : isLocation
            ? 'location'
            : isSharedPost
              ? 'post'
              : isMedia
                ? mediaType
                : 'text',
        poll: isPoll ? input.poll : undefined,
        mediaIds: isMedia ? input.mediaIds : undefined,
        location: isLocation ? input.location : undefined,
        sharedPost,
        clientMessageId: input.clientMessageId,
        replyToId: input.replyToId,
        advanceSenderRead: await this.privacy.isReadReceiptsEnabled(userId),
        ...(isShadow ? { hideFromUserIds: [hideFromPeerId!] } : {}),
      });

      const mapped = await this.repo.mapSavedMessage(message, {
        conversationUuid: input.conversationId,
        senderUuid: actorUuid,
        skipPin: true,
      });

      // Return as soon as the row is stored. Socket/push/receipts are
      // best-effort — awaiting them made every send wait on live-state HTTP.
      if (!isShadow) {
        void this.fanOutNewMessage({
          conversationInternalId: conversationId,
          conversationUuid: mapped.conversationId,
          messageInternalId: String(message.id),
          mapped,
          actorUuid,
        }).catch((err) => {
          logger.warn({ err, conversationId: mapped.conversationId }, 'chat fan-out failed');
        });
      }

      // DM share → record share + notify owner (skip when feed/vibe multi-share owns it)
      // Also skip share side-effects for shadow sends (recipient never receives)
      if (
        !isShadow &&
        isSharedPost &&
        input.postId &&
        input.recordFeedShare !== false
      ) {
        const contentType = sharedPost?.contentType ?? 'post';
        const recordShare =
          contentType === 'vibe'
            ? this.vibes().shareVibe(input.postId, actorUuid, { channel: 'dm' })
            : this.feed.sharePost(input.postId, actorUuid, { channel: 'dm' });
        void recordShare.catch(() => {
          // message already sent; share/notify is best-effort
        });
      }

      return mapped;
    } catch (err) {
      if (err instanceof Error && err.message === 'MEDIA_INVALID') {
        throw new ValidationError('One or more media items are invalid');
      }
      throw err;
    }
  }

  /**
   * Ensure a direct conversation with `recipientUuid` and send a shared-post card.
   * Does not record feed share / owner notification (`recordFeedShare: false`).
   */
  async sharePostToUser(
    actorUuid: string,
    recipientUuid: string,
    postId: string,
  ): Promise<ChatMessage> {
    if (actorUuid === recipientUuid) {
      throw new ValidationError('Cannot share a post to yourself');
    }
    const conversation = await this.createConversation(actorUuid, {
      type: 'direct',
      participantIds: [recipientUuid],
    });
    return this.sendMessage(actorUuid, {
      conversationId: conversation.id,
      type: 'post',
      postId,
      recordFeedShare: false,
    });
  }

  async votePoll(
    actorUuid: string,
    pollUuid: string,
    input: VotePollInput,
  ): Promise<ChatPollSummary> {
    const userId = await this.resolveUserId(actorUuid);
    const meta = await this.repo.getPollSummaryByUuid(pollUuid, userId);
    if (!meta) {
      throw new NotFoundError(
        'Poll not found. Use the poll id from message.poll.id (not the message id).',
      );
    }
    await this.requireParticipant(meta.conversationId, userId);

    try {
      return await this.repo.votePoll({
        pollUuid,
        userId,
        optionUuids: input.optionIds,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'POLL_NOT_FOUND') {
        throw new NotFoundError(
          'Poll not found. Use the poll id from message.poll.id (not the message id).',
        );
      }
      if (code === 'POLL_CLOSED') {
        throw new ValidationError('This poll is closed and no longer accepts votes');
      }
      if (code === 'POLL_OPTION_INVALID') {
        throw new ValidationError(
          'Invalid poll option. Use option ids from message.poll.options[].id',
        );
      }
      if (code === 'POLL_SINGLE_ONLY') {
        throw new ValidationError('This poll allows only one option');
      }
      throw err;
    }
  }

  async closePoll(actorUuid: string, pollUuid: string): Promise<ChatPollSummary> {
    const userId = await this.resolveUserId(actorUuid);
    const meta = await this.repo.getPollSummaryByUuid(pollUuid, userId);
    if (!meta) {
      throw new NotFoundError(
        'Poll not found. Use the poll id from message.poll.id (not the message id).',
      );
    }
    await this.requireParticipant(meta.conversationId, userId);

    try {
      return await this.repo.closePoll({ pollUuid, userId });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'POLL_NOT_FOUND') {
        throw new NotFoundError(
          'Poll not found. Use the poll id from message.poll.id (not the message id).',
        );
      }
      if (code === 'POLL_FORBIDDEN') {
        throw new ForbiddenError('Only the creator or an admin can close this poll');
      }
      throw err;
    }
  }

  async listPollVoters(
    actorUuid: string,
    pollUuid: string,
    optionUuid: string,
    opts: { limit: number; cursor?: string },
  ): Promise<PollVotersPage> {
    const userId = await this.resolveUserId(actorUuid);
    const meta = await this.repo.getPollSummaryByUuid(pollUuid, userId);
    if (!meta) {
      throw new NotFoundError(
        'Poll not found. Use the poll id from message.poll.id (not the message id).',
      );
    }
    await this.requireParticipant(meta.conversationId, userId);

    try {
      const result = await this.repo.listPollVoters({
        pollUuid,
        optionUuid,
        limit: opts.limit,
        cursor: opts.cursor,
      });
      return { ...result, limit: opts.limit };
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'POLL_NOT_FOUND') {
        throw new NotFoundError(
          'Poll not found. Use the poll id from message.poll.id (not the message id).',
        );
      }
      if (code === 'POLL_ANONYMOUS') {
        throw new ForbiddenError('Voter list is not available for anonymous polls');
      }
      if (code === 'POLL_OPTION_INVALID') {
        throw new ValidationError(
          'Invalid poll option. Use option ids from message.poll.options[].id',
        );
      }
      throw err;
    }
  }

  async listMessages(
    actorUuid: string,
    conversationUuid: string,
    opts: { limit: number; cursor?: string },
  ): Promise<MessagesPage> {
    const userId = await this.resolveUserId(actorUuid);
    const conversationId = await this.repo.findConversationIdByUuid(conversationUuid);
    if (!conversationId) {
      throw new NotFoundError('Conversation not found');
    }

    await this.requireParticipant(conversationId, userId);

    const result = await this.repo.listMessages(
      conversationId,
      userId,
      opts.limit,
      opts.cursor,
    );

    // Advance delivered cursor so senders can show ✓✓ (peer device online).
    // Only visible messages — never advance over shadow-hidden rows.
    if (!opts.cursor) {
      const latest = await this.repo.findLatestVisibleMessageId(
        conversationId,
        userId,
      );
      if (latest) {
        const updated = await this.repo.markDelivered(
          conversationId,
          userId,
          latest,
        );
        if (updated) {
          const messageUuid = await this.repo.findMessageUuidById(latest);
          await this.publishDelivered({
            conversationInternalId: conversationId,
            conversationUuid,
            delivererUuid: actorUuid,
            messageUuid,
          });
        }
      }
    }

    const canSeeRead = await this.privacy.isReadReceiptsEnabled(userId);
    return {
      rows: canSeeRead ? result.rows : result.rows.map(hideReadOnMessage),
      nextCursor: result.nextCursor,
      limit: opts.limit,
    };
  }

  async markDelivered(
    actorUuid: string,
    conversationUuid: string,
    input: MarkDeliveredInput,
  ): Promise<{ conversationId: string }> {
    const userId = await this.resolveUserId(actorUuid);
    const meta = await this.repo.findConversationMeta(conversationUuid);
    if (!meta) {
      throw new NotFoundError('Conversation not found');
    }
    await this.requireParticipant(meta.id, userId);

    let messageId: string | null = null;
    let messageUuid: string | null = input.messageId ?? null;
    if (input.messageId) {
      messageId = await this.repo.findMessageInternalId(meta.id, input.messageId);
      if (!messageId) throw new NotFoundError('Message not found');
      // Ignore delivery advances for messages permanently hidden to this user
      const hidden = await this.repo.isMessageHiddenForUser(
        meta.id,
        messageId,
        userId,
      );
      if (hidden) {
        return { conversationId: conversationUuid };
      }
    } else {
      messageId = await this.repo.findLatestVisibleMessageId(meta.id, userId);
      if (messageId) {
        messageUuid = await this.repo.findMessageUuidById(messageId);
      }
    }
    if (messageId) {
      const updated = await this.repo.markDelivered(meta.id, userId, messageId);
      if (updated) {
        await this.publishDelivered({
          conversationInternalId: meta.id,
          conversationUuid,
          delivererUuid: actorUuid,
          messageUuid,
        });
      }
    }
    return { conversationId: conversationUuid };
  }

  /** When the app/socket comes online, advance delivered on pending inbox chats. */
  async syncInboxDelivered(
    actorUuid: string,
  ): Promise<{ updated: number }> {
    const userId = await this.resolveUserId(actorUuid);
    const pending = await this.repo.listPendingDeliverySync(userId);
    let updated = 0;
    for (const item of pending) {
      const changed = await this.repo.markDelivered(
        item.conversationId,
        userId,
        item.messageId,
      );
      if (!changed) continue;
      updated += 1;
      await this.publishDelivered({
        conversationInternalId: item.conversationId,
        conversationUuid: item.conversationUuid,
        delivererUuid: actorUuid,
        messageUuid: item.messageUuid,
      });
    }
    return { updated };
  }

  async editMessage(
    actorUuid: string,
    messageUuid: string,
    input: EditMessageInput,
  ): Promise<ChatMessage> {
    const userId = await this.resolveUserId(actorUuid);
    const row = await this.repo.findMessageRowByUuid(messageUuid);
    if (!row || row.isDeleted) {
      throw new NotFoundError('Message not found');
    }
    await this.requireParticipant(row.conversationId, userId);
    if (row.senderId !== userId) {
      throw new ForbiddenError('Only the sender can edit this message');
    }
    if (row.type !== 'text') {
      throw new ValidationError('Only text messages can be edited');
    }
    const body = input.body.trim();
    if (!body) throw new ValidationError('body is required');

    const updated = await this.repo.editMessage({
      conversationId: row.conversationId,
      messageId: row.id,
      senderId: userId,
      body,
    });
    if (!updated) throw new NotFoundError('Message not found');
    await publishChatRealtime({
      type: 'message.edited',
      conversationId: updated.conversationId,
      message: updated,
    });
    return updated;
  }

  async deleteMessage(
    actorUuid: string,
    messageUuid: string,
    input: DeleteMessageInput,
  ): Promise<{ ids: string[]; scope: 'me' | 'everyone' }> {
    return this.deleteMessages(actorUuid, {
      messageIds: [messageUuid],
      scope: input.scope,
    });
  }

  /**
   * Delete 1–10 messages in one request.
   * - `me`: hide for actor only; realtime to actor devices (never room / peer)
   * - `everyone`: soft-delete for all (sender-only per message); one realtime push per conversation
   */
  async deleteMessages(
    actorUuid: string,
    input: DeleteMessagesInput,
  ): Promise<{ ids: string[]; scope: 'me' | 'everyone' }> {
    const userId = await this.resolveUserId(actorUuid);
    const uniqueIds = [...new Set(input.messageIds.filter(Boolean))];
    if (!uniqueIds.length) {
      throw new ValidationError('messageIds is required');
    }
    if (uniqueIds.length > 10) {
      throw new ValidationError('At most 10 messages can be deleted at once');
    }

    type Row = {
      uuid: string;
      id: string;
      conversationId: string;
      conversationUuid: string;
      senderId: string;
    };

    const rows: Row[] = [];
    for (const messageUuid of uniqueIds) {
      const row = await this.repo.findMessageRowByUuid(messageUuid);
      if (!row || row.isDeleted) {
        throw new NotFoundError(`Message not found: ${messageUuid}`);
      }
      await this.requireParticipant(row.conversationId, userId);
      if (input.scope === 'everyone' && row.senderId !== userId) {
        throw new ForbiddenError(
          'Only the sender can delete for everyone',
        );
      }
      const conversationUuid =
        (await this.repo.findConversationUuidById(row.conversationId)) ?? '';
      rows.push({
        uuid: messageUuid,
        id: row.id,
        conversationId: row.conversationId,
        conversationUuid,
        senderId: row.senderId,
      });
    }

    const deletedIds: string[] = [];

    if (input.scope === 'everyone') {
      for (const row of rows) {
        const ok = await this.repo.deleteMessageForEveryone({
          conversationId: row.conversationId,
          messageId: row.id,
          senderId: userId,
        });
        if (!ok) {
          throw new NotFoundError(`Message not found: ${row.uuid}`);
        }
        deletedIds.push(row.uuid);
      }

      // One realtime event per conversation (not per HTTP for each message)
      const byConv = new Map<
        string,
        { uuids: string[]; notifyUserIds: string[] }
      >();
      for (const row of rows) {
        if (!row.conversationUuid) continue;
        let pack = byConv.get(row.conversationUuid);
        if (!pack) {
          pack = {
            uuids: [],
            notifyUserIds: await this.repo.listParticipantUuids(
              row.conversationId,
            ),
          };
          byConv.set(row.conversationUuid, pack);
        }
        pack.uuids.push(row.uuid);
      }

      for (const [conversationUuid, pack] of byConv) {
        await publishChatRealtime({
          type: 'message.deleted',
          conversationId: conversationUuid,
          messageId: pack.uuids[0]!,
          messageIds: pack.uuids,
          scope: 'everyone',
          actorId: actorUuid,
          notifyUserIds: pack.notifyUserIds,
        });
      }

      return { ids: deletedIds, scope: 'everyone' };
    }

    for (const row of rows) {
      const ok = await this.repo.deleteMessageForMe({
        conversationId: row.conversationId,
        messageId: row.id,
        userId,
      });
      if (!ok) {
        throw new NotFoundError(`Message not found: ${row.uuid}`);
      }
      deletedIds.push(row.uuid);
    }

    // Actor-only realtime (other tabs / devices). Never notify peer.
    const byConvMe = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.conversationUuid) continue;
      const list = byConvMe.get(row.conversationUuid) ?? [];
      list.push(row.uuid);
      byConvMe.set(row.conversationUuid, list);
    }
    for (const [conversationUuid, uuids] of byConvMe) {
      await publishChatRealtime({
        type: 'message.deleted',
        conversationId: conversationUuid,
        messageId: uuids[0]!,
        messageIds: uuids,
        scope: 'me',
        actorId: actorUuid,
        notifyUserIds: [actorUuid],
      });
    }

    return { ids: deletedIds, scope: 'me' };
  }

  async forwardMessages(
    actorUuid: string,
    input: ForwardMessagesInput,
  ): Promise<{ messages: ChatMessage[] }> {
    const userId = await this.resolveUserId(actorUuid);
    const advanceSenderRead = await this.privacy.isReadReceiptsEnabled(userId);
    const created: ChatMessage[] = [];
    /** conversationId -> whether each created message was a shadow send */
    const shadowByConversationUuid = new Map<string, boolean>();

    for (const targetUuid of input.targetConversationIds) {
      const targetId = await this.repo.findConversationIdByUuid(targetUuid);
      if (!targetId) {
        throw new NotFoundError(`Conversation not found: ${targetUuid}`);
      }
      await this.requireParticipant(targetId, userId);

      const peerId = await this.repo.findDirectPeerUserId(targetId, userId);
      let isShadow = false;
      let hideFromPeerId: string | null = null;
      if (peerId) {
        const flags = await this.repo.getActiveDirectBlockFlags(userId, peerId);
        if (flags.aBlockedB) {
          throw new ForbiddenError(
            'You blocked this user. Unblock to send messages.',
          );
        }
        if (flags.bBlockedA) {
          isShadow = true;
          hideFromPeerId = peerId;
        }
      }
      const sendOpts = {
        advanceSenderRead,
        ...(isShadow ? { hideFromUserIds: [hideFromPeerId!] } : {}),
      };

      for (const messageUuid of input.messageIds) {
        const src = await this.repo.findMessageRowByUuid(messageUuid);
        if (!src || src.isDeleted) {
          throw new NotFoundError(`Message not found: ${messageUuid}`);
        }
        await this.requireParticipant(src.conversationId, userId);

        const forwardMeta = {
          forwarded: true,
          fromMessageId: src.uuid,
          fromConversationId: src.conversationId,
        };

        if (
          src.type === 'image' ||
          src.type === 'video' ||
          src.type === 'audio'
        ) {
          const caption = (src.body ?? '').trim();
          try {
            const saved = await this.repo.saveMessage({
              conversationId: targetId,
              senderId: userId,
              body: caption,
              type: src.type,
              copyMediasFrom: {
                messageId: src.id,
                conversationId: src.conversationId,
              },
              meta: forwardMeta,
              ...sendOpts,
            });
            const mapped = await this.repo.mapSavedMessage(saved);
            created.push(mapped);
            shadowByConversationUuid.set(mapped.conversationId, isShadow);
          } catch (err) {
            if (err instanceof Error && err.message === 'MEDIA_INVALID') {
              throw new ValidationError('One or more media items are invalid');
            }
            throw err;
          }
          continue;
        }

        if (src.type === 'location') {
          const loc = src.meta?.location as
            | { lat?: number; lng?: number; address?: string | null }
            | undefined;
          if (
            !loc ||
            !Number.isFinite(loc.lat) ||
            !Number.isFinite(loc.lng)
          ) {
            throw new ValidationError(
              `Location message cannot be forwarded: ${messageUuid}`,
            );
          }
          const saved = await this.repo.saveMessage({
            conversationId: targetId,
            senderId: userId,
            body: '',
            type: 'location',
            location: {
              lat: Number(loc.lat),
              lng: Number(loc.lng),
              address: loc.address ?? undefined,
            },
            meta: forwardMeta,
            ...sendOpts,
          });
          const mapped = await this.repo.mapSavedMessage(saved);
          created.push(mapped);
          shadowByConversationUuid.set(mapped.conversationId, isShadow);
          continue;
        }

        if (src.type === 'post' || src.type === 'reel') {
          const sharedPost = src.meta?.sharedPost as ChatSharedPost | undefined;
          if (!sharedPost?.postId) {
            throw new ValidationError(
              `Post message cannot be forwarded: ${messageUuid}`,
            );
          }
          const saved = await this.repo.saveMessage({
            conversationId: targetId,
            senderId: userId,
            body: (src.body ?? '').trim(),
            type: 'post',
            sharedPost,
            meta: forwardMeta,
            ...sendOpts,
          });
          const mapped = await this.repo.mapSavedMessage(saved);
          created.push(mapped);
          shadowByConversationUuid.set(mapped.conversationId, isShadow);
          continue;
        }

        const body =
          src.type === 'poll'
            ? `📊 ${src.body ?? 'Poll'}`
            : (src.body ?? '').trim();
        if (!body) {
          throw new ValidationError(
            `Message cannot be forwarded: ${messageUuid}`,
          );
        }

        const saved = await this.repo.saveMessage({
          conversationId: targetId,
          senderId: userId,
          body,
          type: 'text',
          meta: forwardMeta,
          ...sendOpts,
        });
        const mapped = await this.repo.mapSavedMessage(saved);
        created.push(mapped);
        shadowByConversationUuid.set(mapped.conversationId, isShadow);
      }
    }

    const notifyByConv = new Map<string, string[]>();
    for (const message of created) {
      if (shadowByConversationUuid.get(message.conversationId)) continue;
      let notifyUserIds = notifyByConv.get(message.conversationId);
      if (!notifyUserIds) {
        const targetId = await this.repo.findConversationIdByUuid(
          message.conversationId,
        );
        if (targetId) {
          const participants = await this.repo.listParticipantUuids(targetId);
          notifyUserIds = participants.filter((id) => id !== actorUuid);
        } else {
          notifyUserIds = [];
        }
        notifyByConv.set(message.conversationId, notifyUserIds);
      }
      const targetId = await this.repo.findConversationIdByUuid(
        message.conversationId,
      );
      const messageInternalId = targetId
        ? await this.repo.findMessageInternalId(targetId, message.id)
        : null;
      if (targetId && messageInternalId && notifyUserIds.length) {
        await this.applyLiveReceipts({
          conversationInternalId: targetId,
          conversationUuid: message.conversationId,
          messageInternalId,
          messageUuid: message.id,
          recipientUuids: notifyUserIds,
        });
        await this.attachLiveReceiptStatus(
          message,
          targetId,
          userId,
          messageInternalId,
        );
      }
      const unreadByUserId =
        targetId && notifyUserIds.length
          ? await this.repo.listUnreadCountsByUserUuids(
              targetId,
              notifyUserIds,
            )
          : undefined;
      await publishChatRealtime({
        type: 'message.created',
        conversationId: message.conversationId,
        message,
        notifyUserIds: notifyUserIds.length ? notifyUserIds : undefined,
        unreadByUserId,
      });
    }

    return { messages: created };
  }

  async pinMessage(
    actorUuid: string,
    conversationUuid: string,
    messageUuid: string,
    input: PinMessageInput,
  ): Promise<ChatMessage> {
    const userId = await this.resolveUserId(actorUuid);
    const meta = await this.repo.findConversationMeta(conversationUuid);
    if (!meta) throw new NotFoundError('Conversation not found');
    await this.requireParticipant(meta.id, userId);

    const messageId = await this.repo.findMessageInternalId(meta.id, messageUuid);
    if (!messageId) throw new NotFoundError('Message not found');

    const updated = await this.repo.setMessagePinned({
      conversationId: meta.id,
      messageId,
      userId,
      pinned: input.pinned,
    });
    if (!updated) throw new NotFoundError('Message not found');
    await publishChatRealtime({
      type: input.pinned ? 'message.pinned' : 'message.unpinned',
      conversationId: conversationUuid,
      messageId: messageUuid,
      message: input.pinned ? updated : null,
    });
    return updated;
  }

  async getPinnedMessage(
    actorUuid: string,
    conversationUuid: string,
  ): Promise<ChatMessage | null> {
    const userId = await this.resolveUserId(actorUuid);
    const meta = await this.repo.findConversationMeta(conversationUuid);
    if (!meta) throw new NotFoundError('Conversation not found');
    await this.requireParticipant(meta.id, userId);
    return this.repo.getPinnedMessage(meta.id, userId);
  }

  async reactToMessage(
    actorUuid: string,
    messageUuid: string,
    emoji: string,
  ): Promise<{
    conversationId: string;
    messageId: string;
    actorId: string;
    emoji: string | null;
    reactions: NonNullable<ChatMessage['reactions']>;
    myReaction: string | null;
  }> {
    const bulk = await this.reactToMessages(actorUuid, {
      messageIds: [messageUuid],
      emoji,
    });
    const first = bulk.results[0];
    if (!first) throw new NotFoundError('Message not found');
    return first;
  }

  /**
   * React to 1–10 messages in one request (same emoji).
   * Realtime emits one `message.reacted` per message.
   */
  async reactToMessages(
    actorUuid: string,
    input: ReactMessagesInput,
  ): Promise<{
    results: Array<{
      conversationId: string;
      messageId: string;
      actorId: string;
      emoji: string | null;
      reactions: NonNullable<ChatMessage['reactions']>;
      myReaction: string | null;
    }>;
  }> {
    const trimmed = input.emoji?.trim() ?? '';
    if (!trimmed || trimmed.length > 32) {
      throw new ValidationError('Invalid reaction emoji');
    }

    const uniqueIds = [...new Set(input.messageIds.filter(Boolean))];
    if (!uniqueIds.length) {
      throw new ValidationError('messageIds is required');
    }
    if (uniqueIds.length > 10) {
      throw new ValidationError('At most 10 messages can be reacted at once');
    }

    const userId = await this.resolveUserId(actorUuid);
    const results: Array<{
      conversationId: string;
      messageId: string;
      actorId: string;
      emoji: string | null;
      reactions: NonNullable<ChatMessage['reactions']>;
      myReaction: string | null;
    }> = [];

    for (const messageUuid of uniqueIds) {
      const row = await this.repo.findMessageRowByUuid(messageUuid);
      if (!row || row.isDeleted) {
        throw new NotFoundError(`Message not found: ${messageUuid}`);
      }

      await this.requireParticipant(row.conversationId, userId);

      if (row.type === 'system' || row.type === 'call') {
        throw new ValidationError(
          `Cannot react to this message: ${messageUuid}`,
        );
      }

      const result = await this.repo.setMessageReaction({
        conversationId: row.conversationId,
        messageId: row.id,
        userId,
        emoji: trimmed,
      });

      const convUuid = await this.repo.findConversationUuidById(
        row.conversationId,
      );
      if (!convUuid) throw new NotFoundError('Conversation not found');

      const memberUuids = await this.repo.listParticipantUuids(
        row.conversationId,
      );

      await publishChatRealtime({
        type: 'message.reacted',
        conversationId: convUuid,
        messageId: messageUuid,
        actorId: actorUuid,
        emoji: result.myReaction,
        reactions: result.reactions.map((r) => ({
          emoji: r.emoji,
          count: r.count,
          reactedByMe: false,
        })),
        notifyUserIds: memberUuids.filter((id) => id !== actorUuid),
      });

      results.push({
        conversationId: convUuid,
        messageId: messageUuid,
        actorId: actorUuid,
        emoji: result.myReaction,
        reactions: result.reactions,
        myReaction: result.myReaction,
      });
    }

    return { results };
  }

  async translateMessage(
    actorUuid: string,
    messageUuid: string,
    targetLanguage: string,
  ): Promise<{
    conversationId: string;
    messageId: string;
    translation: ChatMessageTranslation;
  }> {
    const bulk = await this.translateMessages(actorUuid, {
      messageIds: [messageUuid],
      targetLanguage,
    });
    const first = bulk.results[0];
    if (!first) throw new NotFoundError('Message not found');
    return first;
  }

  /**
   * Translate 1–10 messages to the same language in one request.
   */
  async translateMessages(
    actorUuid: string,
    input: TranslateMessagesInput,
  ): Promise<{
    results: Array<{
      conversationId: string;
      messageId: string;
      translation: ChatMessageTranslation;
    }>;
  }> {
    const lang = input.targetLanguage?.trim().toLowerCase();
    if (!lang || lang.length > 16) {
      throw new ValidationError('Invalid target language');
    }

    const uniqueIds = [...new Set(input.messageIds.filter(Boolean))];
    if (!uniqueIds.length) {
      throw new ValidationError('messageIds is required');
    }
    if (uniqueIds.length > 10) {
      throw new ValidationError(
        'At most 10 messages can be translated at once',
      );
    }

    const userId = await this.resolveUserId(actorUuid);
    const results: Array<{
      conversationId: string;
      messageId: string;
      translation: ChatMessageTranslation;
    }> = [];

    for (const messageUuid of uniqueIds) {
      const row = await this.repo.findMessageRowByUuid(messageUuid);
      if (!row || row.isDeleted) {
        throw new NotFoundError(`Message not found: ${messageUuid}`);
      }

      await this.requireParticipant(row.conversationId, userId);

      const sourceText = (row.body ?? '').trim();
      if (!sourceText) {
        throw new ValidationError(
          `This message has no text to translate: ${messageUuid}`,
        );
      }

      let translated: Awaited<ReturnType<typeof translateHandler>>;
      try {
        translated = await translateHandler(sourceText, 'auto', lang);
      } catch {
        throw new ValidationError(
          `Could not translate message: ${messageUuid}`,
        );
      }

      const translation = await this.repo.upsertMessageTranslation({
        conversationId: row.conversationId,
        messageId: row.id,
        userId,
        targetLanguage: lang,
        sourceLanguage: translated.detectLanguage || null,
        translatedText: translated.text,
      });

      const convUuid = await this.repo.findConversationUuidById(
        row.conversationId,
      );
      if (!convUuid) throw new NotFoundError('Conversation not found');

      results.push({
        conversationId: convUuid,
        messageId: messageUuid,
        translation,
      });
    }

    return { results };
  }
}
