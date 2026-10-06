import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors/index.js';
import { publishChatRealtime } from '../chat/chat.realtime.js';
import { ChannelRepository } from './channel.repository.js';
import type {
  ChannelBrowsePage,
  ChannelDetail,
  ChannelMessage,
  ChannelMessagesPage,
  ChannelSettingsDto,
  ChannelSettingsInput,
  ChannelsPage,
  CreateChannelInput,
  DeleteChannelMessageInput,
  DeleteChannelMessagesInput,
  EditChannelMessageInput,
  SendChannelMessageInput,
  UpdateChannelInput,
} from './channel.types.js';

/**
 * Broadcast channels — owner/admin post only.
 * Create path: HTTP or socket → persist → realtime notify members.
 */
export class ChannelService {
  constructor(private readonly repo = new ChannelRepository()) {}

  private async resolveUserId(uuid: string): Promise<string> {
    const id = await this.repo.findUserIdByUuid(uuid);
    if (!id) {
      throw new NotFoundError('User not found');
    }
    return id;
  }

  private async requireMember(channelUuid: string, userId: string) {
    const channelId = await this.repo.findChannelIdByUuid(channelUuid);
    if (!channelId) {
      throw new NotFoundError('Channel not found');
    }
    const role = await this.repo.getMemberRole(channelId, userId);
    if (!role) {
      throw new NotFoundError('Channel not found');
    }
    return { channelId, role };
  }

  /**
   * Socket room guard: only channel members (owner/admin/follower) may
   * subscribe to live channel posts.
   */
  async assertChannelMember(
    actorUuid: string,
    channelUuid: string,
  ): Promise<void> {
    const userId = await this.resolveUserId(actorUuid);
    await this.requireMember(channelUuid, userId);
  }

