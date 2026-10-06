import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { newPublicId } from '../../shared/ids/index.js';
import {
  pickProfilePictureUrl,
  resolveProfilePictureUrls,
} from '../../shared/media/profile-picture.js';
import { publicUrl } from '../../shared/storage/index.js';
import type {
  ChannelBrowseItem,
  ChannelDetail,
  ChannelDto,
  ChannelMember,
  ChannelMemberRole,
  ChannelMessage,
  ChannelMessageMedia,
  ChannelMessageReplyPreview,
  ChannelSettingsDto,
  ChannelSettingsInput,
} from './channel.types.js';

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/** Must fit channels.last_message_preview varchar(160). */
const LAST_MESSAGE_PREVIEW_MAX = 160;

function truncateLastMessagePreview(
  text: string,
  max = LAST_MESSAGE_PREVIEW_MAX,
): string {
  if (text.length <= max) return text;
  if (max <= 1) return text.slice(0, max);
  return `${text.slice(0, max - 1)}…`;
}

type ChannelRow = {
  id: string | number;
  uuid: string;
  name: string;
  description: string | null;
  avatar_path: string | null;
  is_public: boolean;
  invite_slug: string | null;
  followers_count: number;
  admins_count: number;
  last_message_at: Date | string | null;
  last_message_preview: string | null;
  last_message_type: string | null;
  last_sender_id: string | number | null;
  created_at: Date | string;
};

type ChannelInboxRow = ChannelRow & {
  is_muted: boolean;
  is_pinned: boolean;
  is_archived: boolean;
  last_read_message_id: string | number | null;
  last_read_at: Date | string | null;
  sort_at: Date | string;
  my_role?: ChannelMemberRole | null;
  unread_count?: number | string | null;
};

type SettingsRow = {
  is_muted: boolean;
  is_pinned: boolean;
  is_archived: boolean;
  last_read_message_id: string | number | null;
  last_read_at: Date | string | null;
};

export class ChannelRepository {
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

