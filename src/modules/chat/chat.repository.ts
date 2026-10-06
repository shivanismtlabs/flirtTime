import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { newPublicId } from '../../shared/ids/index.js';
import {
  pickProfilePictureUrl,
  resolveProfilePictureUrls,
} from '../../shared/media/profile-picture.js';
import type {
  ChatMessage,
  ChatMessageMedia,
  ChatMessageReaction,
  ChatMessageTranslation,
  ChatPollSummary,
  ChatPollVoter,
  ChatSystemEvent,
  ChatSystemMeta,
  ChatUserSummary,
  ConversationDetail,
  ConversationDto,
  ConversationMember,
  ConversationSettingsDto,
  ConversationSettingsInput,
  ParticipantRole,
  SendLocationInput,
  SendPollInput,
  UpdateConversationInput,
} from './chat.types.js';
import { EMPTY_CHAT_PRESENCE } from './chat.types.js';
import { publicUrl } from '../../shared/storage/index.js';

const SYSTEM_EVENTS = new Set<ChatSystemEvent>([
  'group_created',
  'member_added',
  'member_removed',
  'member_left',
  'title_changed',
  'avatar_changed',
  'role_changed',
]);

function directKey(userA: string, userB: string): string {
  const [a, b] = [BigInt(userA), BigInt(userB)].sort((x, y) => (x < y ? -1 : 1));
  return `${a}:${b}`;
}

/** Must fit conversations.last_message_preview varchar(160). */
const LAST_MESSAGE_PREVIEW_MAX = 160;

function truncatePreview(
  text: string,
  max = LAST_MESSAGE_PREVIEW_MAX,
): string {
  if (text.length <= max) return text;
  if (max <= 1) return text.slice(0, max);
  return `${text.slice(0, max - 1)}…`;
}

function previewFromBody(body: string | null | undefined, type: string): string {
  if (type === 'poll') {
    const text = (body ?? '').trim();
    if (!text) return '📊 Poll';
    return truncatePreview(`📊 ${text}`);
  }
  if (type === 'image') {
    const caption = (body ?? '').trim();
    return caption ? truncatePreview(`📷 ${caption}`) : '📷 Photo';
  }
  if (type === 'video') {
    const caption = (body ?? '').trim();
    return caption ? truncatePreview(`🎥 ${caption}`) : '🎥 Video';
  }
  if (type === 'location') {
    const text = (body ?? '').trim();
    return text ? truncatePreview(`📍 ${text}`) : '📍 Location';
  }
  if (type === 'post' || type === 'reel') {
    const text = (body ?? '').trim();
    return text ? truncatePreview(`📎 ${text}`) : '📎 Post';
  }
  if (type === 'audio' || type === 'voice') {
    return '🎤 Voice message';
  }
  if (type === 'call') {
    const text = (body ?? '').trim();
    return truncatePreview(text || '📞 Call');
  }
  if (type === 'system') {
    const text = (body ?? '').trim();
    if (!text) return 'Group update';
    return truncatePreview(text);
  }
  if (type !== 'text') {
    return truncatePreview(type);
  }
  return truncatePreview((body ?? '').trim());
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function parseLocationFromMeta(
  meta: Record<string, unknown> | null,
): ChatMessage['location'] {
  if (!meta || typeof meta.location !== 'object' || meta.location == null) {
    return null;
  }
  const loc = meta.location as Record<string, unknown>;
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    address: typeof loc.address === 'string' ? loc.address : null,
  };
}

function parseSharedPostFromMeta(
  meta: Record<string, unknown> | null,
): ChatMessage['sharedPost'] {
  if (!meta || typeof meta.sharedPost !== 'object' || meta.sharedPost == null) {
    return null;
  }
  const sp = meta.sharedPost as Record<string, unknown>;
  const postId = typeof sp.postId === 'string' ? sp.postId : null;
  if (!postId) return null;

  const authorRaw =
    sp.author && typeof sp.author === 'object'
      ? (sp.author as Record<string, unknown>)
      : null;

  return {
    postId,
    contentType: typeof sp.contentType === 'string' ? sp.contentType : 'post',
    caption: typeof sp.caption === 'string' ? sp.caption : null,
    thumbnailUrl: typeof sp.thumbnailUrl === 'string' ? sp.thumbnailUrl : null,
    mediaUrl: typeof sp.mediaUrl === 'string' ? sp.mediaUrl : null,
    mediaType:
      sp.mediaType === 'image' || sp.mediaType === 'video' ? sp.mediaType : null,
    author: {
      id: typeof authorRaw?.id === 'string' ? authorRaw.id : '',
      username:
        typeof authorRaw?.username === 'string' ? authorRaw.username : '',
      fullName:
        typeof authorRaw?.fullName === 'string' ? authorRaw.fullName : null,
      profilePicture:
        typeof authorRaw?.profilePicture === 'string'
          ? authorRaw.profilePicture
          : null,
      isVerified: Boolean(authorRaw?.isVerified),
    },
  };
}

function parseSystemFromMeta(
  meta: Record<string, unknown> | null,
): ChatSystemMeta | null {
  if (!meta || typeof meta.system !== 'object' || meta.system == null) {
    return null;
  }
  const s = meta.system as Record<string, unknown>;
  const event = typeof s.event === 'string' ? s.event : '';
  if (!SYSTEM_EVENTS.has(event as ChatSystemEvent)) return null;
  const actorId = typeof s.actorId === 'string' ? s.actorId : '';
  if (!actorId) return null;

  const targetIds = Array.isArray(s.targetIds)
    ? s.targetIds.filter((id): id is string => typeof id === 'string')
    : undefined;
  const role =
    s.role === 'admin' || s.role === 'member' ? s.role : undefined;

  return {
    event: event as ChatSystemEvent,
    actorId,
    ...(targetIds?.length ? { targetIds } : {}),
    ...(role ? { role } : {}),
    ...(s.oldTitle !== undefined
      ? {
          oldTitle:
            s.oldTitle === null || typeof s.oldTitle === 'string'
              ? s.oldTitle
              : null,
        }
      : {}),
    ...(s.newTitle !== undefined
      ? {
          newTitle:
            s.newTitle === null || typeof s.newTitle === 'string'
              ? s.newTitle
              : null,
        }
      : {}),
  };
}

/** Narrow columns for thread scroll — avoids pulling updated_at */
const MESSAGE_LIST_COLUMNS = [
  'm.id',
  'm.uuid',
  'm.conversation_id',
  'm.sender_id',
  'm.type',
  'm.body',
  'm.reply_to_id',
  'm.is_edited',
  'm.edited_at',
  'm.meta',
  'm.created_at',
  'm.client_message_id',
] as const;

type InboxRow = {
  id: string | number;
  uuid: string;
  type: 'direct' | 'group';
  title: string | null;
  avatar_path: string | null;
  participants_count: number;
  last_message_at: Date | string | null;
  last_message_preview: string | null;
  last_message_type: string | null;
  last_message_id: string | number | null;
  last_sender_id: string | number | null;
  created_at: Date | string;
  unread_count: number;
  is_muted: boolean;
  is_pinned: boolean;
  is_archived: boolean;
  sort_at: Date | string;
  last_read_message_id: string | number | null;
  last_delivered_message_id: string | number | null;
  label_text: string | null;
  label_color: string | null;
  /** Last message is shadow/hidden from peer — keep single tick on own last message */
  forceLastMessageReceiptSent?: boolean;
};