  private normalizeInviteSlug(raw: string): string {
    return raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private slugFromName(name: string): string {
    let slug = this.normalizeInviteSlug(name);
    if (!/^[a-z]/.test(slug)) slug = `c${slug}`;
    if (slug.length < 3) slug = `${slug}channel`;
    return slug.slice(0, 30);
  }

  private isValidInviteSlug(slug: string): boolean {
    return /^[a-z][a-z0-9_]{2,29}$/.test(slug);
  }

  private readonly reservedSlugs = new Set([
    'invite',
    'new',
    'create',
    'search',
    'messages',
    'info',
    'join',
    'admin',
    'api',
    'browse',
  ]);

  async checkInviteSlug(
    rawSlug: string,
    excludeChannelUuid?: string,
  ): Promise<{
    slug: string;
    available: boolean;
    reason?: string;
  }> {
    const slug = this.normalizeInviteSlug(rawSlug);
    if (!slug) {
      return { slug: '', available: false, reason: 'empty' };
    }
    if (!this.isValidInviteSlug(slug)) {
      return {
        slug,
        available: false,
        reason: 'invalid',
      };
    }
    if (this.reservedSlugs.has(slug)) {
      return { slug, available: false, reason: 'reserved' };
    }
    let excludeId: string | undefined;
    if (excludeChannelUuid) {
      excludeId =
        (await this.repo.findChannelIdByUuid(excludeChannelUuid)) ?? undefined;
    }
    const taken = await this.repo.isInviteSlugTaken(slug, excludeId);
    return {
      slug,
      available: !taken,
      reason: taken ? 'taken' : undefined,
    };
  }

  async createChannel(
    actorUuid: string,
    input: CreateChannelInput,
  ): Promise<ChannelDetail> {
    const creatorId = await this.resolveUserId(actorUuid);
    const participantUuids = [...new Set(input.participantIds ?? [])].filter(
      (id) => id !== actorUuid,
    );
    const adminUuidSet = new Set(
      (input.adminIds ?? []).filter((id) => id !== actorUuid),
    );

    for (const adminId of adminUuidSet) {
      if (!participantUuids.includes(adminId)) {
        throw new ValidationError('adminIds must be a subset of participantIds');
      }
    }

    const uuidMap = await this.repo.findUserIdsByUuids(participantUuids);
    if (uuidMap.size !== participantUuids.length) {
      throw new NotFoundError('One or more participants not found');
    }

    const members = participantUuids.map((uuid) => ({
      userId: uuidMap.get(uuid)!,
      role: (adminUuidSet.has(uuid) ? 'admin' : 'follower') as
        | 'admin'
        | 'follower',
    }));

    const name = input.name.trim();
    if (!name) {
      throw new ValidationError('name is required');
    }

    let inviteSlug: string;
    const requested = input.inviteSlug?.trim();
    if (requested) {
      const check = await this.checkInviteSlug(requested);
      if (!check.available) {
        throw new ValidationError(
          check.reason === 'taken'
            ? 'Invite link is already taken'
            : check.reason === 'reserved'
              ? 'Invite link is reserved'
              : 'Invite link is invalid',
        );
      }
      inviteSlug = check.slug;
    } else {
      inviteSlug = await this.repo.allocateInviteSlug(this.slugFromName(name));
    }

    const channelUuid = await this.repo.createChannel({
      creatorId,
      name,
      description: input.description?.trim() || null,
      avatarPath: input.avatarPath ?? null,
      isPublic: input.isPublic ?? true,
      inviteSlug,
      members,
    });

    const detail = await this.repo.getChannelDetail(channelUuid, creatorId);
    if (!detail) {
      throw new NotFoundError('Channel not found after create');
    }

    const memberUuids = await this.repo.listMemberUuids(
      (await this.repo.findChannelIdByUuid(channelUuid))!,
    );

    await publishChatRealtime({
      type: 'channel.created',
      channelId: channelUuid,
      channel: detail,
      notifyUserIds: memberUuids,
    });

    return detail;
  }

  async updateChannel(
    actorUuid: string,
    channelUuid: string,
    input: UpdateChannelInput,
  ): Promise<ChannelDetail> {
    const userId = await this.resolveUserId(actorUuid);
    const { channelId, role } = await this.requireMember(channelUuid, userId);
    if (role !== 'owner' && role !== 'admin') {
      throw new ForbiddenError('Only channel admins can edit');
    }

    const patch: {
      name?: string;
      description?: string | null;
      avatarPath?: string | null;
      isPublic?: boolean;
      inviteSlug?: string;
    } = {};

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new ValidationError('name is required');
      patch.name = name;
    }
    if (input.description !== undefined) {
      patch.description =
        input.description == null ? null : input.description.trim() || null;
    }
    if (input.avatarPath !== undefined) {
      patch.avatarPath = input.avatarPath;
    }
    if (input.isPublic !== undefined) {
      patch.isPublic = input.isPublic;
    }
    if (input.inviteSlug !== undefined) {
      const check = await this.checkInviteSlug(input.inviteSlug, channelUuid);
      if (!check.available) {
        throw new ValidationError(
          check.reason === 'taken'
            ? 'Invite link is already taken'
            : check.reason === 'reserved'
              ? 'Invite link is reserved'
              : 'Invite link is invalid',
        );
      }
      patch.inviteSlug = check.slug;
    }

    if (Object.keys(patch).length === 0) {
      throw new ValidationError('At least one field is required');
    }

    await this.repo.updateChannel(channelId, patch);

    const detail = await this.repo.getChannelDetail(channelUuid, userId);
    if (!detail) {
      throw new NotFoundError('Channel not found after update');
    }

    const memberUuids = await this.repo.listMemberUuids(channelId);
    await publishChatRealtime({
      type: 'channel.updated',
      channelId: channelUuid,
      channel: detail,
      notifyUserIds: memberUuids,
    });

    return detail;
  }

  async leaveChannel(actorUuid: string, channelUuid: string): Promise<void> {
    const userId = await this.resolveUserId(actorUuid);
    const { channelId, role } = await this.requireMember(channelUuid, userId);

    if (role === 'owner') {
      throw new ValidationError(
        'Owner cannot unfollow. Delete the channel or transfer ownership first.',
      );
    }

    if (role === 'admin') {
      const adminCount = await this.repo.countActiveAdmins(channelId);
      if (adminCount <= 1) {
        throw new ValidationError('Cannot leave as the last admin');
      }
    }

    const ok = await this.repo.leaveChannel(channelId, userId, role);
    if (!ok) {
      throw new NotFoundError('Channel membership not found');
    }

    await publishChatRealtime({
      type: 'channel.left',
      channelId: channelUuid,
      userId: actorUuid,
      notifyUserIds: [actorUuid],
    });
  }