  async findChannelIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('channels')
      .select('id')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string }>();
    return row?.id != null ? String(row.id) : null;
  }

  async findChannelUuidByInviteSlug(slug: string): Promise<string | null> {
    const row = await this.db('channels')
      .select('uuid')
      .where({ invite_slug: slug })
      .whereNull('deleted_at')
      .first<{ uuid: string }>('uuid');
    return row?.uuid ?? null;
  }

  async getMemberRole(
    channelId: string,
    userId: string,
  ): Promise<ChannelMemberRole | null> {
    const row = await this.db('channel_members')
      .where({
        channel_id: channelId,
        user_id: userId,
        is_active: true,
      })
      .first<{ role: ChannelMemberRole }>('role');
    return row?.role ?? null;
  }

  /** Owner + admin only — used for post permission later */
  async canPost(channelId: string, userId: string): Promise<boolean> {
    const role = await this.getMemberRole(channelId, userId);
    return role === 'owner' || role === 'admin';
  }

  async isInviteSlugTaken(
    slug: string,
    excludeChannelId?: string,
  ): Promise<boolean> {
    let query = this.db('channels')
      .where({ invite_slug: slug })
      .whereNull('deleted_at');
    if (excludeChannelId) {
      query = query.andWhereNot('id', excludeChannelId);
    }
    const row = await query.first<{ id: string }>('id');
    return Boolean(row);
  }

  async allocateInviteSlug(preferred: string): Promise<string> {
    let base = preferred.slice(0, 24);
    if (!/^[a-z]/.test(base)) base = `c${base}`.slice(0, 24);
    if (base.length < 3) base = `${base}chan`.slice(0, 24);

    for (let i = 0; i < 12; i += 1) {
      const candidate =
        i === 0
          ? base
          : `${base.slice(0, 20)}${Math.floor(Math.random() * 9000 + 1000)}`;
      const taken = await this.isInviteSlugTaken(candidate);
      if (!taken) return candidate;
    }
    return `ch${Date.now().toString(36)}`.slice(0, 30);
  }

  async updateChannel(
    channelId: string,
    patch: {
      name?: string;
      description?: string | null;
      avatarPath?: string | null;
      isPublic?: boolean;
      inviteSlug?: string;
    },
  ): Promise<void> {
    const data: Record<string, unknown> = {
      updated_at: this.db.fn.now(),
    };
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.avatarPath !== undefined) data.avatar_path = patch.avatarPath;
    if (patch.isPublic !== undefined) data.is_public = patch.isPublic;
    if (patch.inviteSlug !== undefined) data.invite_slug = patch.inviteSlug;

    await this.db('channels').where({ id: channelId }).update(data);
  }

  async createChannel(data: {
    creatorId: string;
    name: string;
    description?: string | null;
    avatarPath?: string | null;
    isPublic: boolean;
    inviteSlug: string;
    /** internal user id → role (excludes creator; creator always owner) */
    members: Array<{ userId: string; role: 'admin' | 'follower' }>;
  }): Promise<string> {
    const adminIds = data.members.filter((m) => m.role === 'admin').map((m) => m.userId);
    const followerIds = data.members
      .filter((m) => m.role === 'follower')
      .map((m) => m.userId);

    return this.db.transaction(async (trx) => {
      const [channel] = await trx('channels')
        .insert({
          uuid: newPublicId(),
          name: data.name,
          description: data.description ?? null,
          avatar_path: data.avatarPath ?? null,
          is_public: data.isPublic,
          invite_slug: data.inviteSlug,
          created_by: data.creatorId,
          followers_count: followerIds.length,
          admins_count: 1 + adminIds.length, // owner + admins
        })
        .returning(['id', 'uuid']);

      const memberRows = [
        {
          channel_id: channel.id,
          user_id: data.creatorId,
          role: 'owner' as const,
        },
        ...adminIds.map((userId) => ({
          channel_id: channel.id,
          user_id: userId,
          role: 'admin' as const,
        })),
        ...followerIds.map((userId) => ({
          channel_id: channel.id,
          user_id: userId,
          role: 'follower' as const,
        })),
      ];

      await trx('channel_members').insert(memberRows);

      const allUserIds = [
        data.creatorId,
        ...adminIds,
        ...followerIds,
      ];

      await trx('channel_settings').insert(
        allUserIds.map((userId) => ({
          channel_id: channel.id,
          user_id: userId,
          sort_at: trx.fn.now(),
        })),
      );

      return channel.uuid as string;
    });
  }

  async listMemberUuids(channelId: string): Promise<string[]> {
    const rows = await this.db('channel_members as cm')
      .join('users', 'users.id', 'cm.user_id')
      .where({ 'cm.channel_id': channelId, 'cm.is_active': true })
      .whereNull('users.deleted_at')
      .select('users.uuid');
    return (rows as Array<{ uuid: string }>).map((r) => r.uuid);
  }

  async listMembers(
    channelId: string,
    opts?: { includeFollowers?: boolean },
  ): Promise<ChannelMember[]> {
    const includeFollowers = opts?.includeFollowers !== false;
    let query = this.db('channel_members as cm')
      .join('users', 'users.id', 'cm.user_id')
      .join('user_details', 'user_details.user_id', 'users.id')
      .where({ 'cm.channel_id': channelId, 'cm.is_active': true })
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at');

    if (!includeFollowers) {
      query = query.whereIn('cm.role', ['owner', 'admin']);
    }

    const rows = await query
      .orderByRaw(
        `CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, cm.joined_at ASC`,
      )
      .select(
        'users.uuid',
        'user_details.username',
        'user_details.full_name',
        'user_details.profile_picture',
        'user_details.is_verified',
        'cm.role',
        'cm.joined_at',
      );

    const members = (
      rows as Array<{
        uuid: string;
        username: string;
        full_name: string | null;
        profile_picture: string | null;
        is_verified: boolean;
        role: ChannelMemberRole;
        joined_at: Date | string;
      }>
    ).map((r) => ({
      id: r.uuid,
      username: r.username,
      fullName: r.full_name,
      profilePicture: r.profile_picture,
      isVerified: Boolean(r.is_verified),
      role: r.role,
      joinedAt: toIso(r.joined_at) as string,
    }));

    const urls = await resolveProfilePictureUrls(
      members.map((m) => m.profilePicture),
    );
    return members.map((m) => ({
      ...m,
      profilePicture: pickProfilePictureUrl(m.profilePicture, urls),
    }));
  }

  async leaveChannel(
    channelId: string,
    userId: string,
    role: ChannelMemberRole,
  ): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const updated = await trx('channel_members')
        .where({
          channel_id: channelId,
          user_id: userId,
          is_active: true,
        })
        .update({
          is_active: false,
          left_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
      if (!updated) return false;

      await trx('channel_settings')
        .where({ channel_id: channelId, user_id: userId })
        .whereNull('deleted_at')
        .update({
          deleted_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });

      if (role === 'admin') {
        await trx('channels')
          .where({ id: channelId })
          .where('admins_count', '>', 0)
          .update({
            admins_count: trx.raw('GREATEST(admins_count - 1, 0)'),
            updated_at: trx.fn.now(),
          });
      } else if (role === 'follower') {
        await trx('channels')
          .where({ id: channelId })
          .where('followers_count', '>', 0)
          .update({
            followers_count: trx.raw('GREATEST(followers_count - 1, 0)'),
            updated_at: trx.fn.now(),
          });
      }

      return true;
    });
  }

  async followChannel(channelId: string, userId: string): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const existing = await trx('channel_members')
        .where({ channel_id: channelId, user_id: userId })
        .first<{
          id: string | number;
          is_active: boolean;
          role: ChannelMemberRole;
        }>('id', 'is_active', 'role');

      if (existing?.is_active) {
        return false; // already following
      }

      if (existing) {
        await trx('channel_members')
          .where({ id: existing.id })
          .update({
            is_active: true,
            left_at: null,
            role: existing.role === 'owner' ? 'owner' : 'follower',
            joined_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          });
      } else {
        await trx('channel_members').insert({
          channel_id: channelId,
          user_id: userId,
          role: 'follower',
          is_active: true,
        });
      }

      const channelMeta = await trx('channels')
        .where({ id: channelId })
        .whereNull('deleted_at')
        .first<{
          last_message_id: string | number | null;
          last_message_at: Date | string | null;
        }>('last_message_id', 'last_message_at');

      const settings = await trx('channel_settings')
        .where({ channel_id: channelId, user_id: userId })
        .first<{ id: string | number; deleted_at: Date | string | null }>(
          'id',
          'deleted_at',
        );

      if (settings) {
        if (settings.deleted_at != null) {
          await trx('channel_settings')
            .where({ id: settings.id })
            .update({
              deleted_at: null,
              is_archived: false,
              sort_at: trx.fn.now(),
              last_read_message_id: channelMeta?.last_message_id ?? null,
              last_read_at: channelMeta?.last_message_at ?? trx.fn.now(),
              updated_at: trx.fn.now(),
            });
        }
      } else {
        await trx('channel_settings').insert({
          channel_id: channelId,
          user_id: userId,
          sort_at: trx.fn.now(),
          last_read_message_id: channelMeta?.last_message_id ?? null,
          last_read_at: channelMeta?.last_message_at ?? null,
        });
      }

      await trx('channels').where({ id: channelId }).update({
        followers_count: trx.raw('followers_count + 1'),
        updated_at: trx.fn.now(),
      });

      return true;
    });
  }

  async browsePublicChannels(
    viewerUserId: string,
    opts: { limit: number; cursor?: string; q?: string },
  ): Promise<{ rows: ChannelBrowseItem[]; nextCursor: string | null }> {
    const limit = opts.limit;
    let query = this.db('channels as c')
      .leftJoin('channel_members as cm', function joinMember() {
        this.on('cm.channel_id', '=', 'c.id')
          .andOnVal('cm.user_id', viewerUserId)
          .andOnVal('cm.is_active', true);
      })
      .whereNull('c.deleted_at')
      .where('c.is_public', true)
      .select(
        'c.uuid',
        'c.name',
        'c.description',
        'c.avatar_path',
        'c.is_public',
        'c.invite_slug',
        'c.followers_count',
        'c.created_at',
        'c.id',
        this.db.raw(
          'CASE WHEN cm.id IS NULL THEN false ELSE true END as is_following',
        ),
      )
      .orderBy('c.created_at', 'desc')
      .orderBy('c.id', 'desc')
      .limit(limit + 1);

    if (opts.q) {
      const like = `%${opts.q.toLowerCase()}%`;
      query = query.andWhere(function search() {
        this.whereRaw('LOWER(c.name) LIKE ?', [like]).orWhereRaw(
          'LOWER(COALESCE(c.invite_slug, \'\')) LIKE ?',
          [like],
        );
      });
    }

    if (opts.cursor) {
      // cursor format: `${createdAtIso}|${id}`
      const [createdAt, id] = opts.cursor.split('|');
      if (createdAt && id) {
        query = query.andWhere(function cursorWhere() {
          this.where('c.created_at', '<', createdAt).orWhere(function tie() {
            this.where('c.created_at', createdAt).andWhere('c.id', '<', id);
          });
        });
      }
    }

    const dbRows = (await query) as Array<{
      uuid: string;
      name: string;
      description: string | null;
      avatar_path: string | null;
      is_public: boolean;
      invite_slug: string | null;
      followers_count: number;
      created_at: Date | string;
      id: string | number;
      is_following: boolean | string | number;
    }>;

    const hasMore = dbRows.length > limit;
    const pageRows = hasMore ? dbRows.slice(0, limit) : dbRows;

    const rows: ChannelBrowseItem[] = pageRows.map((r) => ({
      id: r.uuid,
      name: r.name,
      description: r.description,
      avatarPath: r.avatar_path,
      isPublic: Boolean(r.is_public),
      inviteSlug: r.invite_slug ?? r.uuid,
      followersCount: Number(r.followers_count ?? 0),
      isFollowing: Boolean(r.is_following),
      createdAt: toIso(r.created_at) as string,
    }));

    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last
        ? `${toIso(last.created_at)}|${String(last.id)}`
        : null;

    return { rows, nextCursor };
  }

  async getChannelIsPublic(channelId: string): Promise<boolean | null> {
    const row = await this.db('channels')
      .where({ id: channelId })
      .whereNull('deleted_at')
      .first<{ is_public: boolean }>('is_public');
    return row ? Boolean(row.is_public) : null;
  }

  async softDeleteChannel(channelId: string): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const updated = await trx('channels')
        .where({ id: channelId })
        .whereNull('deleted_at')
        .update({
          deleted_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
      if (!updated) return false;

      await trx('channel_members')
        .where({ channel_id: channelId, is_active: true })
        .update({
          is_active: false,
          left_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });

      await trx('channel_settings')
        .where({ channel_id: channelId })
        .whereNull('deleted_at')
        .update({
          deleted_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });

      return true;
    });
  }

  async countActiveAdmins(channelId: string): Promise<number> {
    const row = await this.db('channel_members')
      .where({
        channel_id: channelId,
        is_active: true,
      })
      .whereIn('role', ['owner', 'admin'])
      .count<{ count: string | number }>('* as count')
      .first();
    return Number(row?.count ?? 0);
  }

  async listChannels(
    userId: string,
    limit: number,
    cursor?: string,
    archived = false,
  ): Promise<{ rows: ChannelDto[]; nextCursor: string | null }> {
    let query = this.db('channel_settings as cs')
      .join('channels as c', 'c.id', 'cs.channel_id')
      .leftJoin('channel_members as cm', function joinMember() {
        this.on('cm.channel_id', '=', 'c.id')
          .andOn('cm.user_id', '=', 'cs.user_id')
          .andOnVal('cm.is_active', true);
      })
      .where('cs.user_id', userId)
      .whereNull('cs.deleted_at')
      .whereNull('c.deleted_at')
      .where('cs.is_archived', archived)
      .select(
        'c.id',
        'c.uuid',
        'c.name',
        'c.description',
        'c.avatar_path',
        'c.is_public',
        'c.invite_slug',
        'c.followers_count',
        'c.admins_count',
        'c.last_message_at',
        'c.last_message_preview',
        'c.last_message_type',
        'c.last_sender_id',
        'c.created_at',
        'cs.is_muted',
        'cs.is_pinned',
        'cs.is_archived',
        'cs.last_read_message_id',
        'cs.last_read_at',
        'cs.sort_at',
        'cm.role as my_role',
        this.db.raw(`(
          SELECT COUNT(*)::int
          FROM channel_messages m
          WHERE m.channel_id = c.id
            AND m.deleted_at IS NULL
            AND (
              cs.last_read_message_id IS NULL
              OR m.id > cs.last_read_message_id
            )
            AND NOT EXISTS (
              SELECT 1
              FROM channel_message_user_deletes d
              WHERE d.channel_id = m.channel_id
                AND d.message_id = m.id
                AND d.user_id = cs.user_id
            )
        ) as unread_count`),
      )
      .orderByRaw('cs.is_pinned DESC, cs.sort_at DESC')
      .limit(limit + 1);

    if (cursor) {
      query = query.where('cs.sort_at', '<', cursor);
    }

    const dbRows = (await query) as ChannelInboxRow[];
    const hasMore = dbRows.length > limit;
    const pageRows = hasMore ? dbRows.slice(0, limit) : dbRows;

    const senderIds = pageRows
      .map((r) => r.last_sender_id)
      .filter((id): id is string | number => id != null)
      .map(String);
    const senderUuidById = new Map<string, string>();
    if (senderIds.length) {
      const unique = [...new Set(senderIds)];
      const users = await this.db('users')
        .whereIn('id', unique)
        .whereNull('deleted_at')
        .select('id', 'uuid');
      for (const u of users as Array<{ id: string | number; uuid: string }>) {
        senderUuidById.set(String(u.id), u.uuid);
      }
    }

    const rows = pageRows.map((row) =>
      this.mapChannelDto(
        row,
        {
          is_muted: row.is_muted,
          is_pinned: row.is_pinned,
          is_archived: row.is_archived,
          last_read_message_id: row.last_read_message_id,
          last_read_at: row.last_read_at,
        },
        row.last_sender_id != null
          ? (senderUuidById.get(String(row.last_sender_id)) ?? null)
          : null,
        row.my_role ?? null,
        Number(row.unread_count ?? 0),
      ),
    );

    const nextCursor =
      hasMore && pageRows.length
        ? toIso(pageRows[pageRows.length - 1]!.sort_at)
        : null;

    return { rows, nextCursor };
  }

  async getChannelDetail(
    channelUuid: string,
    viewerUserId: string,
  ): Promise<ChannelDetail | null> {
    const row = await this.db('channels')
      .where({ uuid: channelUuid })
      .whereNull('deleted_at')
      .first<ChannelRow>();
    if (!row) return null;

    const channelId = String(row.id);
    const settings = await this.db('channel_settings')
      .where({ channel_id: channelId, user_id: viewerUserId })
      .whereNull('deleted_at')
      .first<SettingsRow>();

    const myRole = await this.getMemberRole(channelId, viewerUserId);
    const canSeeFollowers = myRole === 'owner' || myRole === 'admin';
    const members = await this.listMembers(channelId, {
      includeFollowers: canSeeFollowers,
    });

    let lastSenderId: string | null = null;
    if (row.last_sender_id != null) {
      lastSenderId = await this.findUserUuidById(String(row.last_sender_id));
    }

    const unreadCount = await this.countUnread(
      channelId,
      viewerUserId,
      settings?.last_read_message_id != null
        ? String(settings.last_read_message_id)
        : null,
    );

    return {
      ...this.mapChannelDto(
        row,
        settings,
        lastSenderId,
        myRole,
        unreadCount,
      ),
      members,
      myRole,
    };
  }

  async findMessageInternalId(
    channelId: string,
    messageUuid: string,
  ): Promise<string | null> {
    const row = await this.db('channel_messages')
      .where({ channel_id: channelId, uuid: messageUuid })
      .whereNull('deleted_at')
      .first<{ id: string }>('id');
    return row?.id != null ? String(row.id) : null;
  }

  async findMessageUuidById(messageId: string): Promise<string | null> {
    const row = await this.db('channel_messages')
      .where({ id: messageId })
      .whereNull('deleted_at')
      .first<{ uuid: string }>('uuid');
    return row?.uuid ?? null;
  }

  async findLatestMessageId(channelId: string): Promise<string | null> {
    const row = await this.db('channels')
      .where({ id: channelId })
      .whereNull('deleted_at')
      .first<{ last_message_id: string | number | null }>('last_message_id');
    return row?.last_message_id != null ? String(row.last_message_id) : null;
  }

  async countUnread(
    channelId: string,
    userId: string,
    lastReadMessageId: string | null,
  ): Promise<number> {
    let query = this.db('channel_messages as m')
      .where({ 'm.channel_id': channelId })
      .whereNull('m.deleted_at')
      .whereNotExists(function hideDeletedForMe() {
        this.select(this.client.raw('1'))
          .from('channel_message_user_deletes as d')
          .whereRaw('d.channel_id = m.channel_id')
          .andWhereRaw('d.message_id = m.id')
          .andWhere('d.user_id', userId);
      });
    if (lastReadMessageId != null) {
      query = query.where('m.id', '>', lastReadMessageId);
    }
    const row = await query.count<{ count: string | number }>('* as count').first();
    return Number(row?.count ?? 0);
  }

  async markSeen(
    channelId: string,
    userId: string,
    messageId: string,
  ): Promise<void> {
    await this.db('channel_settings')
      .where({ channel_id: channelId, user_id: userId })
      .whereNull('deleted_at')
      .update({
        last_read_message_id: messageId,
        last_read_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
  }

  async markUnread(channelId: string, userId: string): Promise<number> {
    const channel = await this.db('channels')
      .where({ id: channelId })
      .whereNull('deleted_at')
      .first<{ last_message_id: string | number | null }>('last_message_id');
    if (channel?.last_message_id == null) return 0;

    const prev = await this.db('channel_messages')
      .where({ channel_id: channelId })
      .whereNull('deleted_at')
      .where('id', '<', channel.last_message_id)
      .orderBy('id', 'desc')
      .first<{ id: string | number }>('id');

    const lastReadId = prev?.id != null ? String(prev.id) : null;
    await this.db('channel_settings')
      .where({ channel_id: channelId, user_id: userId })
      .whereNull('deleted_at')
      .update({
        last_read_message_id: lastReadId,
        last_read_at: lastReadId ? this.db.fn.now() : null,
        updated_at: this.db.fn.now(),
      });

    return this.countUnread(channelId, userId, lastReadId);
  }

  async findMessageByUuid(messageUuid: string): Promise<{
    id: string;
    channelId: string;
    channelUuid: string;
    senderId: string;
    type: string;
  } | null> {
    const row = await this.db('channel_messages as m')
      .join('channels as c', 'c.id', 'm.channel_id')
      .where({ 'm.uuid': messageUuid })
      .whereNull('m.deleted_at')
      .whereNull('c.deleted_at')
      .first<{
        id: string | number;
        channel_id: string | number;
        channel_uuid: string;
        sender_id: string | number;
        type: string;
      }>(
        'm.id',
        'm.channel_id',
        'c.uuid as channel_uuid',
        'm.sender_id',
        'm.type',
      );
    if (!row) return null;
    return {
      id: String(row.id),
      channelId: String(row.channel_id),
      channelUuid: row.channel_uuid,
      senderId: String(row.sender_id),
      type: row.type,
    };
  }

  async deleteMessageForMe(data: {
    channelId: string;
    messageId: string;
    userId: string;
  }): Promise<boolean> {
    const exists = await this.db('channel_messages')
      .where({ channel_id: data.channelId, id: data.messageId })
      .whereNull('deleted_at')
      .first('id');
    if (!exists) return false;

    try {
      await this.db('channel_message_user_deletes').insert({
        channel_id: data.channelId,
        message_id: data.messageId,
        user_id: data.userId,
      });
    } catch {
      // unique (message_id, user_id) — already deleted for this user
    }

    return true;
  }

  async deleteMessageForEveryone(data: {
    channelId: string;
    messageId: string;
    actorId: string;
  }): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const updated = await trx('channel_messages')
        .where({
          channel_id: data.channelId,
          id: data.messageId,
        })
        .whereNull('deleted_at')
        .update({
          deleted_at: trx.fn.now(),
          deleted_by: data.actorId,
          body: null,
          updated_at: trx.fn.now(),
        });
      if (!updated) return false;

      const channel = await trx('channels')
        .where({ id: data.channelId })
        .first<{ last_message_id: string | number | null }>(
          'last_message_id',
        );

      if (
        channel?.last_message_id != null &&
        String(channel.last_message_id) === data.messageId
      ) {
        const prev = await trx('channel_messages')
          .where({ channel_id: data.channelId })
          .whereNull('deleted_at')
          .orderBy('id', 'desc')
          .first<{
            id: string | number;
            body: string | null;
            type: string;
            created_at: Date | string;
            sender_id: string | number;
          }>();

        const preview = prev
          ? prev.type === 'image'
            ? '📷 Photo'
            : prev.type === 'video'
              ? '🎥 Video'
              : prev.body
                ? truncateLastMessagePreview(prev.body)
                : null
          : null;

        await trx('channels').where({ id: data.channelId }).update({
          last_message_id: prev?.id ?? null,
          last_message_at: prev?.created_at ?? null,
          last_message_preview: preview,
          last_message_type: prev?.type ?? null,
          last_sender_id: prev?.sender_id ?? null,
          updated_at: trx.fn.now(),
        });
      }

      return true;
    });
  }

  async listMessages(
    channelId: string,
    userId: string,
    limit: number,
    cursorId?: string,
  ): Promise<{ rows: ChannelMessage[]; nextCursor: string | null }> {
    let query = this.db('channel_messages as m')
      .where('m.channel_id', channelId)
      .whereNull('m.deleted_at')
      .whereNotExists(function hideDeletedForMe() {
        this.select(this.client.raw('1'))
          .from('channel_message_user_deletes as d')
          .whereRaw('d.channel_id = m.channel_id')
          .andWhereRaw('d.message_id = m.id')
          .andWhere('d.user_id', userId);
      })
      .select(
        'm.id',
        'm.uuid',
        'm.channel_id',
        'm.sender_id',
        'm.type',
        'm.body',
        'm.reply_to_id',
        'm.is_edited',
        'm.edited_at',
        'm.created_at',
      )
      .orderBy('m.id', 'desc')
      .limit(limit + 1);

    if (cursorId) {
      query = query.where('m.id', '<', cursorId);
    }

    const dbRows = (await query) as Array<{
      id: string | number;
      uuid: string;
      channel_id: string | number;
      sender_id: string | number;
      type: string;
      body: string | null;
      reply_to_id: string | number | null;
      is_edited: boolean;
      edited_at: Date | string | null;
      created_at: Date | string;
    }>;

    const hasMore = dbRows.length > limit;
    const pageRows = hasMore ? dbRows.slice(0, limit) : dbRows;

    const channelUuid = await this.db('channels')
      .where({ id: channelId })
      .first<{ uuid: string }>('uuid');

    const senderIds = [
      ...new Set(pageRows.map((r) => String(r.sender_id))),
    ];
    const senderUuidById = new Map<string, string>();
    if (senderIds.length) {
      const users = await this.db('users')
        .whereIn('id', senderIds)
        .whereNull('deleted_at')
        .select('id', 'uuid');
      for (const u of users as Array<{ id: string | number; uuid: string }>) {
        senderUuidById.set(String(u.id), u.uuid);
      }
    }

    const replyIds = [
      ...new Set(
        pageRows
          .map((r) => r.reply_to_id)
          .filter((id): id is string | number => id != null)
          .map(String),
      ),
    ];
    const replyByInternalId = new Map<
      string,
      {
        uuid: string;
        body: string | null;
        type: string;
        sender_id: string | number;
      }
    >();
    if (replyIds.length) {
      const replies = await this.db('channel_messages')
        .where({ channel_id: channelId })
        .whereIn('id', replyIds)
        .select('id', 'uuid', 'body', 'type', 'sender_id');
      for (const r of replies as Array<{
        id: string | number;
        uuid: string;
        body: string | null;
        type: string;
        sender_id: string | number;
      }>) {
        replyByInternalId.set(String(r.id), r);
      }
      for (const r of replies as Array<{ sender_id: string | number }>) {
        senderIds.push(String(r.sender_id));
      }
      if (senderIds.length) {
        const unique = [...new Set(senderIds)];
        const extraMissing = unique.filter((id) => !senderUuidById.has(id));
        if (extraMissing.length) {
          const users = await this.db('users')
            .whereIn('id', extraMissing)
            .whereNull('deleted_at')
            .select('id', 'uuid');
          for (const u of users as Array<{
            id: string | number;
            uuid: string;
          }>) {
            senderUuidById.set(String(u.id), u.uuid);
          }
        }
      }
    }

    const rows: ChannelMessage[] = pageRows.map((r) => {
      let replyToId: string | null = null;
      let replyTo: ChannelMessageReplyPreview | null | undefined;
      if (r.reply_to_id != null) {
        const parent = replyByInternalId.get(String(r.reply_to_id));
        if (parent) {
          replyToId = parent.uuid;
          replyTo = {
            id: parent.uuid,
            body: parent.body,
            type: parent.type,
            senderId: senderUuidById.get(String(parent.sender_id)) ?? '',
          };
        }
      }
      return {
        id: r.uuid,
        channelId: channelUuid?.uuid ?? '',
        senderId: senderUuidById.get(String(r.sender_id)) ?? '',
        type: r.type,
        body: r.body,
        replyToId,
        replyTo: replyTo ?? null,
        isEdited: Boolean(r.is_edited),
        editedAt: toIso(r.edited_at),
        createdAt: toIso(r.created_at) as string,
      };
    });

    const mediaMessageIds = pageRows
      .filter((r) => r.type === 'image' || r.type === 'video')
      .map((r) => String(r.id));
    if (mediaMessageIds.length) {
      const mediasByMessageId = await this.loadMediasForMessages(
        channelId,
        mediaMessageIds,
      );
      for (let i = 0; i < pageRows.length; i += 1) {
        const internalId = String(pageRows[i]!.id);
        const medias = mediasByMessageId.get(internalId);
        if (medias?.length) rows[i]!.medias = medias;
      }
    }

    const nextCursor =
      hasMore && pageRows.length ? String(pageRows[pageRows.length - 1]!.id) : null;

    return { rows, nextCursor };
  }

  async saveMessage(data: {
    channelId: string;
    senderId: string;
    body: string;
    type?: 'text' | 'image' | 'video';
    mediaIds?: string[];
    clientMessageId?: string;
    replyToId?: string | null;
  }): Promise<ChannelMessage> {
    const type = data.type ?? 'text';
    const isMedia = type === 'image' || type === 'video';
    const preview = isMedia
      ? type === 'video'
        ? '🎥 Video'
        : '📷 Photo'
      : truncateLastMessagePreview(data.body);

    return this.db.transaction(async (trx) => {
      const [message] = await trx('channel_messages')
        .insert({
          uuid: newPublicId(),
          channel_id: data.channelId,
          sender_id: data.senderId,
          type,
          body: data.body || null,
          client_message_id: data.clientMessageId ?? null,
          reply_to_id: data.replyToId ?? null,
        })
        .returning([
          'id',
          'uuid',
          'channel_id',
          'sender_id',
          'type',
          'body',
          'reply_to_id',
          'is_edited',
          'edited_at',
          'created_at',
        ]);

      let medias: ChannelMessageMedia[] = [];
      if (isMedia && data.mediaIds?.length) {
        await this.insertMessageMediasInTrx(trx, {
          channelId: data.channelId,
          messageId: String(message.id),
          senderId: data.senderId,
          mediaIds: data.mediaIds,
        });
        const loaded = await this.loadMediasForMessages(
          data.channelId,
          [String(message.id)],
          trx,
        );
        medias = loaded.get(String(message.id)) ?? [];
      }

      await trx('channels').where({ id: data.channelId }).update({
        last_message_id: message.id,
        last_message_at: message.created_at,
        last_message_preview: preview,
        last_message_type: type,
        last_sender_id: data.senderId,
        updated_at: trx.fn.now(),
      });

      await trx('channel_settings')
        .where({ channel_id: data.channelId })
        .whereNull('deleted_at')
        .update({
          sort_at: message.created_at,
          updated_at: trx.fn.now(),
        });

      await trx('channel_settings')
        .where({ channel_id: data.channelId, user_id: data.senderId })
        .whereNull('deleted_at')
        .update({
          last_read_message_id: message.id,
          last_read_at: message.created_at,
          updated_at: trx.fn.now(),
        });

      return this.mapChannelMessageRow(
        trx,
        data.channelId,
        message as {
          id: string | number;
          uuid: string;
          channel_id: string | number;
          sender_id: string | number;
          type: string;
          body: string | null;
          reply_to_id: string | number | null;
          is_edited: boolean;
          edited_at: Date | string | null;
          created_at: Date | string;
        },
        medias,
      );
    });
  }

  async editMessage(data: {
    channelId: string;
    messageId: string;
    actorId: string;
    body: string;
  }): Promise<ChannelMessage | null> {
    const updated = await this.db('channel_messages')
      .where({
        channel_id: data.channelId,
        id: data.messageId,
      })
      .whereNull('deleted_at')
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
        'channel_id',
        'sender_id',
        'type',
        'body',
        'reply_to_id',
        'is_edited',
        'edited_at',
        'created_at',
      ]);

    const message = updated[0] as
      | {
          id: string | number;
          uuid: string;
          channel_id: string | number;
          sender_id: string | number;
          type: string;
          body: string | null;
          reply_to_id: string | number | null;
          is_edited: boolean;
          edited_at: Date | string | null;
          created_at: Date | string;
        }
      | undefined;
    if (!message) return null;

    const channel = await this.db('channels')
      .where({ id: data.channelId })
      .first<{ last_message_id: string | number | null }>('last_message_id');
    if (
      channel?.last_message_id != null &&
      String(channel.last_message_id) === data.messageId
    ) {
      const preview = truncateLastMessagePreview(data.body);
      await this.db('channels').where({ id: data.channelId }).update({
        last_message_preview: preview,
        updated_at: this.db.fn.now(),
      });
    }

    return this.mapChannelMessageRow(this.db, data.channelId, message, []);
  }

  async updateSettings(
    channelId: string,
    userId: string,
    input: ChannelSettingsInput,
  ): Promise<ChannelSettingsDto | null> {
    const patch: Record<string, unknown> = { updated_at: this.db.fn.now() };
    if (input.isMuted !== undefined) patch.is_muted = input.isMuted;
    if (input.isArchived !== undefined) patch.is_archived = input.isArchived;
    if (input.isPinned !== undefined) {
      patch.is_pinned = input.isPinned;
      patch.pinned_at = input.isPinned ? this.db.fn.now() : null;
    }

    const updated = await this.db('channel_settings')
      .where({ channel_id: channelId, user_id: userId })
      .whereNull('deleted_at')
      .update(patch);

    if (!updated) return null;

    const row = await this.db('channel_settings')
      .where({ channel_id: channelId, user_id: userId })
      .whereNull('deleted_at')
      .first<SettingsRow>();
    if (!row) return null;

    const unreadCount = await this.countUnread(
      channelId,
      userId,
      row.last_read_message_id != null
        ? String(row.last_read_message_id)
        : null,
    );

    return {
      isMuted: row.is_muted,
      isPinned: row.is_pinned,
      isArchived: row.is_archived,
      lastReadMessageId:
        row.last_read_message_id == null
          ? null
          : String(row.last_read_message_id),
      lastReadAt: toIso(row.last_read_at),
      unreadCount,
    };
  }

  private async mapChannelMessageRow(
    db: Knex | Knex.Transaction,
    channelId: string,
    message: {
      id: string | number;
      uuid: string;
      channel_id: string | number;
      sender_id: string | number;
      type: string;
      body: string | null;
      reply_to_id: string | number | null;
      is_edited: boolean;
      edited_at: Date | string | null;
      created_at: Date | string;
    },
    medias: ChannelMessageMedia[],
  ): Promise<ChannelMessage> {
    const channel = await db('channels')
      .where({ id: channelId })
      .first<{ uuid: string }>('uuid');
    const sender = await db('users')
      .where({ id: message.sender_id })
      .first<{ uuid: string }>('uuid');

    let replyToId: string | null = null;
    let replyTo: ChannelMessageReplyPreview | null = null;
    if (message.reply_to_id != null) {
      const parent = await db('channel_messages')
        .where({ channel_id: channelId, id: message.reply_to_id })
        .first<{
          uuid: string;
          body: string | null;
          type: string;
          sender_id: string | number;
        }>('uuid', 'body', 'type', 'sender_id');
      if (parent) {
        replyToId = parent.uuid;
        const parentSender = await db('users')
          .where({ id: parent.sender_id })
          .first<{ uuid: string }>('uuid');
        replyTo = {
          id: parent.uuid,
          body: parent.body,
          type: parent.type,
          senderId: parentSender?.uuid ?? '',
        };
      }
    }

    // For edits without re-loading medias, fill if needed
    let outMedias = medias;
    if (
      !outMedias.length &&
      (message.type === 'image' || message.type === 'video')
    ) {
      const loaded = await this.loadMediasForMessages(
        channelId,
        [String(message.id)],
        db,
      );
      outMedias = loaded.get(String(message.id)) ?? [];
    }

    return {
      id: message.uuid,
      channelId: channel?.uuid ?? '',
      senderId: sender?.uuid ?? '',
      type: message.type,
      body: message.body,
      replyToId,
      replyTo,
      isEdited: Boolean(message.is_edited),
      editedAt: toIso(message.edited_at),
      createdAt: toIso(message.created_at) as string,
      ...(outMedias.length ? { medias: outMedias } : {}),
    };
  }

  private async insertMessageMediasInTrx(
    trx: Knex.Transaction,
    data: {
      channelId: string;
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
          channel_id: data.channelId,
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
      await trx('channel_message_medias').insert(links);
    }
  }

  private async loadMediasForMessages(
    channelId: string,
    messageIds: string[],
    db: Knex | Knex.Transaction = this.db,
  ): Promise<Map<string, ChannelMessageMedia[]>> {
    const result = new Map<string, ChannelMessageMedia[]>();
    if (!messageIds.length) return result;

    const rows = (await db('channel_message_medias')
      .where({ channel_id: channelId })
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
      kind: ChannelMessageMedia['kind'];
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

  private mapChannelDto(
    row: ChannelRow,
    settings: SettingsRow | undefined,
    lastSenderId: string | null,
    myRole: ChannelMemberRole | null = null,
    unreadCount = 0,
  ): ChannelDto {
    const settingsDto: ChannelSettingsDto = settings
      ? {
          isMuted: settings.is_muted,
          isPinned: settings.is_pinned,
          isArchived: settings.is_archived,
          lastReadMessageId:
            settings.last_read_message_id == null
              ? null
              : String(settings.last_read_message_id),
          lastReadAt: toIso(settings.last_read_at),
          unreadCount,
        }
      : {
          isMuted: false,
          isPinned: false,
          isArchived: false,
          lastReadMessageId: null,
          lastReadAt: null,
          unreadCount: 0,
        };

    return {
      id: row.uuid,
      name: row.name,
      description: row.description,
      avatarPath: row.avatar_path,
      isPublic: row.is_public,
      inviteSlug: row.invite_slug ?? row.uuid,
      followersCount: row.followers_count,
      adminsCount: row.admins_count,
      lastMessageAt: toIso(row.last_message_at),
      lastMessagePreview: row.last_message_preview,
      lastMessageType: row.last_message_type,
      lastMessageSenderId: lastSenderId,
      settings: settingsDto,
      myRole,
      createdAt: toIso(row.created_at) as string,
    };
  }
}