export class ChatRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async findUserIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('users')
      .select('id')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string }>();
    return row?.id != null ? String(row.id) : null;
  }

  async findUserIdsByUuids(uuids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!uuids.length) return map;
    const rows = await this.db('users')
      .whereIn('uuid', uuids)
      .whereNull('deleted_at')
      .select('id', 'uuid');
    for (const row of rows as Array<{ id: string | number; uuid: string }>) {
      map.set(row.uuid, String(row.id));
    }
    return map;
  }

  async findUserUuidById(id: string): Promise<string | null> {
    const row = await this.db('users')
      .where({ id })
      .whereNull('deleted_at')
      .first<{ uuid: string }>('uuid');
    return row?.uuid ?? null;
  }

  async findConversationIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('conversations')
      .select('id')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string }>();
    return row?.id != null ? String(row.id) : null;
  }

  async findConversationUuidById(id: string): Promise<string | null> {
    const row = await this.db('conversations')
      .where({ id })
      .whereNull('deleted_at')
      .first<{ uuid: string }>('uuid');
    return row?.uuid ?? null;
  }

  async findConversationTypeById(
    id: string,
  ): Promise<'direct' | 'group' | null> {
    const row = await this.db('conversations')
      .where({ id })
      .whereNull('deleted_at')
      .first<{ type: 'direct' | 'group' }>('type');
    return row?.type ?? null;
  }

  async findDirectKeyById(id: string): Promise<string | null> {
    const row = await this.db('conversations')
      .where({ id, type: 'direct' })
      .whereNull('deleted_at')
      .first<{ direct_key: string | null }>('direct_key');
    return row?.direct_key ?? null;
  }

  async findConversationMeta(uuid: string): Promise<{
    id: string;
    uuid: string;
    type: 'direct' | 'group';
    title: string | null;
    avatarPath: string | null;
    createdBy: string;
    participantsCount: number;
    directKey: string | null;
  } | null> {
    const row = await this.db('conversations')
      .select(
        'id',
        'uuid',
        'type',
        'title',
        'avatar_path',
        'created_by',
        'participants_count',
        'direct_key',
      )
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{
        id: string | number;
        uuid: string;
        type: 'direct' | 'group';
        title: string | null;
        avatar_path: string | null;
        created_by: string | number;
        participants_count: number;
        direct_key: string | null;
      }>();

    if (!row) return null;
    return {
      id: String(row.id),
      uuid: row.uuid,
      type: row.type,
      title: row.title,
      avatarPath: row.avatar_path,
      createdBy: String(row.created_by),
      participantsCount: row.participants_count,
      directKey: row.direct_key ?? null,
    };
  }

  /**
   * 1:1 membership self-heal — keeps both sides as active participants + settings.
   * Safe to call on open/create/join when the live conversation still exists.
   */
  private async ensureDirectMembershipInTrx(
    trx: Knex.Transaction,
    conversationId: string | number,
    userIds: string[],
    opts?: { restoreSettingsUserIds?: string[] },
  ): Promise<void> {
    const restoreSet = new Set(
      (opts?.restoreSettingsUserIds ?? []).map(String),
    );
    let activated = 0;

    for (const userId of userIds) {
      const existing = await trx('conversation_participants')
        .where({ conversation_id: conversationId, user_id: userId })
        .first<{ id: string | number; is_active: boolean }>(
          'id',
          'is_active',
        );

      if (existing?.is_active) {
        // still ensure settings for creator reopen
      } else if (existing) {
        await trx('conversation_participants').where({ id: existing.id }).update({
          is_active: true,
          left_at: null,
          joined_at: trx.fn.now(),
          role: 'member',
          updated_at: trx.fn.now(),
        });
        activated += 1;
      } else {
        await trx('conversation_participants').insert({
          conversation_id: conversationId,
          user_id: userId,
          role: 'member',
        });
        activated += 1;
      }

      const settings = await trx('conversation_settings')
        .where({ conversation_id: conversationId, user_id: userId })
        .first<{ id: string | number; deleted_at: Date | string | null }>(
          'id',
          'deleted_at',
        );

      if (!settings) {
        await trx('conversation_settings').insert({
          conversation_id: conversationId,
          user_id: userId,
          sort_at: trx.fn.now(),
        });
      } else if (restoreSet.has(String(userId)) && settings.deleted_at != null) {
        // Opener re-entered the DM after hide-for-me — surface it in their inbox.
        await trx('conversation_settings').where({ id: settings.id }).update({
          deleted_at: null,
          is_archived: false,
          sort_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
      }
    }

    if (activated > 0) {
      await trx('conversations')
        .where({ id: conversationId })
        .update({
          participants_count: trx.raw(
            `(SELECT COUNT(*)::int FROM conversation_participants
              WHERE conversation_id = ? AND is_active = true)`,
            [conversationId],
          ),
          updated_at: trx.fn.now(),
        });
    }
  }

  /**
   * Ensure an internal user is an active 1:1 participant when they belong on
   * the conversation's `direct_key`. Returns true when membership is active
   * after this call (already was, or healed).
   */
  async ensureDirectParticipantIfOnKey(
    conversationId: string,
    userId: string,
    directKeyValue: string | null,
  ): Promise<boolean> {
    if (!directKeyValue) return false;
    const parts = directKeyValue.split(':');
    if (parts.length !== 2) return false;
    if (String(parts[0]) !== userId && String(parts[1]) !== userId) {
      return false;
    }

    await this.db.transaction(async (trx) => {
      // Membership only — do not clear settings.deleted_at here (hide-for-me stays).
      await this.ensureDirectMembershipInTrx(trx, conversationId, [userId]);
    });
    return this.isParticipant(conversationId, userId);
  }

  async createConversation(data: {
    creatorId: string;
    participantIds: string[];
    type: 'direct' | 'group';
    title?: string;
    avatarPath?: string;
  }): Promise<string> {
    const allIds = Array.from(new Set([data.creatorId, ...data.participantIds]));

    return this.db.transaction(async (trx) => {
      if (data.type === 'direct') {
        if (allIds.length !== 2) {
          throw new Error('Direct conversation requires exactly 2 participants');
        }
        const key = directKey(allIds[0], allIds[1]);
        const existing = await trx('conversations')
          .where({ type: 'direct', direct_key: key })
          .whereNull('deleted_at')
          .first<{ id: string | number; uuid: string }>('id', 'uuid');
        if (existing) {
          // Re-open always heals both memberships and unhides for the creator.
          await this.ensureDirectMembershipInTrx(
            trx,
            existing.id,
            allIds,
            { restoreSettingsUserIds: [data.creatorId] },
          );
          return existing.uuid;
        }

        const [conversation] = await trx('conversations')
          .insert({
            uuid: newPublicId(),
            type: 'direct',
            created_by: data.creatorId,
            direct_key: key,
            participants_count: 2,
          })
          .returning(['id', 'uuid']);

        await trx('conversation_participants').insert(
          allIds.map((userId) => ({
            conversation_id: conversation.id,
            user_id: userId,
            role: 'member',
          })),
        );

        await trx('conversation_settings').insert(
          allIds.map((userId) => ({
            conversation_id: conversation.id,
            user_id: userId,
            sort_at: trx.fn.now(),
          })),
        );

        return conversation.uuid as string;
      }

      const [conversation] = await trx('conversations')
        .insert({
          uuid: newPublicId(),
          type: 'group',
          title: data.title ?? null,
          avatar_path: data.avatarPath ?? null,
          created_by: data.creatorId,
          participants_count: allIds.length,
        })
        .returning(['id', 'uuid']);

      await trx('conversation_participants').insert(
        allIds.map((userId) => ({
          conversation_id: conversation.id,
          user_id: userId,
          role: userId === data.creatorId ? 'admin' : 'member',
        })),
      );

      await trx('conversation_settings').insert(
        allIds.map((userId) => ({
          conversation_id: conversation.id,
          user_id: userId,
          sort_at: trx.fn.now(),
        })),
      );

      return conversation.uuid as string;
    });
  }

  async updateConversation(
    conversationId: string,
    input: UpdateConversationInput,
  ): Promise<boolean> {
    const patch: Record<string, unknown> = { updated_at: this.db.fn.now() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.avatarPath !== undefined) patch.avatar_path = input.avatarPath;

    const updated = await this.db('conversations')
      .where({ id: conversationId })
      .whereNull('deleted_at')
      .update(patch);
    return updated > 0;
  }

  async getParticipantRole(
    conversationId: string,
    userId: string,
  ): Promise<ParticipantRole | null> {
    const row = await this.db('conversation_participants')
      .where({
        conversation_id: conversationId,
        user_id: userId,
        is_active: true,
      })
      .first<{ role: ParticipantRole }>('role');
    return row?.role ?? null;
  }

  async listConversations(
    userId: string,
    limit: number,
    cursor?: string,
    archived = false,
  ): Promise<{ rows: ConversationDto[]; nextCursor: string | null }> {
    let query = this.db('conversation_settings as cs')
      .join('conversations as c', 'c.id', 'cs.conversation_id')
      .where('cs.user_id', userId)
      .whereNull('cs.deleted_at')
      .whereNull('c.deleted_at')
      .where('cs.is_archived', archived)
      .select(
        'c.id',
        'c.uuid',
        'c.type',
        'c.title',
        'c.avatar_path',
        'c.participants_count',
        'c.last_message_at',
        'c.last_message_preview',
        'c.last_message_type',
        'c.last_message_id',
        'c.last_sender_id',
        'c.created_at',
        'cs.unread_count',
        'cs.is_muted',
        'cs.is_pinned',
        'cs.is_archived',
        'cs.sort_at',
        'cs.last_read_message_id',
        'cs.last_delivered_message_id',
        'cs.label_text',
        'cs.label_color',
      )
      .orderByRaw('cs.is_pinned DESC, cs.sort_at DESC')
      .limit(limit + 1);

    if (cursor) {
      query = query.where('cs.sort_at', '<', cursor);
    }

    const dbRows = (await query) as InboxRow[];
    const hasMore = dbRows.length > limit;
    const pageRows = hasMore ? dbRows.slice(0, limit) : dbRows;

    const peerByConv = await this.loadDmPeers(
      pageRows.filter((r) => r.type === 'direct').map((r) => r.id),
      userId,
    );
    const messageUuidById = await this.loadMessageUuidsByIds(
      pageRows.flatMap((r) =>
        [r.last_read_message_id, r.last_delivered_message_id].filter(
          (id): id is string | number => id != null,
        ),
      ),
    );
    const senderUuidById = await this.loadUserUuidsByIds(
      pageRows
        .map((r) => r.last_sender_id)
        .filter((id): id is string | number => id != null)
        .map(String),
    );
    const peerCursors = await this.loadPeerReceiptCursors(
      pageRows.filter((r) => r.type === 'direct').map((r) => r.id),
      userId,
    );
    const blockedPeerUuids = await this.loadViewerBlockedPeerUuids(
      userId,
      [...peerByConv.values()].map((p) => p.id),
    );

    const viewerRows = await this.applyViewerVisibleLastMessages(
      pageRows,
      userId,
    );
    // Re-load sender uuids for any substituted last_sender_id
    const senderUuidByIdFull = await this.loadUserUuidsByIds([
      ...senderUuidById.keys(),
      ...viewerRows
        .map((r) => r.last_sender_id)
        .filter((id): id is string | number => id != null)
        .map(String),
    ]);
    for (const [k, v] of senderUuidById) senderUuidByIdFull.set(k, v);

    const rows = viewerRows.map((row) => {
      const peer = peerByConv.get(String(row.id)) ?? null;
      return this.mapConversationDto(
        row,
        peer,
        messageUuidById,
        senderUuidByIdFull,
        peerCursors.get(String(row.id)) ?? null,
        userId,
        Boolean(peer && blockedPeerUuids.has(peer.id)),
      );
    });

    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last ? (toIso(last.sort_at) as string) : null;

    return { rows, nextCursor };
  }

  async getConversationDetail(
    conversationUuid: string,
    viewerUserId: string,
  ): Promise<ConversationDetail | null> {
    const row = (await this.db('conversation_settings as cs')
      .join('conversations as c', 'c.id', 'cs.conversation_id')
      .where('c.uuid', conversationUuid)
      .where('cs.user_id', viewerUserId)
      .whereNull('cs.deleted_at')
      .whereNull('c.deleted_at')
      .first(
        'c.id',
        'c.uuid',
        'c.type',
        'c.title',
        'c.avatar_path',
        'c.participants_count',
        'c.last_message_at',
        'c.last_message_preview',
        'c.last_message_type',
        'c.last_message_id',
        'c.last_sender_id',
        'c.created_at',
        'cs.unread_count',
        'cs.is_muted',
        'cs.is_pinned',
        'cs.is_archived',
        'cs.sort_at',
        'cs.last_read_message_id',
        'cs.last_delivered_message_id',
        'cs.label_text',
        'cs.label_color',
      )) as InboxRow | undefined;

    if (!row) return null;

    const [members, myRole, peerByConv, messageUuidById, senderUuidById, peerCursors] =
      await Promise.all([
        this.listMembers(String(row.id)),
        this.getParticipantRole(String(row.id), viewerUserId),
        row.type === 'direct'
          ? this.loadDmPeers([row.id], viewerUserId)
          : Promise.resolve(new Map<string, ChatUserSummary>()),
        this.loadMessageUuidsByIds(
          [row.last_read_message_id, row.last_delivered_message_id].filter(
            (id): id is string | number => id != null,
          ),
        ),
        this.loadUserUuidsByIds(
          row.last_sender_id != null ? [String(row.last_sender_id)] : [],
        ),
        row.type === 'direct'
          ? this.loadPeerReceiptCursors([row.id], viewerUserId)
          : Promise.resolve(
              new Map<
                string,
                { readId: bigint | null; deliveredId: bigint | null }
              >(),
            ),
      ]);

    const peers = peerByConv.get(String(row.id)) ?? null;
    let isPeerBlocked = false;
    if (row.type === 'direct' && peers?.id) {
      const blocked = await this.loadViewerBlockedPeerUuids(viewerUserId, [
        peers.id,
      ]);
      isPeerBlocked = blocked.has(peers.id);
    }

    const [viewerRow] = await this.applyViewerVisibleLastMessages(
      [row],
      viewerUserId,
    );
    const patched = viewerRow ?? row;
    const senderUuidByIdPatched =
      patched.last_sender_id != null &&
      String(patched.last_sender_id) !== String(row.last_sender_id)
        ? await this.loadUserUuidsByIds([String(patched.last_sender_id)])
        : senderUuidById;
    for (const [k, v] of senderUuidById) senderUuidByIdPatched.set(k, v);

    return {
      ...this.mapConversationDto(
        patched,
        peers,
        messageUuidById,
        senderUuidByIdPatched,
        peerCursors.get(String(row.id)) ?? null,
        viewerUserId,
        isPeerBlocked,
      ),
      members,
      myRole,
    };
  }

  async listMembers(conversationId: string): Promise<ConversationMember[]> {
    const rows = await this.db('conversation_participants as cp')
      .join('users', 'users.id', 'cp.user_id')
      .join('user_details', 'user_details.user_id', 'users.id')
      .where({ 'cp.conversation_id': conversationId, 'cp.is_active': true })
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .orderBy('cp.joined_at', 'asc')
      .select(
        'users.uuid',
        'user_details.username',
        'user_details.full_name',
        'user_details.profile_picture',
        'user_details.is_verified',
        'cp.role',
        'cp.joined_at',
      );

    const members = (rows as Array<{
      uuid: string;
      username: string;
      full_name: string | null;
      profile_picture: string | null;
      is_verified: boolean;
      role: ParticipantRole;
      joined_at: Date | string;
    }>).map((r) => ({
      id: r.uuid,
      username: r.username,
      fullName: r.full_name,
      profilePicture: r.profile_picture,
      isVerified: Boolean(r.is_verified),
      ...EMPTY_CHAT_PRESENCE,
      role: r.role,
      joinedAt: toIso(r.joined_at) as string,
    }));

    const urls = await resolveProfilePictureUrls(members.map((m) => m.profilePicture));
    return members.map((m) => ({
      ...m,
      profilePicture: pickProfilePictureUrl(m.profilePicture, urls),
    }));
  }

  /** Active participant public uuids (for socket inbox fan-out). */
  async listParticipantUuids(conversationId: string): Promise<string[]> {
    const rows = await this.db('conversation_participants as cp')
      .join('users', 'users.id', 'cp.user_id')
      .where({ 'cp.conversation_id': conversationId, 'cp.is_active': true })
      .whereNull('users.deleted_at')
      .select('users.uuid');
    return (rows as Array<{ uuid: string }>).map((r) => r.uuid);
  }

  /** Public uuid of the existing direct chat between two internal user ids, if any. */
  async findDirectConversationUuidBetween(
    userIdA: string,
    userIdB: string,
  ): Promise<string | null> {
    if (!userIdA || !userIdB || userIdA === userIdB) return null;
    const row = await this.db('conversations')
      .where({ type: 'direct', direct_key: directKey(userIdA, userIdB) })
      .whereNull('deleted_at')
      .first<{ uuid: string }>('uuid');
    return row?.uuid ?? null;
  }

  /** True if either user has an active block on the other. */
  async hasActiveBlockBetween(
    userIdA: string,
    userIdB: string,
  ): Promise<boolean> {
    const flags = await this.getActiveDirectBlockFlags(userIdA, userIdB);
    return flags.aBlockedB || flags.bBlockedA;
  }

  /**
   * Directional active blocks between two users.
   * aBlockedB = userIdA blocked userIdB; bBlockedA = userIdB blocked userIdA.
   */
  async getActiveDirectBlockFlags(
    userIdA: string,
    userIdB: string,
  ): Promise<{ aBlockedB: boolean; bBlockedA: boolean }> {
    if (!userIdA || !userIdB || userIdA === userIdB) {
      return { aBlockedB: false, bBlockedA: false };
    }
    const rows = (await this.db('blocks')
      .whereNull('deleted_at')
      .andWhere((q) => {
        q.where({ blocker_id: userIdA, blocked_id: userIdB }).orWhere({
          blocker_id: userIdB,
          blocked_id: userIdA,
        });
      })
      .select('blocker_id', 'blocked_id')) as Array<{
      blocker_id: string | number;
      blocked_id: string | number;
    }>;

    let aBlockedB = false;
    let bBlockedA = false;
    for (const r of rows) {
      if (
        String(r.blocker_id) === userIdA &&
        String(r.blocked_id) === userIdB
      ) {
        aBlockedB = true;
      }
      if (
        String(r.blocker_id) === userIdB &&
        String(r.blocked_id) === userIdA
      ) {
        bBlockedA = true;
      }
    }
    return { aBlockedB, bBlockedA };
  }

  /**
   * DM peer internal id if conversation is direct; else null.
   * Used for shadow-send when peer blocked the sender.
   */
  async findDirectPeerUserId(
    conversationId: string,
    userId: string,
  ): Promise<string | null> {
    const type = await this.findConversationTypeById(conversationId);
    if (type !== 'direct') return null;
    const participantIds = await this.listParticipantUserIds(conversationId);
    return participantIds.find((id) => id !== userId) ?? null;
  }

  /** Active participant internal ids for a conversation. */
  async listParticipantUserIds(conversationId: string): Promise<string[]> {
    const rows = await this.db('conversation_participants')
      .where({ conversation_id: conversationId, is_active: true })
      .select('user_id');
    return (rows as Array<{ user_id: string | number }>).map((r) =>
      String(r.user_id),
    );
  }

  /** User uuids who muted this conversation (skip chat push). */
  async listMutedParticipantUuids(conversationId: string): Promise<string[]> {
    const rows = await this.db('conversation_settings as cs')
      .join('users', 'users.id', 'cs.user_id')
      .where({
        'cs.conversation_id': conversationId,
        'cs.is_muted': true,
      })
      .whereNull('cs.deleted_at')
      .whereNull('users.deleted_at')
      .select('users.uuid');
    return (rows as Array<{ uuid: string }>).map((r) => r.uuid);
  }

  async findUserDisplayByUuid(
    uuid: string,
  ): Promise<{ username: string; fullName: string | null } | null> {
    const row = await this.db('users')
      .leftJoin('user_details', 'user_details.user_id', 'users.id')
      .where({ 'users.uuid': uuid })
      .whereNull('users.deleted_at')
      .first<{ username: string | null; full_name: string | null }>(
        'user_details.username',
        'user_details.full_name',
      );
    if (!row) return null;
    return {
      username: row.username ?? 'Someone',
      fullName: row.full_name,
    };
  }

  /**
   * Display labels keyed by internal user id (for system message body text).
   * Prefers full name, falls back to @username.
   */
  async findUserDisplayLabelsByIds(
    userIds: string[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const unique = [...new Set(userIds.filter(Boolean))];
    if (!unique.length) return result;

    const rows = await this.db('users')
      .leftJoin('user_details', 'user_details.user_id', 'users.id')
      .whereIn('users.id', unique)
      .whereNull('users.deleted_at')
      .select(
        'users.id',
        'user_details.username',
        'user_details.full_name',
      );

    for (const r of rows as Array<{
      id: string | number;
      username: string | null;
      full_name: string | null;
    }>) {
      const name = r.full_name?.trim() || r.username?.trim() || 'Someone';
      result.set(String(r.id), name);
    }
    return result;
  }

  async updateSettings(
    conversationId: string,
    userId: string,
    input: ConversationSettingsInput,
  ): Promise<ConversationSettingsDto | null> {
    const patch: Record<string, unknown> = { updated_at: this.db.fn.now() };
    if (input.isMuted !== undefined) patch.is_muted = input.isMuted;
    if (input.isArchived !== undefined) patch.is_archived = input.isArchived;
    if (input.isPinned !== undefined) {
      patch.is_pinned = input.isPinned;
      patch.pinned_at = input.isPinned ? this.db.fn.now() : null;
    }
    if (input.labelText !== undefined) {
      const text =
        input.labelText == null ? null : String(input.labelText).trim();
      patch.label_text = text && text.length > 0 ? text.slice(0, 40) : null;
      if (!patch.label_text) patch.label_color = null;
    }
    if (input.labelColor !== undefined) {
      patch.label_color = input.labelColor;
    }

    const updated = await this.db('conversation_settings')
      .where({ conversation_id: conversationId, user_id: userId })
      .whereNull('deleted_at')
      .update(patch);

    if (!updated) return null;

    const row = await this.db('conversation_settings')
      .where({ conversation_id: conversationId, user_id: userId })
      .whereNull('deleted_at')
      .first<{
        is_muted: boolean;
        is_pinned: boolean;
        is_archived: boolean;
        unread_count: number;
        last_read_message_id: string | number | null;
        last_delivered_message_id: string | number | null;
        label_text: string | null;
        label_color: string | null;
      }>();

    if (!row) return null;

    const messageUuidById = await this.loadMessageUuidsByIds(
      [row.last_read_message_id, row.last_delivered_message_id].filter(
        (id): id is string | number => id != null,
      ),
    );

    return {
      isMuted: row.is_muted,
      isPinned: row.is_pinned,
      isArchived: row.is_archived,
      unreadCount: row.unread_count,
      lastReadMessageId:
        row.last_read_message_id == null
          ? null
          : (messageUuidById.get(String(row.last_read_message_id)) ?? null),
      lastDeliveredMessageId:
        row.last_delivered_message_id == null
          ? null
          : (messageUuidById.get(String(row.last_delivered_message_id)) ?? null),
      labelText: row.label_text,
      labelColor: row.label_color,
    };
  }

  async addMembers(
    conversationId: string,
    userIds: string[],
  ): Promise<string[]> {
    if (!userIds.length) return [];

    return this.db.transaction(async (trx) => {
      const addedIds: string[] = [];
      for (const userId of userIds) {
        const existing = await trx('conversation_participants')
          .where({ conversation_id: conversationId, user_id: userId })
          .first<{ id: string | number; is_active: boolean }>();

        if (existing?.is_active) continue;

        if (existing) {
          await trx('conversation_participants').where({ id: existing.id }).update({
            is_active: true,
            left_at: null,
            joined_at: trx.fn.now(),
            role: 'member',
            updated_at: trx.fn.now(),
          });
        } else {
          await trx('conversation_participants').insert({
            conversation_id: conversationId,
            user_id: userId,
            role: 'member',
          });
        }

        const settings = await trx('conversation_settings')
          .where({ conversation_id: conversationId, user_id: userId })
          .first<{ id: string | number; deleted_at: Date | string | null }>();

        if (settings) {
          await trx('conversation_settings').where({ id: settings.id }).update({
            deleted_at: null,
            is_archived: false,
            sort_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          });
        } else {
          await trx('conversation_settings').insert({
            conversation_id: conversationId,
            user_id: userId,
            sort_at: trx.fn.now(),
          });
        }

        addedIds.push(userId);
      }

      if (addedIds.length > 0) {
        await trx('conversations')
          .where({ id: conversationId })
          .update({
            participants_count: trx.raw('participants_count + ?', [addedIds.length]),
            updated_at: trx.fn.now(),
          });
      }

      return addedIds;
    });
  }

  /**
   * Hide conversation for one user only (delete for me).
   * Soft-deletes their settings row so it leaves the inbox, and marks all
   * existing messages as deleted-for-me so history is gone if they re-open.
   * Conversation + messages remain for other participants.
   */
  async hideConversationForUser(
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const settingsUpdated = await trx('conversation_settings')
        .where({
          conversation_id: conversationId,
          user_id: userId,
        })
        .whereNull('deleted_at')
        .update({
          deleted_at: trx.fn.now(),
          unread_count: 0,
          is_archived: false,
          is_pinned: false,
          updated_at: trx.fn.now(),
        });

      if (!settingsUpdated) {
        // Already hidden or never had settings — still try mass message hide
        const existing = await trx('conversation_settings')
          .where({ conversation_id: conversationId, user_id: userId })
          .first('id');
        if (!existing) return false;
      }

      // Hide all current messages for this user only
      await trx.raw(
        `
        INSERT INTO message_user_deletes (conversation_id, message_id, user_id)
        SELECT m.conversation_id, m.id, ?
        FROM messages m
        WHERE m.conversation_id = ?
          AND m.deleted_for_everyone_at IS NULL
        ON CONFLICT (message_id, user_id) DO NOTHING
        `,
        [userId, conversationId],
      );

      await trx('chat_outbox')
        .where({ conversation_id: conversationId, actor_id: userId })
        .del();

      return true;
    });
  }

  /**
   * Telegram-style: permanently destroy a conversation for every participant.
   * Soft-deletes the thread (frees direct_key so a later chat creates a new one)
   * and erases all messages so history is gone on both sides.
   * Returns active participants' public uuids for realtime fan-out.
   */
  async destroyConversation(
    conversationId: string,
  ): Promise<{ participantUuids: string[]; destroyed: boolean }> {
    return this.db.transaction(async (trx) => {
      const participantUuids = (
        await trx('conversation_participants as cp')
          .join('users', 'users.id', 'cp.user_id')
          .where({
            'cp.conversation_id': conversationId,
            'cp.is_active': true,
          })
          .whereNull('users.deleted_at')
          .select('users.uuid')
      ).map((r: { uuid: string }) => r.uuid);

      const updated = await trx('conversations')
        .where({ id: conversationId })
        .whereNull('deleted_at')
        .update({
          deleted_at: trx.fn.now(),
          last_message_id: null,
          last_message_at: null,
          last_message_preview: null,
          last_message_type: null,
          last_sender_id: null,
          participants_count: 0,
          updated_at: trx.fn.now(),
        });

      if (!updated) {
        return { participantUuids: [], destroyed: false };
      }

      // Wipe all messages for both sides (CASCADE media/reactions/polls/deletes).
      await trx('messages').where({ conversation_id: conversationId }).del();

      await trx('conversation_participants')
        .where({ conversation_id: conversationId, is_active: true })
        .update({
          is_active: false,
          left_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });

      await trx('conversation_settings')
        .where({ conversation_id: conversationId })
        .whereNull('deleted_at')
        .update({
          deleted_at: trx.fn.now(),
          unread_count: 0,
          is_archived: false,
          is_pinned: false,
          updated_at: trx.fn.now(),
        });

      await trx('chat_outbox')
        .where({ conversation_id: conversationId })
        .del();

      return { participantUuids, destroyed: true };
    });
  }

  async removeMember(
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const updated = await trx('conversation_participants')
        .where({
          conversation_id: conversationId,
          user_id: userId,
          is_active: true,
        })
        .update({
          is_active: false,
          left_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });

      if (!updated) return false;

      await trx('conversation_settings')
        .where({ conversation_id: conversationId, user_id: userId })
        .whereNull('deleted_at')
        .update({
          deleted_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });

      await trx('conversations')
        .where({ id: conversationId })
        .where('participants_count', '>', 0)
        .update({
          participants_count: trx.raw('GREATEST(participants_count - 1, 0)'),
          updated_at: trx.fn.now(),
        });

      return true;
    });
  }

  async updateMemberRole(
    conversationId: string,
    userId: string,
    role: ParticipantRole,
  ): Promise<boolean> {
    const updated = await this.db('conversation_participants')
      .where({
        conversation_id: conversationId,
        user_id: userId,
        is_active: true,
      })
      .update({ role, updated_at: this.db.fn.now() });
    return updated > 0;
  }

  async countActiveAdmins(conversationId: string): Promise<number> {
    const row = await this.db('conversation_participants')
      .where({
        conversation_id: conversationId,
        role: 'admin',
        is_active: true,
      })
      .count<{ count: string }>('id as count')
      .first();
    return Number(row?.count ?? 0);
  }

  async findMessageInternalId(
    conversationId: string,
    messageUuid: string,
  ): Promise<string | null> {
    const row = await this.db('messages')
      .where({ conversation_id: conversationId, uuid: messageUuid })
      .whereNull('deleted_for_everyone_at')
      .first<{ id: string | number }>('id');
    return row?.id != null ? String(row.id) : null;
  }

  async findLatestMessageId(conversationId: string): Promise<string | null> {
    const row = await this.db('messages')
      .where({ conversation_id: conversationId })
      .whereNull('deleted_for_everyone_at')
      .orderBy('id', 'desc')
      .first<{ id: string | number }>('id');
    return row?.id != null ? String(row.id) : null;
  }

  /**
   * Latest message the viewer can see (excludes delete-for-me / shadow-hidden).
   * Used so delivered/read cursors never advance over blocked-period messages.
   */
  async findLatestVisibleMessageId(
    conversationId: string,
    userId: string,
  ): Promise<string | null> {
    const row = await this.db('messages as m')
      .where('m.conversation_id', conversationId)
      .whereNull('m.deleted_for_everyone_at')
      .whereNotExists(function hideDeletedForMe() {
        this.select(this.client.raw('1'))
          .from('message_user_deletes as d')
          .whereRaw('d.conversation_id = m.conversation_id')
          .andWhereRaw('d.message_id = m.id')
          .andWhere('d.user_id', userId);
      })
      .orderBy('m.id', 'desc')
      .select({ id: 'm.id' })
      .first<{ id: string | number }>();
    return row?.id != null ? String(row.id) : null;
  }

  /** True if this user has deleted-for-me / shadow-hidden the message. */
  async isMessageHiddenForUser(
    conversationId: string,
    messageId: string,
    userId: string,
  ): Promise<boolean> {
    const row = await this.db('message_user_deletes')
      .where({
        conversation_id: conversationId,
        message_id: messageId,
        user_id: userId,
      })
      .first('id');
    return Boolean(row);
  }

  /** True if any non-sender participant has this message permanently hidden. */
  async isMessageHiddenFromAnyRecipient(
    conversationId: string,
    messageId: string,
    senderId: string,
  ): Promise<boolean> {
    const row = await this.db('message_user_deletes')
      .where({
        conversation_id: conversationId,
        message_id: messageId,
      })
      .whereNot('user_id', senderId)
      .first('id');
    return Boolean(row);
  }

  async findMessageUuidById(messageId: string): Promise<string | null> {
    const row = await this.db('messages')
      .where({ id: messageId })
      .first<{ uuid: string }>('uuid');
    return row?.uuid ?? null;
  }

  /**
   * Message ownership + conversation context for Message info (sender-only).
   */
  async findMessageInfoContext(messageUuid: string): Promise<{
    messageInternalId: string;
    messageUuid: string;
    conversationInternalId: string;
    conversationUuid: string;
    conversationType: 'direct' | 'group';
    senderInternalId: string;
    senderUuid: string;
    type: string;
    body: string | null;
    sentAt: string;
  } | null> {
    const row = await this.db('messages as m')
      .join('conversations as c', 'c.id', 'm.conversation_id')
      .join('users as su', 'su.id', 'm.sender_id')
      .where({ 'm.uuid': messageUuid })
      .whereNull('m.deleted_for_everyone_at')
      .whereNull('c.deleted_at')
      .first<{
        message_id: string | number;
        message_uuid: string;
        conversation_id: string | number;
        conversation_uuid: string;
        conversation_type: 'direct' | 'group';
        sender_id: string | number;
        sender_uuid: string;
        type: string;
        body: string | null;
        created_at: Date | string;
      }>(
        'm.id as message_id',
        'm.uuid as message_uuid',
        'c.id as conversation_id',
        'c.uuid as conversation_uuid',
        'c.type as conversation_type',
        'm.sender_id as sender_id',
        'su.uuid as sender_uuid',
        'm.type',
        'm.body',
        'm.created_at',
      );

    if (!row) return null;
    return {
      messageInternalId: String(row.message_id),
      messageUuid: row.message_uuid,
      conversationInternalId: String(row.conversation_id),
      conversationUuid: row.conversation_uuid,
      conversationType: row.conversation_type,
      senderInternalId: String(row.sender_id),
      senderUuid: row.sender_uuid,
      type: row.type,
      body: row.body,
      sentAt: toIso(row.created_at) as string,
    };
  }

  /** Unread badges keyed by public user uuid (missing row → 0). */
  async listUnreadCountsByUserUuids(
    conversationId: string,
    userUuids: string[],
  ): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    const unique = [...new Set(userUuids.filter(Boolean))];
    for (const id of unique) result[id] = 0;
    if (!unique.length) return result;

    const rows = (await this.db('conversation_settings as cs')
      .join('users', 'users.id', 'cs.user_id')
      .where('cs.conversation_id', conversationId)
      .whereIn('users.uuid', unique)
      .whereNull('cs.deleted_at')
      .whereNull('users.deleted_at')
      .select('users.uuid', 'cs.unread_count')) as Array<{
      uuid: string;
      unread_count: string | number | null;
    }>;

    for (const row of rows) {
      if (!row.uuid) continue;
      result[row.uuid] = Math.max(0, Number(row.unread_count ?? 0));
    }
    return result;
  }

  /**
   * Per-recipient delivery/read cursors for members other than `excludeUserId`.
   * Used for WhatsApp-style Message info.
   */
  async listRecipientReceipts(
    conversationId: string,
    excludeUserId: string,
  ): Promise<
    Array<{
      userId: string;
      userUuid: string;
      username: string;
      fullName: string | null;
      profilePicture: string | null;
      isVerified: boolean;
      lastDeliveredMessageId: string | null;
      lastDeliveredAt: string | null;
      lastReadMessageId: string | null;
      lastReadAt: string | null;
    }>
  > {
    const rows = await this.db('conversation_participants as cp')
      .join('users', 'users.id', 'cp.user_id')
      .join('user_details', 'user_details.user_id', 'users.id')
      .leftJoin('conversation_settings as cs', function joinSettings() {
        this.on('cs.conversation_id', '=', 'cp.conversation_id')
          .andOn('cs.user_id', '=', 'cp.user_id')
          .andOnNull('cs.deleted_at');
      })
      .where({
        'cp.conversation_id': conversationId,
        'cp.is_active': true,
      })
      .whereNot('cp.user_id', excludeUserId)
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .orderBy('cp.joined_at', 'asc')
      .select(
        'users.id as user_id',
        'users.uuid as user_uuid',
        'user_details.username',
        'user_details.full_name',
        'user_details.profile_picture',
        'user_details.is_verified',
        'cs.last_delivered_message_id',
        'cs.last_delivered_at',
        'cs.last_read_message_id',
        'cs.last_read_at',
      );

    const mapped = (rows as Array<{
      user_id: string | number;
      user_uuid: string;
      username: string;
      full_name: string | null;
      profile_picture: string | null;
      is_verified: boolean;
      last_delivered_message_id: string | number | null;
      last_delivered_at: Date | string | null;
      last_read_message_id: string | number | null;
      last_read_at: Date | string | null;
    }>).map((r) => ({
      userId: String(r.user_id),
      userUuid: r.user_uuid,
      username: r.username,
      fullName: r.full_name,
      profilePicture: r.profile_picture,
      isVerified: Boolean(r.is_verified),
      lastDeliveredMessageId:
        r.last_delivered_message_id != null
          ? String(r.last_delivered_message_id)
          : null,
      lastDeliveredAt: toIso(r.last_delivered_at),
      lastReadMessageId:
        r.last_read_message_id != null
          ? String(r.last_read_message_id)
          : null,
      lastReadAt: toIso(r.last_read_at),
    }));

    const urls = await resolveProfilePictureUrls(
      mapped.map((m) => m.profilePicture),
    );
    return mapped.map((m) => ({
      ...m,
      profilePicture: pickProfilePictureUrl(m.profilePicture, urls),
    }));
  }

  /**
   * Conversations where this user still needs to advance delivered
   * up to the latest *visible* message (device online catch-up).
   * Skips messages hidden via message_user_deletes (shadow / delete-for-me).
   */
  async listPendingDeliverySync(userId: string): Promise<
    Array<{
      conversationId: string;
      conversationUuid: string;
      messageId: string;
      messageUuid: string;
    }>
  > {
    const rows = await this.db('conversation_settings as cs')
      .join('conversations as c', 'c.id', 'cs.conversation_id')
      .where('cs.user_id', userId)
      .whereNull('cs.deleted_at')
      .whereNull('c.deleted_at')
      .whereNotNull('c.last_message_id')
      .select('c.id as conversation_id', 'c.uuid as conversation_uuid')
      .limit(100);

    const result: Array<{
      conversationId: string;
      conversationUuid: string;
      messageId: string;
      messageUuid: string;
    }> = [];

    for (const r of rows as Array<{
      conversation_id: string | number;
      conversation_uuid: string;
    }>) {
      const conversationId = String(r.conversation_id);
      const visibleId = await this.findLatestVisibleMessageId(
        conversationId,
        userId,
      );
      if (!visibleId) continue;

      const settings = await this.db('conversation_settings')
        .where({ conversation_id: conversationId, user_id: userId })
        .first<{ last_delivered_message_id: string | number | null }>(
          'last_delivered_message_id',
        );
      const delivered =
        settings?.last_delivered_message_id != null
          ? String(settings.last_delivered_message_id)
          : null;
      if (delivered != null && BigInt(delivered) >= BigInt(visibleId)) {
        continue;
      }

      const messageUuid = await this.findMessageUuidById(visibleId);
      if (!messageUuid) continue;
      result.push({
        conversationId,
        conversationUuid: r.conversation_uuid,
        messageId: visibleId,
        messageUuid,
      });
    }

    return result;
  }

  /**
   * Fast send path (one TX):
   * 1) INSERT message (narrow returning)
   * 2) Optional hide-from (message_user_deletes) for shadow/blocked recipients
   * 3) UPDATE conversations denorm
   * 4) UPDATE settings — all members, or sender-only when shadowing
   * 5) INSERT outbox for async socket/push (payload still recorded)
   */
  async saveMessage(data: {
    conversationId: string;
    senderId: string;
    body: string;
    type?: string;
    clientMessageId?: string;
    replyToId?: string;
    poll?: SendPollInput;
    mediaIds?: string[];
    /** Copy media links from an existing message (forward) — skips uploader ownership check */
    copyMediasFrom?: { messageId: string; conversationId: string };
    location?: SendLocationInput;
    sharedPost?: ChatMessage['sharedPost'];
    meta?: Record<string, unknown> | null;
    /**
     * Permanent delete-for-me for these users (WhatsApp-style shadow send when
     * recipient blocked the sender). They never see the message, even after unblock.
     * Settings side-effects apply to sender only.
     */
    hideFromUserIds?: string[];
    /**
     * When false, do not advance the sender last_read cursor (read receipts off).
     * last_delivered + unread still update. Default true.
     */
    advanceSenderRead?: boolean;
  }) {
    const type = data.poll
      ? 'poll'
      : data.location
        ? 'location'
        : data.sharedPost
          ? 'post'
          : data.mediaIds?.length || data.copyMediasFrom
            ? data.type === 'video'
              ? 'video'
              : data.type === 'audio' || data.type === 'voice'
                ? 'audio'
                : 'image'
            : data.type === 'post'
              ? 'post'
              : (data.type ?? 'text');
    const body = data.poll
      ? data.poll.question.trim()
      : data.location
        ? (data.location.address?.trim() ||
            `${data.location.lat.toFixed(5)}, ${data.location.lng.toFixed(5)}`)
        : data.sharedPost
          ? (data.body?.trim() ||
              data.sharedPost.caption?.trim() ||
              `@${data.sharedPost.author.username}`)
          : data.body;
    const preview = previewFromBody(body, type);
    const hideFrom = [
      ...new Set(
        (data.hideFromUserIds ?? [])
          .map(String)
          .filter((id) => id && id !== data.senderId),
      ),
    ];
    const isShadow = hideFrom.length > 0;
    const advanceSenderRead = data.advanceSenderRead !== false;

    const meta: Record<string, unknown> = {
      ...(data.meta && typeof data.meta === 'object' ? data.meta : {}),
    };
    if (data.location) {
      meta.location = {
        lat: data.location.lat,
        lng: data.location.lng,
        address: data.location.address?.trim() || null,
      };
    }
    if (data.sharedPost) {
      meta.sharedPost = data.sharedPost;
    }

    return this.db.transaction(async (trx) => {
      let replyToId: string | number | null = null;
      if (data.replyToId) {
        const parent = await trx('messages')
          .where({ conversation_id: data.conversationId, uuid: data.replyToId })
          .whereNull('deleted_for_everyone_at')
          .first<{ id: string | number }>('id');
        if (parent) replyToId = parent.id;
      }

      const [message] = await trx('messages')
        .insert({
          uuid: newPublicId(),
          conversation_id: data.conversationId,
          sender_id: data.senderId,
          type,
          body,
          client_message_id: data.clientMessageId ?? null,
          reply_to_id: replyToId,
          meta: Object.keys(meta).length ? meta : null,
        })
        .returning([
          'id',
          'uuid',
          'conversation_id',
          'sender_id',
          'type',
          'body',
          'reply_to_id',
          'is_edited',
          'edited_at',
          'meta',
          'created_at',
          'client_message_id',
        ]);

      if (data.poll) {
        await this.insertPollInTrx(trx, {
          conversationId: data.conversationId,
          messageId: String(message.id),
          poll: data.poll,
        });
      }

      if (data.mediaIds?.length) {
        await this.insertMessageMediasInTrx(trx, {
          conversationId: data.conversationId,
          messageId: String(message.id),
          senderId: data.senderId,
          mediaIds: data.mediaIds,
        });
      } else if (data.copyMediasFrom) {
        await this.copyMessageMediasInTrx(trx, {
          fromConversationId: data.copyMediasFrom.conversationId,
          fromMessageId: data.copyMediasFrom.messageId,
          toConversationId: data.conversationId,
          toMessageId: String(message.id),
        });
      }

      if (hideFrom.length) {
        await trx('message_user_deletes').insert(
          hideFrom.map((userId) => ({
            conversation_id: data.conversationId,
            message_id: message.id,
            user_id: userId,
          })),
        );
      }

      // Only-forward: concurrent rapid sends must not let an older TX overwrite
      // last_message_* after a newer message already committed.
      await trx.raw(
        `
        UPDATE conversations
        SET
          last_message_id = CASE
            WHEN last_message_id IS NULL OR last_message_id < ? THEN ?
            ELSE last_message_id
          END,
          last_message_at = CASE
            WHEN last_message_id IS NULL OR last_message_id < ? THEN ?
            ELSE last_message_at
          END,
          last_message_preview = CASE
            WHEN last_message_id IS NULL OR last_message_id < ? THEN ?
            ELSE last_message_preview
          END,
          last_message_type = CASE
            WHEN last_message_id IS NULL OR last_message_id < ? THEN ?
            ELSE last_message_type
          END,
          last_sender_id = CASE
            WHEN last_message_id IS NULL OR last_message_id < ? THEN ?
            ELSE last_sender_id
          END,
          updated_at = CASE
            WHEN last_message_id IS NULL OR last_message_id < ? THEN CURRENT_TIMESTAMP
            ELSE updated_at
          END
        WHERE id = ?
        `,
        [
          message.id,
          message.id,
          message.id,
          message.created_at,
          message.id,
          preview,
          message.id,
          type,
          message.id,
          data.senderId,
          message.id,
          data.conversationId,
        ],
      );

      if (isShadow) {
        // Sender only: show in their inbox; do not bump peer unread / re-open chat
        await trx.raw(
          `
          UPDATE conversation_settings
          SET
            deleted_at = NULL,
            sort_at = CASE
              WHEN sort_at IS NULL OR sort_at < ? THEN ?
              ELSE sort_at
            END,
            unread_count = 0,
            last_read_message_id = CASE
              WHEN ? AND (last_read_message_id IS NULL OR last_read_message_id < ?) THEN ?
              ELSE last_read_message_id
            END,
            last_read_at = CASE
              WHEN ? AND (last_read_message_id IS NULL OR last_read_message_id < ?) THEN ?
              ELSE last_read_at
            END,
            last_delivered_message_id = CASE
              WHEN last_delivered_message_id IS NULL OR last_delivered_message_id < ? THEN ?
              ELSE last_delivered_message_id
            END,
            last_delivered_at = CASE
              WHEN last_delivered_message_id IS NULL OR last_delivered_message_id < ? THEN ?
              ELSE last_delivered_at
            END,
            updated_at = ?
          WHERE conversation_id = ?
            AND user_id = ?
          `,
          [
            message.created_at,
            message.created_at,
            advanceSenderRead,
            message.id,
            message.id,
            advanceSenderRead,
            message.id,
            message.created_at,
            message.id,
            message.id,
            message.id,
            message.created_at,
            message.created_at,
            data.conversationId,
            data.senderId,
          ],
        );
      } else {
        await trx.raw(
          `
          UPDATE conversation_settings
          SET
            deleted_at = NULL,
            sort_at = CASE
              WHEN sort_at IS NULL OR sort_at < ? THEN ?
              ELSE sort_at
            END,
            unread_count = CASE
              WHEN user_id = ? THEN 0
              ELSE CASE
                WHEN deleted_at IS NOT NULL THEN 1
                ELSE unread_count + 1
              END
            END,
            last_read_message_id = CASE
              WHEN user_id = ? AND ? AND (last_read_message_id IS NULL OR last_read_message_id < ?) THEN ?
              ELSE last_read_message_id
            END,
            last_read_at = CASE
              WHEN user_id = ? AND ? AND (last_read_message_id IS NULL OR last_read_message_id < ?) THEN ?
              ELSE last_read_at
            END,
            last_delivered_message_id = CASE
              WHEN user_id = ? AND (last_delivered_message_id IS NULL OR last_delivered_message_id < ?) THEN ?
              ELSE last_delivered_message_id
            END,
            last_delivered_at = CASE
              WHEN user_id = ? AND (last_delivered_message_id IS NULL OR last_delivered_message_id < ?) THEN ?
              ELSE last_delivered_at
            END,
            updated_at = ?
          WHERE conversation_id = ?
          `,
          [
            message.created_at,
            message.created_at,
            data.senderId,
            data.senderId,
            advanceSenderRead,
            message.id,
            message.id,
            data.senderId,
            advanceSenderRead,
            message.id,
            message.created_at,
            data.senderId,
            message.id,
            message.id,
            data.senderId,
            message.id,
            message.created_at,
            message.created_at,
            data.conversationId,
          ],
        );
      }

      await trx('chat_outbox').insert({
        event_type: 'message.created',
        conversation_id: data.conversationId,
        message_id: message.id,
        actor_id: data.senderId,
        payload: {
          conversationId: data.conversationId,
          messageId: message.id,
          uuid: message.uuid,
          senderId: data.senderId,
          type,
          body,
          preview,
          createdAt: message.created_at,
          shadowHiddenFrom: hideFrom,
        },
      });

      return message;
    });
  }

  private async copyMessageMediasInTrx(
    trx: Knex.Transaction,
    data: {
      fromConversationId: string;
      fromMessageId: string;
      toConversationId: string;
      toMessageId: string;
    },
  ) {
    const rows = (await trx('message_medias')
      .where({
        conversation_id: data.fromConversationId,
        message_id: data.fromMessageId,
      })
      .whereNull('deleted_at')
      .orderBy('position', 'asc')
      .select(
        'media_id',
        'kind',
        'file_path',
        'thumbnail_path',
        'mime_type',
        'size_bytes',
        'duration_ms',
        'width',
        'height',
        'position',
      )) as Array<{
      media_id: string | number | null;
      kind: string;
      file_path: string;
      thumbnail_path: string | null;
      mime_type: string | null;
      size_bytes: string | number | null;
      duration_ms: number | null;
      width: number | null;
      height: number | null;
      position: number;
    }>;

    if (!rows.length) {
      throw new Error('MEDIA_INVALID');
    }

    await trx('message_medias').insert(
      rows.map((row, position) => ({
        uuid: newPublicId(),
        conversation_id: data.toConversationId,
        message_id: data.toMessageId,
        media_id: row.media_id,
        kind: row.kind,
        file_path: row.file_path,
        thumbnail_path: row.thumbnail_path,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes,
        duration_ms: row.duration_ms,
        width: row.width,
        height: row.height,
        position: row.position ?? position,
      })),
    );
  }

  private async insertMessageMediasInTrx(
    trx: Knex.Transaction,
    data: {
      conversationId: string;
      messageId: string;
      senderId: string;
      mediaIds: string[];
    },
  ) {
    const mediaRows = await trx('media')
      .whereIn('uuid', data.mediaIds)
      .where({ user_id: data.senderId, status: 'ready' })
      .whereNull('deleted_at')
      .select(
        'id',
        'uuid',
        'key',
        'kind',
        'content_type',
        'size_bytes',
        'width',
        'height',
        'thumbnail_key',
        'playback_key',
        'duration_ms',
      );

    const byUuid = new Map(
      (mediaRows as Array<{ uuid: string }>).map((m) => [m.uuid, m]),
    );
    const links = data.mediaIds
      .map((mediaUuid, position) => {
        const media = byUuid.get(mediaUuid) as
          | {
              id: string | number;
              key: string;
              kind: string;
              content_type: string | null;
              size_bytes: string | number | null;
              width: number | null;
              height: number | null;
              thumbnail_key: string | null;
              playback_key: string | null;
              duration_ms: number | null;
            }
          | undefined;
        if (!media) return null;
        const kind =
          media.kind === 'video'
            ? 'video'
            : media.kind === 'audio'
              ? 'audio'
              : media.kind === 'file'
                ? 'file'
                : 'image';
        const playbackKey =
          typeof media.playback_key === 'string' && media.playback_key.trim()
            ? media.playback_key.trim()
            : null;
        return {
          uuid: newPublicId(),
          conversation_id: data.conversationId,
          message_id: data.messageId,
          media_id: media.id,
          kind,
          file_path: playbackKey || media.key,
          thumbnail_path: media.thumbnail_key,
          mime_type: media.content_type,
          size_bytes: media.size_bytes,
          duration_ms: media.duration_ms,
          width: media.width,
          height: media.height,
          position,
        };
      })
      .filter(Boolean);

    if (links.length !== data.mediaIds.length) {
      throw new Error('MEDIA_INVALID');
    }
    if (links.length) {
      await trx('message_medias').insert(links);
    }
  }

  private async insertPollInTrx(
    trx: Knex.Transaction,
    data: {
      conversationId: string;
      messageId: string;
      poll: SendPollInput;
    },
  ) {
    const options = data.poll.options.map((t) => t.trim()).filter(Boolean);
    const [poll] = await trx('chat_polls')
      .insert({
        uuid: newPublicId(),
        conversation_id: data.conversationId,
        message_id: data.messageId,
        question: data.poll.question.trim(),
        allow_multiple: Boolean(data.poll.allowMultiple),
        is_anonymous: Boolean(data.poll.isAnonymous),
        closes_at: data.poll.closesAt ? new Date(data.poll.closesAt) : null,
        is_closed: false,
        total_votes: 0,
        version: 0,
      })
      .returning(['id']);

    await trx('chat_poll_options').insert(
      options.map((text, position) => ({
        uuid: newPublicId(),
        poll_id: poll.id,
        option_text: text,
        position,
        votes_count: 0,
      })),
    );
  }

  /** Fast thread page — keyset on id, lean columns, index-only friendly */
  async listMessages(
    conversationId: string,
    userId: string,
    limit: number,
    cursorId?: string,
  ): Promise<{ rows: ChatMessage[]; nextCursor: string | null }> {
    let query = this.db('messages as m')
      .where('m.conversation_id', conversationId)
      .whereNull('m.deleted_for_everyone_at')
      .whereNotExists(function hideDeletedForMe() {
        this.select(this.client.raw('1'))
          .from('message_user_deletes as d')
          .whereRaw('d.conversation_id = m.conversation_id')
          .andWhereRaw('d.message_id = m.id')
          .andWhere('d.user_id', userId);
      })
      .select([...MESSAGE_LIST_COLUMNS])
      .orderBy('m.id', 'desc')
      .limit(limit + 1);

    if (cursorId) {
      query = query.where('m.id', '<', cursorId);
    }

    const dbRows = await query;
    const hasMore = dbRows.length > limit;
    const pageRows = hasMore ? dbRows.slice(0, limit) : dbRows;

    const senderIds = [
      ...new Set(pageRows.map((r: { sender_id: string | number }) => String(r.sender_id))),
    ];
    const uuidById = await this.loadUserUuidsByIds(senderIds);

    const replyIds = [
      ...new Set(
        pageRows
          .map((r: { reply_to_id: string | number | null }) => r.reply_to_id)
          .filter((id): id is string | number => id != null),
      ),
    ];
    const replyByInternalId = new Map<
      string,
      {
        uuid: string;
        body: string | null;
        sender_id: string | number;
        type: string;
      }
    >();
    if (replyIds.length) {
      const replies = await this.db('messages')
        .where({ conversation_id: conversationId })
        .whereIn('id', replyIds)
        .select('id', 'uuid', 'body', 'sender_id', 'type');
      for (const r of replies as Array<{
        id: string | number;
        uuid: string;
        body: string | null;
        sender_id: string | number;
        type: string;
      }>) {
        replyByInternalId.set(String(r.id), r);
      }
      const replySenderIds = [
        ...new Set(replies.map((r: { sender_id: string | number }) => String(r.sender_id))),
      ];
      const replySenders = await this.loadUserUuidsByIds(replySenderIds);
      for (const [k, v] of replySenders) uuidById.set(k, v);
    }

    const pinnedRow = await this.db('message_pins')
      .where({ conversation_id: conversationId })
      .first<{ message_id: string | number }>('message_id');
    const pinnedMessageId =
      pinnedRow?.message_id != null ? String(pinnedRow.message_id) : null;

    const peerCursors = await this.getPeerReceiptCursors(conversationId, userId);

    // Own messages permanently hidden from peer(s) always stay single-tick
    const ownMessageIds = pageRows
      .filter((r: { sender_id: string | number }) => String(r.sender_id) === userId)
      .map((r: { id: string | number }) => String(r.id));
    const neverDeliveredIds = await this.loadMessageIdsHiddenFromOthers(
      conversationId,
      ownMessageIds,
      userId,
    );

    const convUuid = await this.db('conversations')
      .where({ id: conversationId })
      .first<{ uuid: string }>('uuid');

    const rows: ChatMessage[] = pageRows.map(
      (r: {
        id: string | number;
        uuid: string;
        sender_id: string | number;
        type: string;
        body: string | null;
        reply_to_id: string | number | null;
        is_edited: boolean;
        edited_at: Date | string | null;
        meta: Record<string, unknown> | null;
        created_at: Date | string;
        client_message_id?: string | null;
      }) => {
        const reply =
          r.reply_to_id == null
            ? null
            : (replyByInternalId.get(String(r.reply_to_id)) ?? null);
        const mine = String(r.sender_id) === userId;
        const internalId = BigInt(String(r.id));
        let receiptStatus: ChatMessage['receiptStatus'] = null;
        if (mine) {
          if (neverDeliveredIds.has(String(r.id))) {
            receiptStatus = 'sent';
          } else if (peerCursors.readId != null && internalId <= peerCursors.readId) {
            receiptStatus = 'read';
          } else if (
            peerCursors.deliveredId != null &&
            internalId <= peerCursors.deliveredId
          ) {
            receiptStatus = 'delivered';
          } else {
            receiptStatus = 'sent';
          }
        }
        const meta = r.meta && typeof r.meta === 'object' ? r.meta : null;
        return {
          id: r.uuid,
          conversationId: convUuid?.uuid ?? '',
          senderId: uuidById.get(String(r.sender_id)) ?? '',
          type: r.type,
          body: r.body,
          replyToId: reply?.uuid ?? null,
          replyTo: reply
            ? {
                id: reply.uuid,
                body: reply.body,
                senderId: uuidById.get(String(reply.sender_id)) ?? '',
                type: reply.type,
              }
            : null,
          isEdited: Boolean(r.is_edited),
          editedAt: toIso(r.edited_at),
          isPinned: pinnedMessageId === String(r.id),
          isForwarded: Boolean(meta && meta.forwarded === true),
          receiptStatus,
          createdAt: toIso(r.created_at) as string,
          location: parseLocationFromMeta(meta),
          sharedPost: parseSharedPostFromMeta(meta),
          system: parseSystemFromMeta(meta),
          clientMessageId: r.client_message_id ?? null,
        };
      },
    );

    const pollMessageIds = pageRows
      .filter((r: { type: string }) => r.type === 'poll')
      .map((r: { id: string | number }) => String(r.id));
    if (pollMessageIds.length) {
      const pollByMessageId = await this.loadPollSummariesForMessages(
        conversationId,
        pollMessageIds,
        userId,
      );
      for (let i = 0; i < pageRows.length; i += 1) {
        const raw = pageRows[i] as { id: string | number; type: string };
        if (raw.type !== 'poll') continue;
        rows[i]!.poll = pollByMessageId.get(String(raw.id)) ?? null;
      }
    }

    const mediaMessageIds = pageRows
      .filter(
        (r: { type: string }) =>
          r.type === 'image' ||
          r.type === 'video' ||
          r.type === 'audio' ||
          r.type === 'voice',
      )
      .map((r: { id: string | number }) => String(r.id));
    if (mediaMessageIds.length) {
      const mediasByMessage = await this.loadMediasForMessages(
        conversationId,
        mediaMessageIds,
      );
      for (let i = 0; i < pageRows.length; i += 1) {
        const raw = pageRows[i] as { id: string | number; type: string };
        if (
          raw.type !== 'image' &&
          raw.type !== 'video' &&
          raw.type !== 'audio' &&
          raw.type !== 'voice'
        ) {
          continue;
        }
        rows[i]!.medias = mediasByMessage.get(String(raw.id)) ?? [];
      }
    }

    const allMessageIds = pageRows.map((r: { id: string | number }) =>
      String(r.id),
    );
    if (allMessageIds.length) {
      const reactionsByMessage = await this.loadReactionSummariesForMessages(
        conversationId,
        allMessageIds,
        userId,
      );
      for (let i = 0; i < pageRows.length; i += 1) {
        const raw = pageRows[i] as { id: string | number };
        const packed = reactionsByMessage.get(String(raw.id));
        rows[i]!.reactions = packed?.reactions ?? [];
        rows[i]!.myReaction = packed?.myReaction ?? null;
      }

      const translationsByMessage = await this.loadTranslationsForMessages(
        allMessageIds,
        userId,
      );
      for (let i = 0; i < pageRows.length; i += 1) {
        const raw = pageRows[i] as { id: string | number };
        rows[i]!.translation =
          translationsByMessage.get(String(raw.id)) ?? null;
      }
    }

    const last = pageRows[pageRows.length - 1] as { id: string | number } | undefined;
    const nextCursor = hasMore && last ? String(last.id) : null;

    return { rows, nextCursor };
  }

  async loadTranslationsForMessages(
    messageIds: string[],
    viewerUserId: string,
  ): Promise<Map<string, ChatMessageTranslation>> {
    const map = new Map<string, ChatMessageTranslation>();
    if (!messageIds.length) return map;

    const rows = (await this.db('message_translations')
      .where({ user_id: viewerUserId })
      .whereIn('message_id', messageIds)
      .select(
        'message_id',
        'target_language',
        'source_language',
        'translated_text',
      )) as Array<{
      message_id: string | number;
      target_language: string;
      source_language: string | null;
      translated_text: string;
    }>;

    for (const r of rows) {
      map.set(String(r.message_id), {
        text: r.translated_text,
        language: r.target_language,
        sourceLanguage: r.source_language,
      });
    }
    return map;
  }

  async upsertMessageTranslation(data: {
    conversationId: string;
    messageId: string;
    userId: string;
    targetLanguage: string;
    sourceLanguage: string | null;
    translatedText: string;
  }): Promise<ChatMessageTranslation> {
    const existing = await this.db('message_translations')
      .where({
        message_id: data.messageId,
        user_id: data.userId,
      })
      .first<{ id: string | number }>('id');

    if (existing) {
      await this.db('message_translations')
        .where({ id: existing.id })
        .update({
          target_language: data.targetLanguage,
          source_language: data.sourceLanguage,
          translated_text: data.translatedText,
          updated_at: this.db.fn.now(),
        });
    } else {
      await this.db('message_translations').insert({
        conversation_id: data.conversationId,
        message_id: data.messageId,
        user_id: data.userId,
        target_language: data.targetLanguage,
        source_language: data.sourceLanguage,
        translated_text: data.translatedText,
      });
    }

    return {
      text: data.translatedText,
      language: data.targetLanguage,
      sourceLanguage: data.sourceLanguage,
    };
  }

  async loadReactionSummariesForMessages(
    conversationId: string,
    messageIds: string[],
    viewerUserId: string,
  ): Promise<
    Map<string, { reactions: ChatMessageReaction[]; myReaction: string | null }>
  > {
    const map = new Map<
      string,
      { reactions: ChatMessageReaction[]; myReaction: string | null }
    >();
    if (!messageIds.length) return map;

    const rows = (await this.db('message_reactions')
      .where({ conversation_id: conversationId })
      .whereIn('message_id', messageIds)
      .whereNull('deleted_at')
      .select('message_id', 'user_id', 'emoji')) as Array<{
      message_id: string | number;
      user_id: string | number;
      emoji: string;
    }>;

    const buckets = new Map<
      string,
      Map<string, { count: number; reactedByMe: boolean }>
    >();
    const myByMessage = new Map<string, string>();

    for (const r of rows) {
      const mid = String(r.message_id);
      const emoji = r.emoji;
      if (!buckets.has(mid)) buckets.set(mid, new Map());
      const byEmoji = buckets.get(mid)!;
      const cur = byEmoji.get(emoji) ?? { count: 0, reactedByMe: false };
      cur.count += 1;
      if (String(r.user_id) === String(viewerUserId)) {
        cur.reactedByMe = true;
        myByMessage.set(mid, emoji);
      }
      byEmoji.set(emoji, cur);
    }

    for (const mid of messageIds) {
      const byEmoji = buckets.get(mid);
      const reactions: ChatMessageReaction[] = byEmoji
        ? [...byEmoji.entries()]
            .map(([emoji, v]) => ({
              emoji,
              count: v.count,
              reactedByMe: v.reactedByMe,
            }))
            .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji))
        : [];
      map.set(mid, {
        reactions,
        myReaction: myByMessage.get(mid) ?? null,
      });
    }
    return map;
  }

  async setMessageReaction(data: {
    conversationId: string;
    messageId: string;
    userId: string;
    emoji: string;
  }): Promise<{
    emoji: string | null;
    reactions: ChatMessageReaction[];
    myReaction: string | null;
  }> {
    const existing = await this.db('message_reactions')
      .where({
        conversation_id: data.conversationId,
        message_id: data.messageId,
        user_id: data.userId,
      })
      .whereNull('deleted_at')
      .first<{ id: string | number; emoji: string }>('id', 'emoji');

    const nextEmoji = data.emoji.trim();
    if (!nextEmoji) {
      throw new Error('EMOJI_REQUIRED');
    }

    // Same emoji again → toggle off
    if (existing && existing.emoji === nextEmoji) {
      await this.db('message_reactions')
        .where({ id: existing.id })
        .update({ deleted_at: this.db.fn.now(), updated_at: this.db.fn.now() });
    } else if (existing) {
      await this.db('message_reactions')
        .where({ id: existing.id })
        .update({
          emoji: nextEmoji,
          updated_at: this.db.fn.now(),
          deleted_at: null,
        });
    } else {
      // Soft-deleted row for this pair? revive it
      const soft = await this.db('message_reactions')
        .where({
          conversation_id: data.conversationId,
          message_id: data.messageId,
          user_id: data.userId,
        })
        .whereNotNull('deleted_at')
        .orderBy('id', 'desc')
        .first<{ id: string | number }>('id');
      if (soft) {
        await this.db('message_reactions').where({ id: soft.id }).update({
          emoji: nextEmoji,
          deleted_at: null,
          updated_at: this.db.fn.now(),
        });
      } else {
        await this.db('message_reactions').insert({
          conversation_id: data.conversationId,
          message_id: data.messageId,
          user_id: data.userId,
          emoji: nextEmoji,
        });
      }
    }

    const packed = await this.loadReactionSummariesForMessages(
      data.conversationId,
      [data.messageId],
      data.userId,
    );
    const summary = packed.get(data.messageId) ?? {
      reactions: [],
      myReaction: null,
    };
    return {
      emoji: summary.myReaction,
      reactions: summary.reactions,
      myReaction: summary.myReaction,
    };
  }

  /** MIN of other participants' cursors (WhatsApp-strict: all must reach). */
  async getPeerReceiptCursors(
    conversationId: string,
    viewerUserId: string,
  ): Promise<{ deliveredId: bigint | null; readId: bigint | null }> {
    const map = await this.loadPeerReceiptCursors(
      [conversationId],
      viewerUserId,
    );
    return (
      map.get(String(conversationId)) ?? {
        deliveredId: null,
        readId: null,
      }
    );
  }

  async markDelivered(conversationId: string, userId: string, messageId: string) {
    return this.db('conversation_settings')
      .where({ conversation_id: conversationId, user_id: userId })
      .whereNull('deleted_at')
      .where(function onlyForward() {
        this.whereNull('last_delivered_message_id').orWhere(
          'last_delivered_message_id',
          '<',
          messageId,
        );
      })
      .update({
        last_delivered_message_id: messageId,
        last_delivered_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
  }

  async markSeen(conversationId: string, userId: string, messageId: string) {
    // Only-forward cursors: overlapping mark-read from rapid messages must not
    // rewind last_read / last_delivered (that left later ticks stuck on sent).
    return this.db.raw(
      `
      UPDATE conversation_settings
      SET
        last_read_message_id = CASE
          WHEN last_read_message_id IS NULL OR last_read_message_id < ? THEN ?
          ELSE last_read_message_id
        END,
        last_read_at = CASE
          WHEN last_read_message_id IS NULL OR last_read_message_id < ? THEN CURRENT_TIMESTAMP
          ELSE last_read_at
        END,
        last_delivered_message_id = CASE
          WHEN last_delivered_message_id IS NULL OR last_delivered_message_id < ? THEN ?
          ELSE last_delivered_message_id
        END,
        last_delivered_at = CASE
          WHEN last_delivered_message_id IS NULL OR last_delivered_message_id < ? THEN CURRENT_TIMESTAMP
          ELSE last_delivered_at
        END,
        unread_count = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE conversation_id = ?
        AND user_id = ?
        AND deleted_at IS NULL
      `,
      [
        messageId,
        messageId,
        messageId,
        messageId,
        messageId,
        messageId,
        conversationId,
        userId,
      ],
    );
  }

  /** Clear unread without publishing read receipts (readReceipts privacy off). */
  async clearUnreadOnly(
    conversationId: string,
    userId: string,
    messageId: string,
  ) {
    return this.db.raw(
      `
      UPDATE conversation_settings
      SET
        last_delivered_message_id = CASE
          WHEN last_delivered_message_id IS NULL OR last_delivered_message_id < ? THEN ?
          ELSE last_delivered_message_id
        END,
        last_delivered_at = CASE
          WHEN last_delivered_message_id IS NULL OR last_delivered_message_id < ? THEN CURRENT_TIMESTAMP
          ELSE last_delivered_at
        END,
        unread_count = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE conversation_id = ?
        AND user_id = ?
        AND deleted_at IS NULL
      `,
      [messageId, messageId, messageId, conversationId, userId],
    );
  }

  async markUnread(conversationId: string, userId: string): Promise<number> {
    const updated = await this.db('conversation_settings')
      .where({ conversation_id: conversationId, user_id: userId })
      .whereNull('deleted_at')
      .update({
        unread_count: this.db.raw('GREATEST(unread_count, 1)'),
        updated_at: this.db.fn.now(),
      });
    if (!updated) return 0;
    const row = await this.db('conversation_settings')
      .where({ conversation_id: conversationId, user_id: userId })
      .whereNull('deleted_at')
      .first<{ unread_count: number }>('unread_count');
    return Number(row?.unread_count ?? 1);
  }

  async isParticipant(conversationId: string, userId: string) {
    const row = await this.db('conversation_participants')
      .where({
        conversation_id: conversationId,
        user_id: userId,
        is_active: true,
      })
      .first('id');
    return Boolean(row);
  }

  async mapSavedMessage(
    message: {
      uuid: string;
      conversation_id: string | number;
      sender_id: string | number;
      type: string;
      body: string | null;
      reply_to_id: string | number | null;
      is_edited?: boolean;
      edited_at?: Date | string | null;
      meta?: Record<string, unknown> | null;
      created_at: Date | string;
      id?: string | number;
      client_message_id?: string | null;
    },
    opts?: {
      conversationUuid?: string;
      senderUuid?: string;
      skipPin?: boolean;
    },
  ): Promise<ChatMessage> {
    const [convUuid, senderUuid, replyRow] = await Promise.all([
      opts?.conversationUuid
        ? Promise.resolve(opts.conversationUuid)
        : this.db('conversations')
            .where({ id: message.conversation_id })
            .first<{ uuid: string }>('uuid')
            .then((row) => row?.uuid ?? ''),
      opts?.senderUuid
        ? Promise.resolve(opts.senderUuid)
        : this.findUserUuidById(String(message.sender_id)),
      message.reply_to_id
        ? this.db('messages')
            .where({
              conversation_id: message.conversation_id,
              id: message.reply_to_id,
            })
            .first<{
              uuid: string;
              body: string | null;
              sender_id: string | number;
              type: string;
            }>('uuid', 'body', 'sender_id', 'type')
        : Promise.resolve(null),
    ]);

    let replyTo: ChatMessage['replyTo'] = null;
    if (replyRow) {
      const replySender = await this.findUserUuidById(String(replyRow.sender_id));
      replyTo = {
        id: replyRow.uuid,
        body: replyRow.body,
        senderId: replySender ?? '',
        type: replyRow.type,
      };
    }

    const meta =
      message.meta && typeof message.meta === 'object' ? message.meta : null;

    let isPinned = false;
    if (!opts?.skipPin && message.id != null) {
      const pin = await this.db('message_pins')
        .where({
          conversation_id: message.conversation_id,
          message_id: message.id,
        })
        .first('id');
      isPinned = Boolean(pin);
    }

    const mapped: ChatMessage = {
      id: message.uuid,
      conversationId: convUuid,
      senderId: senderUuid ?? '',
      type: message.type,
      body: message.body,
      replyToId: replyRow?.uuid ?? null,
      replyTo,
      isEdited: Boolean(message.is_edited),
      editedAt: toIso(message.edited_at),
      isPinned,
      isForwarded: Boolean(meta && meta.forwarded === true),
      receiptStatus: 'sent',
      createdAt: toIso(message.created_at) as string,
      location: parseLocationFromMeta(meta),
      sharedPost: parseSharedPostFromMeta(meta),
      system: parseSystemFromMeta(meta),
      clientMessageId: message.client_message_id ?? null,
    };

    if (message.type === 'poll' && message.id != null) {
      const polls = await this.loadPollSummariesForMessages(
        String(message.conversation_id),
        [String(message.id)],
        String(message.sender_id),
      );
      mapped.poll = polls.get(String(message.id)) ?? null;
    }

    if (
      (message.type === 'image' ||
        message.type === 'video' ||
        message.type === 'audio' ||
        message.type === 'voice') &&
      message.id != null
    ) {
      const medias = await this.loadMediasForMessages(
        String(message.conversation_id),
        [String(message.id)],
      );
      mapped.medias = medias.get(String(message.id)) ?? [];
    }

    return mapped;
  }

  async loadMediasForMessages(
    conversationId: string,
    messageIds: string[],
  ): Promise<Map<string, ChatMessageMedia[]>> {
    const result = new Map<string, ChatMessageMedia[]>();
    if (!messageIds.length) return result;

    const rows = (await this.db('message_medias')
      .where({ conversation_id: conversationId })
      .whereIn('message_id', messageIds)
      .whereNull('deleted_at')
      .orderBy([
        { column: 'message_id', order: 'asc' },
        { column: 'position', order: 'asc' },
      ])
      .select(
        'uuid',
        'message_id',
        'kind',
        'file_path',
        'thumbnail_path',
        'mime_type',
        'width',
        'height',
      )) as Array<{
      uuid: string;
      message_id: string | number;
      kind: ChatMessageMedia['kind'];
      file_path: string;
      thumbnail_path: string | null;
      mime_type: string | null;
      width: number | null;
      height: number | null;
    }>;

    for (const row of rows) {
      const key = String(row.message_id);
      const list = result.get(key) ?? [];
      list.push({
        id: row.uuid,
        kind: row.kind,
        url: publicUrl(row.file_path),
        thumbnailUrl: row.thumbnail_path ? publicUrl(row.thumbnail_path) : null,
        width: row.width,
        height: row.height,
        mimeType: row.mime_type,
      });
      result.set(key, list);
    }
    return result;
  }

  async loadPollSummariesForMessages(
    conversationId: string,
    messageIds: string[],
    viewerUserId: string,
  ): Promise<Map<string, ChatPollSummary>> {
    const result = new Map<string, ChatPollSummary>();
    if (!messageIds.length) return result;

    const polls = (await this.db('chat_polls as p')
      .join('messages as m', function joinMsg() {
        this.on('m.conversation_id', '=', 'p.conversation_id').andOn(
          'm.id',
          '=',
          'p.message_id',
        );
      })
      .where({ 'p.conversation_id': conversationId })
      .whereIn('p.message_id', messageIds)
      .select(
        'p.id',
        'p.uuid',
        'p.message_id',
        'p.question',
        'p.allow_multiple',
        'p.is_anonymous',
        'p.is_closed',
        'p.closes_at',
        'p.total_votes',
        'p.version',
        'm.sender_id',
      )) as Array<{
      id: string | number;
      uuid: string;
      message_id: string | number;
      question: string;
      allow_multiple: boolean;
      is_anonymous: boolean;
      is_closed: boolean;
      closes_at: Date | string | null;
      total_votes: string | number;
      version: number;
      sender_id: string | number;
    }>;

    if (!polls.length) return result;

    const pollIds = polls.map((p) => String(p.id));
    const creatorIds = [...new Set(polls.map((p) => String(p.sender_id)))];
    const creatorUuidById = await this.loadUserUuidsByIds(creatorIds);

    const options = (await this.db('chat_poll_options')
      .whereIn('poll_id', pollIds)
      .orderBy([
        { column: 'poll_id', order: 'asc' },
        { column: 'position', order: 'asc' },
      ])
      .select('id', 'uuid', 'poll_id', 'option_text', 'votes_count')) as Array<{
      id: string | number;
      uuid: string;
      poll_id: string | number;
      option_text: string;
      votes_count: string | number;
    }>;

    const myVotes = (await this.db('chat_poll_votes as v')
      .join('chat_poll_options as o', 'o.id', 'v.option_id')
      .whereIn('v.poll_id', pollIds)
      .andWhere('v.user_id', viewerUserId)
      .select('v.poll_id', 'o.uuid as option_uuid')) as Array<{
      poll_id: string | number;
      option_uuid: string;
    }>;

    const myByPoll = new Map<string, string[]>();
    for (const v of myVotes) {
      const key = String(v.poll_id);
      const list = myByPoll.get(key) ?? [];
      list.push(v.option_uuid);
      myByPoll.set(key, list);
    }

    const optionsByPoll = new Map<string, typeof options>();
    for (const o of options) {
      const key = String(o.poll_id);
      const list = optionsByPoll.get(key) ?? [];
      list.push(o);
      optionsByPoll.set(key, list);
    }

    for (const poll of polls) {
      const opts = optionsByPoll.get(String(poll.id)) ?? [];
      const total = Number(poll.total_votes) || 0;
      const closed =
        Boolean(poll.is_closed) ||
        (poll.closes_at != null && new Date(poll.closes_at).getTime() <= Date.now());

      result.set(String(poll.message_id), {
        id: poll.uuid,
        question: poll.question,
        allowMultiple: Boolean(poll.allow_multiple),
        isAnonymous: Boolean(poll.is_anonymous),
        isClosed: closed,
        closesAt: toIso(poll.closes_at),
        totalVotes: total,
        version: Number(poll.version) || 0,
        options: opts.map((o) => {
          const votes = Number(o.votes_count) || 0;
          return {
            id: o.uuid,
            text: o.option_text,
            votesCount: votes,
            percent: total > 0 ? Math.round((votes / total) * 100) : 0,
          };
        }),
        myOptionIds: myByPoll.get(String(poll.id)) ?? [],
        createdBy: creatorUuidById.get(String(poll.sender_id)) ?? null,
      });
    }

    return result;
  }

  async getPollSummaryByUuid(
    pollUuid: string,
    viewerUserId: string,
  ): Promise<(ChatPollSummary & { conversationId: string; messageId: string }) | null> {
    const poll = await this.db('chat_polls')
      .where({ uuid: pollUuid })
      .first<{
        id: string | number;
        uuid: string;
        conversation_id: string | number;
        message_id: string | number;
        question: string;
        allow_multiple: boolean;
        is_anonymous: boolean;
        is_closed: boolean;
        closes_at: Date | string | null;
        total_votes: string | number;
        version: number;
      }>();
    if (!poll) return null;

    const map = await this.loadPollSummariesForMessages(
      String(poll.conversation_id),
      [String(poll.message_id)],
      viewerUserId,
    );
    const summary = map.get(String(poll.message_id));
    if (!summary) return null;
    return {
      ...summary,
      conversationId: String(poll.conversation_id),
      messageId: String(poll.message_id),
    };
  }

  async votePoll(data: {
    pollUuid: string;
    userId: string;
    optionUuids: string[];
  }): Promise<ChatPollSummary> {
    return this.db.transaction(async (trx) => {
      const poll = await trx('chat_polls')
        .where({ uuid: data.pollUuid })
        .forUpdate()
        .first<{
          id: string | number;
          conversation_id: string | number;
          message_id: string | number;
          allow_multiple: boolean;
          is_closed: boolean;
          closes_at: Date | string | null;
        }>();
      if (!poll) {
        throw new Error('POLL_NOT_FOUND');
      }
      if (
        poll.is_closed ||
        (poll.closes_at != null && new Date(poll.closes_at).getTime() <= Date.now())
      ) {
        throw new Error('POLL_CLOSED');
      }

      const options = (await trx('chat_poll_options')
        .where({ poll_id: poll.id })
        .whereIn('uuid', data.optionUuids)
        .select('id', 'uuid')) as Array<{ id: string | number; uuid: string }>;

      if (options.length !== new Set(data.optionUuids).size) {
        throw new Error('POLL_OPTION_INVALID');
      }
      if (!poll.allow_multiple && options.length !== 1) {
        throw new Error('POLL_SINGLE_ONLY');
      }

      const existing = (await trx('chat_poll_votes')
        .where({ poll_id: poll.id, user_id: data.userId })
        .select('option_id')) as Array<{ option_id: string | number }>;

      const existingIds = existing.map((e) => String(e.option_id));
      const nextIds = options.map((o) => String(o.id));

      // Remove old votes (change vote / clear multi)
      if (existingIds.length) {
        await trx('chat_poll_votes')
          .where({ poll_id: poll.id, user_id: data.userId })
          .del();
        await trx('chat_poll_options')
          .whereIn('id', existingIds)
          .update({
            votes_count: trx.raw('GREATEST(votes_count - 1, 0)'),
            updated_at: trx.fn.now(),
          });
        await trx('chat_polls')
          .where({ id: poll.id })
          .update({
            total_votes: trx.raw('GREATEST(total_votes - ?, 0)', [existingIds.length]),
            updated_at: trx.fn.now(),
          });
      }

      await trx('chat_poll_votes').insert(
        nextIds.map((optionId) => ({
          poll_id: poll.id,
          option_id: optionId,
          user_id: data.userId,
        })),
      );
      await trx('chat_poll_options')
        .whereIn('id', nextIds)
        .update({
          votes_count: trx.raw('votes_count + 1'),
          updated_at: trx.fn.now(),
        });
      await trx('chat_polls')
        .where({ id: poll.id })
        .update({
          total_votes: trx.raw('total_votes + ?', [nextIds.length]),
          version: trx.raw('version + 1'),
          updated_at: trx.fn.now(),
        });

      await trx('chat_outbox').insert({
        event_type: 'poll.voted',
        conversation_id: poll.conversation_id,
        message_id: poll.message_id,
        actor_id: data.userId,
        payload: {
          pollUuid: data.pollUuid,
          conversationId: poll.conversation_id,
          messageId: poll.message_id,
        },
      });

      return String(poll.message_id);
    }).then(async (messageId) => {
      const pollRow = await this.db('chat_polls')
        .where({ uuid: data.pollUuid })
        .first<{ conversation_id: string | number }>('conversation_id');
      const summaries = await this.loadPollSummariesForMessages(
        String(pollRow!.conversation_id),
        [messageId],
        data.userId,
      );
      const summary = summaries.get(messageId);
      if (!summary) throw new Error('POLL_NOT_FOUND');
      return summary;
    });
  }

  async closePoll(data: {
    pollUuid: string;
    userId: string;
  }): Promise<ChatPollSummary> {
    const poll = await this.db('chat_polls')
      .where({ uuid: data.pollUuid })
      .first<{
        id: string | number;
        conversation_id: string | number;
        message_id: string | number;
        is_closed: boolean;
      }>();
    if (!poll) throw new Error('POLL_NOT_FOUND');

    const message = await this.db('messages')
      .where({
        conversation_id: poll.conversation_id,
        id: poll.message_id,
      })
      .first<{ sender_id: string | number }>('sender_id');
    if (!message) throw new Error('POLL_NOT_FOUND');

    const isCreator = String(message.sender_id) === data.userId;
    const role = await this.getParticipantRole(
      String(poll.conversation_id),
      data.userId,
    );
    if (!isCreator && role !== 'admin') {
      throw new Error('POLL_FORBIDDEN');
    }

    if (!poll.is_closed) {
      await this.db('chat_polls')
        .where({ id: poll.id })
        .update({
          is_closed: true,
          version: this.db.raw('version + 1'),
          updated_at: this.db.fn.now(),
        });

      await this.db('chat_outbox').insert({
        event_type: 'poll.closed',
        conversation_id: poll.conversation_id,
        message_id: poll.message_id,
        actor_id: data.userId,
        payload: {
          pollUuid: data.pollUuid,
          conversationId: poll.conversation_id,
          messageId: poll.message_id,
        },
      });
    }

    const summaries = await this.loadPollSummariesForMessages(
      String(poll.conversation_id),
      [String(poll.message_id)],
      data.userId,
    );
    const summary = summaries.get(String(poll.message_id));
    if (!summary) throw new Error('POLL_NOT_FOUND');
    return summary;
  }

  async listPollVoters(data: {
    pollUuid: string;
    optionUuid: string;
    limit: number;
    cursor?: string;
  }): Promise<{ rows: ChatPollVoter[]; nextCursor: string | null }> {
    const poll = await this.db('chat_polls')
      .where({ uuid: data.pollUuid })
      .first<{ id: string | number; is_anonymous: boolean }>();
    if (!poll) throw new Error('POLL_NOT_FOUND');
    if (poll.is_anonymous) throw new Error('POLL_ANONYMOUS');

    const option = await this.db('chat_poll_options')
      .where({ poll_id: poll.id, uuid: data.optionUuid })
      .first<{ id: string | number }>('id');
    if (!option) throw new Error('POLL_OPTION_INVALID');

    let query = this.db('chat_poll_votes as v')
      .where({ 'v.poll_id': poll.id, 'v.option_id': option.id })
      .select('v.id', 'v.user_id', 'v.created_at')
      .orderBy([
        { column: 'v.created_at', order: 'desc' },
        { column: 'v.id', order: 'desc' },
      ])
      .limit(data.limit + 1);

    if (data.cursor) {
      const [createdAt, id] = data.cursor.split('|');
      if (createdAt && id) {
        query = query.whereRaw(
          '(v.created_at, v.id) < (?::timestamptz, ?::bigint)',
          [createdAt, id],
        );
      }
    }

    const voteRows = (await query) as Array<{
      id: string | number;
      user_id: string | number;
      created_at: Date | string;
    }>;
    const hasMore = voteRows.length > data.limit;
    const page = hasMore ? voteRows.slice(0, data.limit) : voteRows;
    const userIds = page.map((r) => String(r.user_id));

    const users = userIds.length
      ? ((await this.db('users as u')
          .leftJoin('user_details as d', function joinDetails() {
            this.on('d.user_id', '=', 'u.id').andOnNull('d.deleted_at');
          })
          .whereIn('u.id', userIds)
          .select(
            'u.id',
            'u.uuid',
            'd.username',
            'd.full_name',
            'd.profile_picture',
            'd.is_verified',
          )) as Array<{
          id: string | number;
          uuid: string;
          username: string | null;
          full_name: string | null;
          profile_picture: string | null;
          is_verified: boolean | null;
        }>)
      : [];

    const pictureMap = await resolveProfilePictureUrls(
      users.map((u) => u.profile_picture),
    );
    const byId = new Map(users.map((u) => [String(u.id), u]));

    const rows: ChatPollVoter[] = page.map((v) => {
      const u = byId.get(String(v.user_id));
      return {
        id: u?.uuid ?? '',
        username: u?.username ?? 'user',
        fullName: u?.full_name ?? null,
        profilePicture: pickProfilePictureUrl(u?.profile_picture ?? null, pictureMap),
        isVerified: Boolean(u?.is_verified),
        votedAt: toIso(v.created_at) as string,
      };
    });

    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? `${toIso(last.created_at)}|${last.id}`
        : null;

    return { rows, nextCursor };
  }

  private async loadMessageUuidsByIds(
    ids: Array<string | number>,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const unique = [...new Set(ids.map(String))];
    if (!unique.length) return map;

    const rows = await this.db('messages').whereIn('id', unique).select('id', 'uuid');
    for (const r of rows as Array<{ id: string | number; uuid: string }>) {
      map.set(String(r.id), r.uuid);
    }
    return map;
  }

  private async loadUserUuidsByIds(
    ids: string[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!ids.length) return map;
    const rows = await this.db('users').whereIn('id', ids).select('id', 'uuid');
    for (const r of rows as Array<{ id: string | number; uuid: string }>) {
      map.set(String(r.id), r.uuid);
    }
    return map;
  }

  private async loadDmPeers(
    conversationIds: Array<string | number>,
    viewerUserId: string,
  ): Promise<Map<string, ChatUserSummary>> {
    const map = new Map<string, ChatUserSummary>();
    if (!conversationIds.length) return map;

    const rows = await this.db('conversation_participants as cp')
      .join('users', 'users.id', 'cp.user_id')
      .join('user_details', 'user_details.user_id', 'users.id')
      .whereIn('cp.conversation_id', conversationIds)
      .where('cp.is_active', true)
      .whereNot('cp.user_id', viewerUserId)
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .select(
        'cp.conversation_id',
        'users.uuid',
        'user_details.username',
        'user_details.full_name',
        'user_details.profile_picture',
        'user_details.is_verified',
      );

    for (const r of rows as Array<{
      conversation_id: string | number;
      uuid: string;
      username: string;
      full_name: string | null;
      profile_picture: string | null;
      is_verified: boolean;
    }>) {
      map.set(String(r.conversation_id), {
        id: r.uuid,
        username: r.username,
        fullName: r.full_name,
        profilePicture: r.profile_picture,
        isVerified: Boolean(r.is_verified),
        ...EMPTY_CHAT_PRESENCE,
      });
    }

    const urls = await resolveProfilePictureUrls(
      [...map.values()].map((u) => u.profilePicture),
    );
    for (const [key, user] of map) {
      map.set(key, {
        ...user,
        profilePicture: pickProfilePictureUrl(user.profilePicture, urls),
      });
    }

    return map;
  }

  /** Peer (other members) read/delivered cursors for receipt ticks on inbox. */
  private async loadPeerReceiptCursors(
    conversationIds: Array<string | number>,
    viewerUserId: string,
  ): Promise<
    Map<string, { readId: bigint | null; deliveredId: bigint | null }>
  > {
    const map = new Map<
      string,
      { readId: bigint | null; deliveredId: bigint | null }
    >();
    if (!conversationIds.length) return map;

    const rows = await this.db('conversation_settings as cs')
      .leftJoin('message_privacy_settings as mps', function joinPrivacy() {
        this.on('mps.user_id', '=', 'cs.user_id').andOnNull('mps.deleted_at');
      })
      .whereIn('cs.conversation_id', conversationIds)
      .whereNot('cs.user_id', viewerUserId)
      .whereNull('cs.deleted_at')
      .select(
        'cs.conversation_id',
        'cs.last_read_message_id',
        'cs.last_delivered_message_id',
        'mps.read_receipts',
      );

    type Agg = {
      readId: bigint | null;
      deliveredId: bigint | null;
      readPeers: number;
    };
    const agg = new Map<string, Agg>();

    for (const r of rows as Array<{
      conversation_id: string | number;
      last_read_message_id: string | number | null;
      last_delivered_message_id: string | number | null;
      read_receipts: boolean | null;
    }>) {
      const key = String(r.conversation_id);
      const deliveredId =
        r.last_delivered_message_id != null
          ? BigInt(String(r.last_delivered_message_id))
          : null;
      // Missing privacy row → default on (same as PrivacyEnforcement).
      const receiptsOn = r.read_receipts == null ? true : Boolean(r.read_receipts);
      const readId =
        receiptsOn && r.last_read_message_id != null
          ? BigInt(String(r.last_read_message_id))
          : null;

      const existing = agg.get(key);
      if (!existing) {
        agg.set(key, {
          deliveredId,
          readId: receiptsOn ? readId : null,
          readPeers: receiptsOn ? 1 : 0,
        });
        continue;
      }

      existing.deliveredId =
        existing.deliveredId == null || deliveredId == null
          ? null
          : existing.deliveredId < deliveredId
            ? existing.deliveredId
            : deliveredId;

      if (receiptsOn) {
        if (existing.readPeers === 0) {
          existing.readId = readId;
        } else {
          existing.readId =
            existing.readId == null || readId == null
              ? null
              : existing.readId < readId
                ? existing.readId
                : readId;
        }
        existing.readPeers += 1;
      }
    }

    for (const [key, value] of agg) {
      map.set(key, {
        deliveredId: value.deliveredId,
        readId: value.readPeers > 0 ? value.readId : null,
      });
    }

    return map;
  }

  /**
   * Message ids that are permanently hidden from someone other than `senderUserId`
   * (shadow sends / delete-for-me by peers). Own receipts for these stay `sent`.
   */
  private async loadMessageIdsHiddenFromOthers(
    conversationId: string,
    messageIds: string[],
    senderUserId: string,
  ): Promise<Set<string>> {
    const unique = [...new Set(messageIds.filter(Boolean))];
    if (!unique.length) return new Set();

    const rows = await this.db('message_user_deletes')
      .where({ conversation_id: conversationId })
      .whereIn('message_id', unique)
      .whereNot('user_id', senderUserId)
      .select('message_id');

    return new Set(
      (rows as Array<{ message_id: string | number }>).map((r) =>
        String(r.message_id),
      ),
    );
  }

  /** Public user uuids of peers the viewer has blocked. */
  private async loadViewerBlockedPeerUuids(
    viewerUserId: string,
    peerUuids: string[],
  ): Promise<Set<string>> {
    const unique = [...new Set(peerUuids.filter(Boolean))];
    if (!unique.length) return new Set();

    const rows = await this.db('blocks as b')
      .join('users as u', 'u.id', 'b.blocked_id')
      .where({ 'b.blocker_id': viewerUserId })
      .whereNull('b.deleted_at')
      .whereNull('u.deleted_at')
      .whereIn('u.uuid', unique)
      .select('u.uuid');

    return new Set((rows as Array<{ uuid: string }>).map((r) => r.uuid));
  }

  /**
   * If conversations.last_message is hidden for the viewer (shadow / delete-for-me),
   * rewrite last_message_* fields to the latest visible message (or clear them).
   * Also marks forceLastMessageReceiptSent when viewer's last message is hidden from peers.
   */
  private async applyViewerVisibleLastMessages(
    rows: InboxRow[],
    viewerUserId: string,
  ): Promise<InboxRow[]> {
    if (!rows.length) return rows;

    const candidates = rows.filter((r) => r.last_message_id != null);

    const hidden = candidates.length
      ? await this.db('message_user_deletes')
          .where('user_id', viewerUserId)
          .where((qb) => {
            for (const r of candidates) {
              qb.orWhere({
                conversation_id: r.id,
                message_id: r.last_message_id!,
              });
            }
          })
          .select('conversation_id', 'message_id')
      : [];

    const hiddenConvIds = new Set(
      (hidden as Array<{ conversation_id: string | number }>).map((h) =>
        String(h.conversation_id),
      ),
    );

    const patched = new Map<
      string,
      {
        last_message_id: string | number | null;
        last_message_at: Date | string | null;
        last_message_preview: string | null;
        last_message_type: string | null;
        last_sender_id: string | number | null;
      }
    >();

    if (hiddenConvIds.size) {
      await Promise.all(
        [...hiddenConvIds].map(async (convId) => {
          const msg = await this.db('messages as m')
            .where('m.conversation_id', convId)
            .whereNull('m.deleted_for_everyone_at')
            .whereNotExists(function hideDeletedForMe() {
              this.select(this.client.raw('1'))
                .from('message_user_deletes as d')
                .whereRaw('d.conversation_id = m.conversation_id')
                .andWhereRaw('d.message_id = m.id')
                .andWhere('d.user_id', viewerUserId);
            })
            .orderBy('m.id', 'desc')
            .select({
              id: 'm.id',
              body: 'm.body',
              type: 'm.type',
              created_at: 'm.created_at',
              sender_id: 'm.sender_id',
            })
            .first<{
              id: string | number;
              body: string | null;
              type: string;
              created_at: Date | string;
              sender_id: string | number;
            }>();

          if (!msg) {
            patched.set(convId, {
              last_message_id: null,
              last_message_at: null,
              last_message_preview: null,
              last_message_type: null,
              last_sender_id: null,
            });
            return;
          }

          patched.set(convId, {
            last_message_id: msg.id,
            last_message_at: msg.created_at,
            last_message_preview: previewFromBody(msg.body, msg.type),
            last_message_type: msg.type,
            last_sender_id: msg.sender_id,
          });
        }),
      );
    }

    const intermediate = rows.map((row) => {
      const override = patched.get(String(row.id));
      if (!override) return { ...row };
      return {
        ...row,
        last_message_id: override.last_message_id,
        last_message_at: override.last_message_at,
        last_message_preview: override.last_message_preview,
        last_message_type: override.last_message_type,
        last_sender_id: override.last_sender_id,
      };
    });

    // Own last messages never delivered to a peer stay single-tick
    const ownLast = intermediate.filter(
      (r) =>
        r.last_message_id != null &&
        r.last_sender_id != null &&
        String(r.last_sender_id) === String(viewerUserId),
    );
    if (!ownLast.length) return intermediate;

    const rowsHidden = await this.db('message_user_deletes')
      .where((qb) => {
        for (const r of ownLast) {
          qb.orWhere({
            conversation_id: r.id,
            message_id: r.last_message_id!,
          });
        }
      })
      .whereNot('user_id', viewerUserId)
      .select('conversation_id', 'message_id');

    const neverDelivered = new Set(
      (rowsHidden as Array<{
        conversation_id: string | number;
        message_id: string | number;
      }>).map((h) => `${String(h.conversation_id)}:${String(h.message_id)}`),
    );

    return intermediate.map((row) => {
      if (
        row.last_message_id != null &&
        neverDelivered.has(
          `${String(row.id)}:${String(row.last_message_id)}`,
        )
      ) {
        return { ...row, forceLastMessageReceiptSent: true };
      }
      return row;
    });
  }

  private mapConversationDto(
    row: InboxRow,
    peer: ChatUserSummary | null,
    messageUuidById: Map<string, string> = new Map(),
    senderUuidById: Map<string, string> = new Map(),
    peerCursor: { readId: bigint | null; deliveredId: bigint | null } | null = null,
    viewerUserId?: string,
    isPeerBlocked = false,
  ): ConversationDto {
    const lastSenderId =
      row.last_sender_id != null
        ? (senderUuidById.get(String(row.last_sender_id)) ?? null)
        : null;

    let lastMessageReceiptStatus: 'sent' | 'delivered' | 'read' | null = null;
    if (
      viewerUserId &&
      row.last_message_id != null &&
      row.last_sender_id != null &&
      String(row.last_sender_id) === String(viewerUserId)
    ) {
      // Force single tick when last message was never delivered to peer (shadow)
      if (row.forceLastMessageReceiptSent) {
        lastMessageReceiptStatus = 'sent';
      } else {
        const msgId = BigInt(String(row.last_message_id));
        if (peerCursor?.readId != null && peerCursor.readId >= msgId) {
          lastMessageReceiptStatus = 'read';
        } else if (
          peerCursor?.deliveredId != null &&
          peerCursor.deliveredId >= msgId
        ) {
          lastMessageReceiptStatus = 'delivered';
        } else {
          lastMessageReceiptStatus = 'sent';
        }
      }
    }

    return {
      id: row.uuid,
      type: row.type,
      title: row.title,
      avatarPath: row.avatar_path,
      participantsCount: row.participants_count,
      lastMessageAt: toIso(row.last_message_at),
      lastMessagePreview: row.last_message_preview,
      lastMessageType: row.last_message_type,
      lastMessageSenderId: lastSenderId,
      lastMessageReceiptStatus,
      peer,
      isPeerBlocked: Boolean(isPeerBlocked && peer),
      peerBlockActions:
        isPeerBlocked && peer
          ? { unblock: true as const, deleteChat: true as const }
          : null,
      settings: {
        isMuted: row.is_muted,
        isPinned: row.is_pinned,
        isArchived: row.is_archived,
        unreadCount: row.unread_count,
        lastReadMessageId:
          row.last_read_message_id == null
            ? null
            : (messageUuidById.get(String(row.last_read_message_id)) ?? null),
        lastDeliveredMessageId:
          row.last_delivered_message_id == null
            ? null
            : (messageUuidById.get(String(row.last_delivered_message_id)) ??
              null),
        labelText: row.label_text ?? null,
        labelColor: row.label_color ?? null,
      },
      createdAt: toIso(row.created_at) as string,
    };
  }

  async findMessageRowByUuid(messageUuid: string): Promise<{
    id: string;
    uuid: string;
    conversationId: string;
    senderId: string;
    type: string;
    body: string | null;
    isDeleted: boolean;
    meta: Record<string, unknown> | null;
  } | null> {
    const row = await this.db('messages')
      .where({ uuid: messageUuid })
      .first<{
        id: string | number;
        uuid: string;
        conversation_id: string | number;
        sender_id: string | number;
        type: string;
        body: string | null;
        deleted_for_everyone_at: Date | string | null;
        meta: Record<string, unknown> | string | null;
      }>();
    if (!row) return null;
    let meta: Record<string, unknown> | null = null;
    if (row.meta && typeof row.meta === 'object') {
      meta = row.meta as Record<string, unknown>;
    } else if (typeof row.meta === 'string' && row.meta.trim()) {
      try {
        meta = JSON.parse(row.meta) as Record<string, unknown>;
      } catch {
        meta = null;
      }
    }
    return {
      id: String(row.id),
      uuid: row.uuid,
      conversationId: String(row.conversation_id),
      senderId: String(row.sender_id),
      type: row.type,
      body: row.body,
      isDeleted: row.deleted_for_everyone_at != null,
      meta,
    };
  }

  async editMessage(data: {
    conversationId: string;
    messageId: string;
    senderId: string;
    body: string;
  }): Promise<ChatMessage | null> {
    const updated = await this.db('messages')
      .where({
        conversation_id: data.conversationId,
        id: data.messageId,
        sender_id: data.senderId,
      })
      .whereNull('deleted_for_everyone_at')
      .where({ type: 'text' })
      .update({
        body: data.body,
        is_edited: true,
        edited_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      })
      .returning([
        'id',
        'uuid',
        'conversation_id',
        'sender_id',
        'type',
        'body',
        'reply_to_id',
        'is_edited',
        'edited_at',
        'meta',
        'created_at',
      ]);

    const message = updated[0];
    if (!message) return null;

    const conv = await this.db('conversations')
      .where({ id: data.conversationId })
      .first<{ last_message_id: string | number | null }>('last_message_id');
    if (conv?.last_message_id != null && String(conv.last_message_id) === data.messageId) {
      await this.db('conversations').where({ id: data.conversationId }).update({
        last_message_preview: previewFromBody(data.body, 'text'),
        updated_at: this.db.fn.now(),
      });
    }

    await this.db('chat_outbox').insert({
      event_type: 'message.edited',
      conversation_id: data.conversationId,
      message_id: data.messageId,
      actor_id: data.senderId,
      payload: { messageId: message.uuid, body: data.body },
    });

    return this.mapSavedMessage(message);
  }

  async deleteMessageForMe(data: {
    conversationId: string;
    messageId: string;
    userId: string;
  }): Promise<boolean> {
    const exists = await this.db('messages')
      .where({ conversation_id: data.conversationId, id: data.messageId })
      .whereNull('deleted_for_everyone_at')
      .first('id');
    if (!exists) return false;

    try {
      await this.db('message_user_deletes').insert({
        conversation_id: data.conversationId,
        message_id: data.messageId,
        user_id: data.userId,
      });
    } catch {
      // unique (message_id, user_id) — already deleted for this user
    }

    return true;
  }

  async deleteMessageForEveryone(data: {
    conversationId: string;
    messageId: string;
    senderId: string;
  }): Promise<boolean> {
    const updated = await this.db('messages')
      .where({
        conversation_id: data.conversationId,
        id: data.messageId,
        sender_id: data.senderId,
      })
      .whereNull('deleted_for_everyone_at')
      .update({
        deleted_for_everyone_at: this.db.fn.now(),
        body: null,
        updated_at: this.db.fn.now(),
      });

    if (!updated) return false;

    await this.db('message_pins')
      .where({
        conversation_id: data.conversationId,
        message_id: data.messageId,
      })
      .del();

    const conv = await this.db('conversations')
      .where({ id: data.conversationId })
      .first<{ last_message_id: string | number | null }>('last_message_id');

    if (conv?.last_message_id != null && String(conv.last_message_id) === data.messageId) {
      const prev = await this.db('messages')
        .where({ conversation_id: data.conversationId })
        .whereNull('deleted_for_everyone_at')
        .orderBy('id', 'desc')
        .first<{
          id: string | number;
          body: string | null;
          type: string;
          created_at: Date | string;
          sender_id: string | number;
        }>();

      await this.db('conversations')
        .where({ id: data.conversationId })
        .update({
          last_message_id: prev?.id ?? null,
          last_message_at: prev?.created_at ?? null,
          last_message_preview: prev
            ? previewFromBody(prev.body, prev.type)
            : null,
          last_message_type: prev?.type ?? null,
          last_sender_id: prev?.sender_id ?? null,
          updated_at: this.db.fn.now(),
        });
    }

    await this.db('chat_outbox').insert({
      event_type: 'message.deleted',
      conversation_id: data.conversationId,
      message_id: data.messageId,
      actor_id: data.senderId,
      payload: { scope: 'everyone' },
    });

    return true;
  }

  async setMessagePinned(data: {
    conversationId: string;
    messageId: string;
    userId: string;
    pinned: boolean;
  }): Promise<ChatMessage | null> {
    const message = await this.db('messages')
      .where({ conversation_id: data.conversationId, id: data.messageId })
      .whereNull('deleted_for_everyone_at')
      .first<{
        id: string | number;
        uuid: string;
        conversation_id: string | number;
        sender_id: string | number;
        type: string;
        body: string | null;
        reply_to_id: string | number | null;
        is_edited: boolean;
        edited_at: Date | string | null;
        meta: Record<string, unknown> | null;
        created_at: Date | string;
      }>();
    if (!message) return null;

    if (data.pinned) {
      await this.db.transaction(async (trx) => {
        await trx('message_pins').where({ conversation_id: data.conversationId }).del();
        await trx('message_pins').insert({
          conversation_id: data.conversationId,
          message_id: data.messageId,
          pinned_by: data.userId,
        });
      });
    } else {
      await this.db('message_pins')
        .where({
          conversation_id: data.conversationId,
          message_id: data.messageId,
        })
        .del();
    }

    await this.db('chat_outbox').insert({
      event_type: data.pinned ? 'message.pinned' : 'message.unpinned',
      conversation_id: data.conversationId,
      message_id: data.messageId,
      actor_id: data.userId,
      payload: { pinned: data.pinned, messageId: message.uuid },
    });

    return this.mapSavedMessage(message);
  }

  async getPinnedMessage(
    conversationId: string,
    viewerUserId: string,
  ): Promise<ChatMessage | null> {
    const pin = await this.db('message_pins as p')
      .join('messages as m', function joinMsg() {
        this.on('m.conversation_id', '=', 'p.conversation_id').andOn(
          'm.id',
          '=',
          'p.message_id',
        );
      })
      .where('p.conversation_id', conversationId)
      .whereNull('m.deleted_for_everyone_at')
      .first([
        'm.id',
        'm.uuid',
        'm.conversation_id',
        'm.sender_id',
        'm.type',
        'm.body',
        'm.reply_to_id',
        'm.is_edited',
        'm.edited_at',
        'm.meta',
        'm.created_at',
      ]);
    if (!pin) return null;
    const mapped = await this.mapSavedMessage(pin);
    mapped.isPinned = true;
    // hide if deleted-for-me
    const hidden = await this.db('message_user_deletes')
      .where({
        conversation_id: conversationId,
        message_id: pin.id,
        user_id: viewerUserId,
      })
      .first('id');
    if (hidden) return null;
    return mapped;
  }
}