  async deleteChannel(actorUuid: string, channelUuid: string): Promise<void> {
    const userId = await this.resolveUserId(actorUuid);
    const { channelId, role } = await this.requireMember(channelUuid, userId);
    if (role !== 'owner' && role !== 'admin') {
      throw new ForbiddenError('Only channel admins can delete');
    }

    const memberUuids = await this.repo.listMemberUuids(channelId);
    const ok = await this.repo.softDeleteChannel(channelId);
    if (!ok) {
      throw new NotFoundError('Channel not found');
    }

    await publishChatRealtime({
      type: 'channel.deleted',
      channelId: channelUuid,
      notifyUserIds: memberUuids,
    });
  }

  async listChannels(
    actorUuid: string,
    opts: { limit: number; cursor?: string; archived?: boolean },
  ): Promise<ChannelsPage> {
    const userId = await this.resolveUserId(actorUuid);
    const { rows, nextCursor } = await this.repo.listChannels(
      userId,
      opts.limit,
      opts.cursor,
      opts.archived ?? false,
    );
    return { rows, nextCursor, limit: opts.limit };
  }

  async markRead(
    actorUuid: string,
    channelUuid: string,
    input: { messageId?: string },
  ): Promise<{ channelId: string; unreadCount: number }> {
    const userId = await this.resolveUserId(actorUuid);
    const { channelId } = await this.requireMember(channelUuid, userId);

    let messageId: string | null = null;
    if (input.messageId) {
      messageId = await this.repo.findMessageInternalId(
        channelId,
        input.messageId,
      );
      if (!messageId) {
        throw new NotFoundError('Message not found');
      }
    } else {
      messageId = await this.repo.findLatestMessageId(channelId);
    }

    if (messageId) {
      await this.repo.markSeen(channelId, userId, messageId);
    }

    const publicMessageId =
      input.messageId?.trim() ||
      (messageId ? await this.repo.findMessageUuidById(messageId) : null);

    await publishChatRealtime({
      type: 'channel.message.seen',
      channelId: channelUuid,
      readerId: actorUuid,
      messageId: publicMessageId,
      unreadCount: 0,
      notifyUserIds: [actorUuid],
    });

    return { channelId: channelUuid, unreadCount: 0 };
  }

  async markUnread(
    actorUuid: string,
    channelUuid: string,
  ): Promise<{ channelId: string; unreadCount: number }> {
    const userId = await this.resolveUserId(actorUuid);
    const { channelId } = await this.requireMember(channelUuid, userId);
    const unreadCount = await this.repo.markUnread(channelId, userId);

    await publishChatRealtime({
      type: 'channel.message.unread',
      channelId: channelUuid,
      readerId: actorUuid,
      unreadCount,
      notifyUserIds: [actorUuid],
    });

    return { channelId: channelUuid, unreadCount };
  }

  async updateSettings(
    actorUuid: string,
    channelUuid: string,
    input: ChannelSettingsInput,
  ): Promise<ChannelSettingsDto> {
    const userId = await this.resolveUserId(actorUuid);
    const { channelId } = await this.requireMember(channelUuid, userId);
    const settings = await this.repo.updateSettings(channelId, userId, input);
    if (!settings) {
      throw new NotFoundError('Channel not found');
    }
    return settings;
  }

  async browseChannels(
    actorUuid: string,
    opts: { limit: number; cursor?: string; q?: string },
  ): Promise<ChannelBrowsePage> {
    const userId = await this.resolveUserId(actorUuid);
    const { rows, nextCursor } = await this.repo.browsePublicChannels(userId, {
      limit: opts.limit,
      cursor: opts.cursor,
      q: opts.q,
    });
    return { rows, nextCursor, limit: opts.limit };
  }

  async getChannel(
    actorUuid: string,
    channelUuid: string,
  ): Promise<ChannelDetail> {
    const userId = await this.resolveUserId(actorUuid);
    const channelId = await this.repo.findChannelIdByUuid(channelUuid);
    if (!channelId) {
      throw new NotFoundError('Channel not found');
    }
    const role = await this.repo.getMemberRole(channelId, userId);
    const detail = await this.repo.getChannelDetail(channelUuid, userId);
    if (!detail) {
      throw new NotFoundError('Channel not found');
    }
    if (!role && !detail.isPublic) {
      throw new NotFoundError('Channel not found');
    }
    return detail;
  }

