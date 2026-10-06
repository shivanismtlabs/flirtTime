import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { newPublicId } from '../../shared/ids/index.js';
import {
  pickProfilePictureUrl,
  resolveProfilePictureUrls,
} from '../../shared/media/profile-picture.js';
import type {
  CallDto,
  CallParticipantDto,
  CallParticipantState,
  CallStatus,
  CallType,
  CallUserSummary,
} from './call.types.js';
import { getAgoraAppId } from './call.agora.js';

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type CallRow = {
  id: string | number;
  uuid: string;
  conversation_id: string | number;
  caller_id: string | number;
  callee_id: string | number | null;
  type: CallType;
  status: CallStatus;
  channel_name: string;
  started_at: Date | string | null;
  ended_at: Date | string | null;
  created_at: Date | string;
  conversation_uuid?: string;
  conversation_type?: 'direct' | 'group';
  conversation_title?: string | null;
  caller_uuid?: string;
  callee_uuid?: string | null;
};

type ParticipantRow = {
  call_id: string | number;
  user_id: string | number;
  role: 'caller' | 'member';
  state: CallParticipantState;
  user_uuid?: string;
};

export class CallRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async findUserIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('users')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string | number }>('id');
    return row?.id != null ? String(row.id) : null;
  }

  async findUserUuidById(id: string): Promise<string | null> {
    const row = await this.db('users')
      .where({ id })
      .whereNull('deleted_at')
      .first<{ uuid: string }>('uuid');
    return row?.uuid ?? null;
  }

  async findConversationByUuid(uuid: string): Promise<{
    id: string;
    uuid: string;
    type: 'direct' | 'group';
    title: string | null;
  } | null> {
    const row = await this.db('conversations')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{
        id: string | number;
        uuid: string;
        type: 'direct' | 'group';
        title: string | null;
      }>('id', 'uuid', 'type', 'title');
    if (!row) return null;
    return {
      id: String(row.id),
      uuid: row.uuid,
      type: row.type,
      title: row.title,
    };
  }

  async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    const row = await this.db('conversation_participants')
      .where({
        conversation_id: conversationId,
        user_id: userId,
        is_active: true,
      })
      .first('id');
    return Boolean(row);
  }

  async listConversationMemberIds(conversationId: string): Promise<string[]> {
    const rows = await this.db('conversation_participants')
      .where({ conversation_id: conversationId, is_active: true })
      .select('user_id');
    return (rows as Array<{ user_id: string | number }>).map((r) =>
      String(r.user_id),
    );
  }

  async findDirectPeerUserId(
    conversationId: string,
    viewerUserId: string,
  ): Promise<string | null> {
    const row = await this.db('conversation_participants')
      .where({ conversation_id: conversationId, is_active: true })
      .whereNot('user_id', viewerUserId)
      .first<{ user_id: string | number }>('user_id');
    return row?.user_id != null ? String(row.user_id) : null;
  }

  async findActiveCallForUser(userId: string): Promise<CallRow | null> {
    const viaParticipants = await this.db('call_participants as cp')
      .join('calls as c', 'c.id', 'cp.call_id')
      .where('cp.user_id', userId)
      .whereIn('cp.state', ['ringing', 'joined'])
      .whereIn('c.status', ['ringing', 'ongoing'])
      .orderBy('c.id', 'desc')
      .first<CallRow>('c.*');
    if (viaParticipants) return viaParticipants;

    const row = await this.db('calls')
      .whereIn('status', ['ringing', 'ongoing'])
      .andWhere((qb) => {
        qb.where('caller_id', userId).orWhere('callee_id', userId);
      })
      .orderBy('id', 'desc')
      .first<CallRow>();
    return row ?? null;
  }

  async findActiveCallForConversation(
    conversationId: string,
  ): Promise<CallRow | null> {
    const row = await this.db('calls')
      .where({ conversation_id: conversationId })
      .whereIn('status', ['ringing', 'ongoing'])
      .orderBy('id', 'desc')
      .first<CallRow>();
    return row ?? null;
  }

  async createCall(data: {
    conversationId: string;
    callerId: string;
    calleeId: string | null;
    type: CallType;
    channelName: string;
    memberIds: string[];
  }): Promise<CallRow> {
    return this.db.transaction(async (trx) => {
      const [row] = await trx('calls')
        .insert({
          uuid: newPublicId(),
          conversation_id: data.conversationId,
          caller_id: data.callerId,
          callee_id: data.calleeId,
          type: data.type,
          status: 'ringing',
          channel_name: data.channelName,
        })
        .returning('*');

      const callId = (row as CallRow).id;
      const participantRows = data.memberIds.map((userId) => ({
        call_id: callId,
        user_id: userId,
        role: userId === data.callerId ? ('caller' as const) : ('member' as const),
        state:
          userId === data.callerId
            ? ('joined' as const)
            : ('ringing' as const),
        joined_at: userId === data.callerId ? trx.fn.now() : null,
      }));
      if (participantRows.length) {
        await trx('call_participants').insert(participantRows);
      }
      return row as CallRow;
    });
  }

  async findByUuid(uuid: string): Promise<CallRow | null> {
    const row = await this.db('calls as c')
      .join('conversations as conv', 'conv.id', 'c.conversation_id')
      .join('users as caller', 'caller.id', 'c.caller_id')
      .leftJoin('users as callee', 'callee.id', 'c.callee_id')
      .where('c.uuid', uuid)
      .first<CallRow>(
        'c.*',
        'conv.uuid as conversation_uuid',
        'conv.type as conversation_type',
        'conv.title as conversation_title',
        'caller.uuid as caller_uuid',
        'callee.uuid as callee_uuid',
      );
    return row ?? null;
  }

  async updateStatus(
    callId: string,
    status: CallStatus,
    patch?: { startedAt?: boolean; endedAt?: boolean },
  ): Promise<CallRow | null> {
    const update: Record<string, unknown> = {
      status,
      updated_at: this.db.fn.now(),
    };
    if (patch?.startedAt) update.started_at = this.db.fn.now();
    if (patch?.endedAt) update.ended_at = this.db.fn.now();

    const [row] = await this.db('calls')
      .where({ id: callId })
      .update(update)
      .returning('*');
    return (row as CallRow) ?? null;
  }

  async getParticipant(
    callId: string,
    userId: string,
  ): Promise<ParticipantRow | null> {
    const row = await this.db('call_participants')
      .where({ call_id: callId, user_id: userId })
      .first<ParticipantRow>();
    return row ?? null;
  }

  async updateParticipantState(
    callId: string,
    userId: string,
    state: CallParticipantState,
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      state,
      updated_at: this.db.fn.now(),
    };
    if (state === 'joined') {
      patch.joined_at = this.db.fn.now();
      patch.left_at = null;
    }
    if (state === 'left' || state === 'declined' || state === 'missed') {
      patch.left_at = this.db.fn.now();
    }
    await this.db('call_participants')
      .where({ call_id: callId, user_id: userId })
      .update(patch);
  }

  async ensureParticipant(
    callId: string,
    userId: string,
    role: 'caller' | 'member' = 'member',
  ): Promise<void> {
    const existing = await this.getParticipant(callId, userId);
    if (existing) return;
    await this.db('call_participants').insert({
      call_id: callId,
      user_id: userId,
      role,
      state: 'ringing',
    });
  }

  async countJoinedParticipants(callId: string): Promise<number> {
    const row = await this.db('call_participants')
      .where({ call_id: callId, state: 'joined' })
      .count<{ count: string }>('* as count')
      .first();
    return Number(row?.count ?? 0);
  }

  async listParticipantUuidsByStates(
    callId: string,
    states: CallParticipantState[],
  ): Promise<string[]> {
    const rows = await this.db('call_participants as cp')
      .join('users', 'users.id', 'cp.user_id')
      .where('cp.call_id', callId)
      .whereIn('cp.state', states)
      .whereNull('users.deleted_at')
      .select('users.uuid');
    return (rows as Array<{ uuid: string }>).map((r) => r.uuid);
  }

  async listAllParticipantUuids(callId: string): Promise<string[]> {
    const rows = await this.db('call_participants as cp')
      .join('users', 'users.id', 'cp.user_id')
      .where('cp.call_id', callId)
      .whereNull('users.deleted_at')
      .select('users.uuid');
    return (rows as Array<{ uuid: string }>).map((r) => r.uuid);
  }

  async markRingingParticipantsMissed(callId: string): Promise<void> {
    await this.db('call_participants')
      .where({ call_id: callId, state: 'ringing' })
      .update({
        state: 'missed',
        left_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
  }

  async markActiveParticipantsLeft(callId: string): Promise<void> {
    await this.db('call_participants')
      .where({ call_id: callId, state: 'ringing' })
      .update({
        state: 'missed',
        left_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
    await this.db('call_participants')
      .where({ call_id: callId, state: 'joined' })
      .update({
        state: 'left',
        left_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
  }

  async forceCloseCall(
    callId: string,
    status: 'missed' | 'ended' | 'cancelled' | 'declined',
  ): Promise<void> {
    await this.markActiveParticipantsLeft(callId);
    await this.updateStatus(callId, status, { endedAt: true });
  }

  async loadUserSummary(userId: string): Promise<CallUserSummary | null> {
    const row = await this.db('users as u')
      .leftJoin('user_details as d', 'd.user_id', 'u.id')
      .where('u.id', userId)
      .whereNull('u.deleted_at')
      .first<{
        uuid: string;
        username: string | null;
        full_name: string | null;
        profile_picture: string | null;
        is_verified: boolean | null;
      }>('u.uuid', 'd.username', 'd.full_name', 'd.profile_picture', 'd.is_verified');
    if (!row) return null;
    const urls = await resolveProfilePictureUrls([row.profile_picture]);
    return {
      id: row.uuid,
      username: row.username ?? 'user',
      fullName: row.full_name,
      profilePicture: pickProfilePictureUrl(row.profile_picture, urls),
      isVerified: Boolean(row.is_verified),
    };
  }

  async getConversationType(
    conversationId: string,
  ): Promise<'direct' | 'group'> {
    const row = await this.db('conversations')
      .where({ id: conversationId })
      .first<{ type: 'direct' | 'group' }>('type');
    return row?.type ?? 'direct';
  }

  async listParticipantsDto(callId: string): Promise<CallParticipantDto[]> {
    const rows = await this.db('call_participants as cp')
      .join('users as u', 'u.id', 'cp.user_id')
      .leftJoin('user_details as d', 'd.user_id', 'u.id')
      .where('cp.call_id', callId)
      .whereNull('u.deleted_at')
      .select(
        'cp.role',
        'cp.state',
        'u.uuid as user_uuid',
        'u.id as user_id',
        'd.username',
        'd.full_name',
        'd.profile_picture',
        'd.is_verified',
      );

    const typed = rows as Array<{
      role: 'caller' | 'member';
      state: CallParticipantState;
      user_uuid: string;
      user_id: string | number;
      username: string | null;
      full_name: string | null;
      profile_picture: string | null;
      is_verified: boolean | null;
    }>;

    const urls = await resolveProfilePictureUrls(
      typed.map((r) => r.profile_picture),
    );

    return typed.map((r) => ({
      userId: r.user_uuid,
      role: r.role,
      state: r.state,
      user: {
        id: r.user_uuid,
        username: r.username ?? 'user',
        fullName: r.full_name,
        profilePicture: pickProfilePictureUrl(r.profile_picture, urls),
        isVerified: Boolean(r.is_verified),
      },
    }));
  }

  async toDto(row: CallRow): Promise<CallDto> {
    const conversationUuid =
      row.conversation_uuid ??
      (
        await this.db('conversations')
          .where({ id: row.conversation_id })
          .first<{ uuid: string }>('uuid')
      )?.uuid ??
      '';

    let conversationType = row.conversation_type;
    let conversationTitle = row.conversation_title ?? null;
    if (!conversationType) {
      const conv = await this.db('conversations')
        .where({ id: row.conversation_id })
        .first<{ type: 'direct' | 'group'; title: string | null }>(
          'type',
          'title',
        );
      conversationType = conv?.type ?? 'direct';
      conversationTitle = conv?.title ?? null;
    }

    const callerUuid =
      row.caller_uuid ?? (await this.findUserUuidById(String(row.caller_id))) ?? '';
    const calleeUuid = row.callee_id
      ? row.callee_uuid ??
        (await this.findUserUuidById(String(row.callee_id)))
      : null;

    const [caller, callee, participants] = await Promise.all([
      this.loadUserSummary(String(row.caller_id)),
      row.callee_id
        ? this.loadUserSummary(String(row.callee_id))
        : Promise.resolve(null),
      this.listParticipantsDto(String(row.id)),
    ]);

    return {
      id: row.uuid,
      conversationId: conversationUuid,
      conversationType: conversationType ?? 'direct',
      conversationTitle,
      type: row.type,
      status: row.status,
      channelName: row.channel_name,
      callerId: callerUuid,
      calleeId: calleeUuid,
      caller,
      callee,
      participants,
      appId: getAgoraAppId(),
      startedAt: toIso(row.started_at),
      endedAt: toIso(row.ended_at),
      createdAt: toIso(row.created_at) as string,
    };
  }
}