  async getChannelBySlug(
    actorUuid: string,
    rawSlug: string,
  ): Promise<ChannelDetail> {
    const slug = this.normalizeInviteSlug(rawSlug);
    if (!slug) {
      throw new NotFoundError('Channel not found');
    }
    const channelUuid = await this.repo.findChannelUuidByInviteSlug(slug);
    if (!channelUuid) {
      throw new NotFoundError('Channel not found');
    }
    const userId = await this.resolveUserId(actorUuid);
    const detail = await this.repo.getChannelDetail(channelUuid, userId);
    if (!detail) {
      throw new NotFoundError('Channel not found');
    }
    // Invite slug works for public and private channels.
    return detail;
  }

  async followChannel(
    actorUuid: string,
    channelUuid: string,
  ): Promise<ChannelDetail> {
    const userId = await this.resolveUserId(actorUuid);
    const channelId = await this.repo.findChannelIdByUuid(channelUuid);
    if (!channelId) {
      throw new NotFoundError('Channel not found');
    }

    const exists = await this.repo.getChannelIsPublic(channelId);
    if (exists == null) {
      throw new NotFoundError('Channel not found');
    }

    const existingRole = await this.repo.getMemberRole(channelId, userId);
    if (!existingRole) {
      await this.repo.followChannel(channelId, userId);
    }

    const detail = await this.repo.getChannelDetail(channelUuid, userId);
    if (!detail) {
      throw new NotFoundError('Channel not found after follow');
    }

    await publishChatRealtime({
      type: 'channel.updated',
      channelId: channelUuid,
      channel: detail,
      notifyUserIds: [actorUuid],
    });

    return detail;
  }

  async listMessages(
    actorUuid: string,
    channelUuid: string,
    opts: { limit: number; cursor?: string },
  ): Promise<ChannelMessagesPage> {
    const userId = await this.resolveUserId(actorUuid);
    const { channelId } = await this.requireMember(channelUuid, userId);

    let cursorId: string | undefined;
    if (opts.cursor) {
      const id = await this.repo.findMessageInternalId(channelId, opts.cursor);
      if (id) cursorId = id;
    }

    const { rows, nextCursor: internalNext } = await this.repo.listMessages(
      channelId,
      userId,
      opts.limit,
      cursorId,
    );

    const publicNext =
      internalNext && rows.length ? rows[rows.length - 1]!.id : null;

    return { rows, nextCursor: publicNext, limit: opts.limit };
  }

  async sendMessage(
    actorUuid: string,
    input: SendChannelMessageInput,
  ): Promise<ChannelMessage> {
    const userId = await this.resolveUserId(actorUuid);
    const { channelId, role } = await this.requireMember(
      input.channelId,
      userId,
    );
    if (role !== 'owner' && role !== 'admin') {
      throw new ForbiddenError('Only channel admins can post');
    }

    const body = input.body?.trim() ?? '';
    const isMedia =
      input.type === 'image' ||
      input.type === 'video' ||
      Boolean(input.mediaIds?.length);

    if (isMedia) {
      if (!input.mediaIds?.length) {
        throw new ValidationError('mediaIds is required for media messages');
      }
    } else if (!body) {
      throw new ValidationError('body is required');
    }

    try {
      let replyToInternalId: string | null = null;
      if (input.replyToId) {
        replyToInternalId = await this.repo.findMessageInternalId(
          channelId,
          input.replyToId,
        );
        if (!replyToInternalId) {
          throw new NotFoundError('Reply message not found');
        }
      }

      const message = await this.repo.saveMessage({
        channelId,
        senderId: userId,
        body,
        type: isMedia
          ? input.type === 'video'
            ? 'video'
            : 'image'
          : 'text',
        mediaIds: isMedia ? input.mediaIds : undefined,
        clientMessageId: input.clientMessageId,
        replyToId: replyToInternalId,
      });

      const memberUuids = await this.repo.listMemberUuids(channelId);
      await publishChatRealtime({
        type: 'channel.message.created',
        channelId: input.channelId,
        message,
        notifyUserIds: memberUuids,
      });

      return message;
    } catch (err) {
      if (err instanceof Error && err.message === 'MEDIA_INVALID') {
        throw new ValidationError('One or more media items are invalid');
      }
      throw err;
    }
  }

  async editMessage(
    actorUuid: string,
    messageUuid: string,
    input: EditChannelMessageInput,
  ): Promise<ChannelMessage> {
    const userId = await this.resolveUserId(actorUuid);
    const found = await this.repo.findMessageByUuid(messageUuid);
    if (!found) {
      throw new NotFoundError('Message not found');
    }

    const role = await this.repo.getMemberRole(found.channelId, userId);
    if (role !== 'owner' && role !== 'admin') {
      throw new ForbiddenError('Only channel admins can edit messages');
    }
    if (found.type !== 'text') {
      throw new ValidationError('Only text messages can be edited');
    }

    const body = input.body.trim();
    if (!body) {
      throw new ValidationError('body is required');
    }

    const updated = await this.repo.editMessage({
      channelId: found.channelId,
      messageId: found.id,
      actorId: userId,
      body,
    });
    if (!updated) {
      throw new NotFoundError('Message not found');
    }

    const memberUuids = await this.repo.listMemberUuids(found.channelId);
    await publishChatRealtime({
      type: 'channel.message.edited',
      channelId: found.channelUuid,
      message: updated,
      notifyUserIds: memberUuids,
    });

    return updated;
  }

  async deleteMessage(
    actorUuid: string,
    messageUuid: string,
    input: DeleteChannelMessageInput,
  ): Promise<{ channelId: string; messageIds: string[]; scope: 'me' | 'everyone' }> {
    return this.deleteMessages(actorUuid, {
      messageIds: [messageUuid],
      scope: input.scope,
    });
  }

  /**
   * Delete 1–10 channel messages in one request (same scope for all).
   * Realtime: `channel.message.deleted` with all ids —
   * everyone → members; me → actor devices only (no room broadcast).
   */
  async deleteMessages(
    actorUuid: string,
    input: DeleteChannelMessagesInput,
  ): Promise<{ channelId: string; messageIds: string[]; scope: 'me' | 'everyone' }> {
    const uniqueIds = [...new Set(input.messageIds.filter(Boolean))];
    if (!uniqueIds.length) {
      throw new ValidationError('messageIds is required');
    }
    if (uniqueIds.length > 10) {
      throw new ValidationError('At most 10 messages can be deleted at once');
    }

    const userId = await this.resolveUserId(actorUuid);
    const scope = input.scope ?? 'me';

    let channelId: string | null = null;
    let channelUuid: string | null = null;
    const deletedIds: string[] = [];

    for (const messageUuid of uniqueIds) {
      const found = await this.repo.findMessageByUuid(messageUuid);
      if (!found) {
        throw new NotFoundError(`Message not found: ${messageUuid}`);
      }

      if (channelId == null) {
        channelId = found.channelId;
        channelUuid = found.channelUuid;
      } else if (found.channelId !== channelId) {
        throw new ValidationError(
          'All messages must belong to the same channel',
        );
      }

      const role = await this.repo.getMemberRole(found.channelId, userId);
      if (!role) {
        throw new NotFoundError(`Message not found: ${messageUuid}`);
      }

      if (scope === 'everyone') {
        if (role !== 'owner' && role !== 'admin') {
          throw new ForbiddenError(
            'Only channel owner/admin can delete for everyone',
          );
        }
        const ok = await this.repo.deleteMessageForEveryone({
          channelId: found.channelId,
          messageId: found.id,
          actorId: userId,
        });
        if (!ok) {
          throw new NotFoundError(`Message not found: ${messageUuid}`);
        }
      } else {
        const ok = await this.repo.deleteMessageForMe({
          channelId: found.channelId,
          messageId: found.id,
          userId,
        });
        if (!ok) {
          throw new NotFoundError(`Message not found: ${messageUuid}`);
        }
      }
      deletedIds.push(messageUuid);
    }

    if (!channelUuid || !deletedIds.length) {
      throw new NotFoundError('Message not found');
    }

    if (scope === 'everyone') {
      const memberUuids = await this.repo.listMemberUuids(channelId!);
      await publishChatRealtime({
        type: 'channel.message.deleted',
        channelId: channelUuid,
        messageId: deletedIds[0]!,
        messageIds: deletedIds,
        actorId: actorUuid,
        scope: 'everyone',
        notifyUserIds: memberUuids,
      });
    } else {
      await publishChatRealtime({
        type: 'channel.message.deleted',
        channelId: channelUuid,
        messageId: deletedIds[0]!,
        messageIds: deletedIds,
        actorId: actorUuid,
        scope: 'me',
        notifyUserIds: [actorUuid],
      });
    }

    return {
      channelId: channelUuid,
      messageIds: deletedIds,
      scope,
    };
  }
}
