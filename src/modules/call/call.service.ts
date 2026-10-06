import { newPublicId } from '../../shared/ids/index.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/index.js';
import { ChatRepository } from '../chat/chat.repository.js';
import { publishChatRealtime } from '../chat/chat.realtime.js';
import type { ChatMessage } from '../chat/chat.types.js';
import { buildAgoraRtcToken, getAgoraAppId } from './call.agora.js';
import { CallRepository, type CallRow } from './call.repository.js';
import type {
  CallSessionPayload,
  CallStatus,
  CallType,
  CreateCallInput,
} from './call.types.js';

const RING_TIMEOUT_MS = 45_000;

function formatCallDuration(startedAt: Date | string | null, endedAt: Date | string | null): number {
  if (!startedAt || !endedAt) return 0;
  const a = startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt).getTime();
  const b = endedAt instanceof Date ? endedAt.getTime() : new Date(endedAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.max(0, Math.round((b - a) / 1000));
}

function formatDurationLabel(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function callHistoryBody(
  callType: CallType,
  status: CallStatus,
  durationSec: number,
  isGroup: boolean,
): string {
  const kind = isGroup
    ? callType === 'video'
      ? 'Group video call'
      : 'Group voice call'
    : callType === 'video'
      ? 'Video call'
      : 'Voice call';
  if (status === 'missed') {
    return isGroup
      ? callType === 'video'
        ? 'Missed group video call'
        : 'Missed group voice call'
      : callType === 'video'
        ? 'Missed video call'
        : 'Missed voice call';
  }
  if (status === 'declined') {
    return callType === 'video' ? 'Declined video call' : 'Declined voice call';
  }
  if (status === 'cancelled') {
    return callType === 'video'
      ? 'Cancelled video call'
      : 'Cancelled voice call';
  }
  if (durationSec > 0) {
    return `${kind} · ${formatDurationLabel(durationSec)}`;
  }
  return kind;
}

export class CallService {
  constructor(
    private readonly repo = new CallRepository(),
    private readonly chatRepo = new ChatRepository(),
  ) {}

  private async sessionFor(
    row: CallRow,
    userUuid: string,
  ): Promise<CallSessionPayload> {
    const call = await this.repo.toDto(row);
    const token = buildAgoraRtcToken(call.channelName, userUuid);
    return {
      call,
      token,
      uid: userUuid,
      appId: getAgoraAppId(),
    };
  }

  private async insertCallHistoryMessage(input: {
    conversationId: string;
    callerId: string;
    callUuid: string;
    callType: CallType;
    status: CallStatus;
    startedAt: Date | string | null;
    endedAt: Date | string | null;
    isGroup: boolean;
  }): Promise<ChatMessage | null> {
    try {
      const durationSec = formatCallDuration(input.startedAt, input.endedAt);
      const body = callHistoryBody(
        input.callType,
        input.status,
        durationSec,
        input.isGroup,
      );
      const saved = await this.chatRepo.saveMessage({
        conversationId: input.conversationId,
        senderId: input.callerId,
        body,
        type: 'call',
        meta: {
          call: {
            id: input.callUuid,
            callType: input.callType,
            status: input.status,
            durationSec,
            isGroup: input.isGroup,
          },
        },
      });
      const mapped = await this.chatRepo.mapSavedMessage(saved);
      const participants = await this.chatRepo.listParticipantUuids(
        input.conversationId,
      );
      const unreadByUserId = participants.length
        ? await this.chatRepo.listUnreadCountsByUserUuids(
            input.conversationId,
            participants,
          )
        : undefined;
      await publishChatRealtime({
        type: 'message.created',
        conversationId: mapped.conversationId,
        message: mapped,
        notifyUserIds: participants,
        unreadByUserId,
      });
      return mapped;
    } catch {
      return null;
    }
  }

  private async isGroupCall(row: CallRow): Promise<boolean> {
    if (row.conversation_type) return row.conversation_type === 'group';
    const type = await this.repo.getConversationType(String(row.conversation_id));
    return type === 'group';
  }

  private callAgeMs(row: CallRow): number {
    const raw = row.created_at;
    const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
    return Number.isFinite(t) ? Date.now() - t : Number.POSITIVE_INFINITY;
  }

  /**
   * Socket restarts / page refresh leave ringing|ongoing rows that block
   * new calls ("You are already in a call"). When the user explicitly
   * starts a new call, always supersede their previous session.
   */
  private async supersedeActiveCall(row: CallRow): Promise<void> {
    const nextStatus =
      row.status === 'ringing' ? 'cancelled' : 'ended';
    await this.repo.forceCloseCall(String(row.id), nextStatus);
  }

  /**
   * End any other live call for this user (WhatsApp: accept new → drop current).
   * Returns peers that must be notified the old call ended.
   */
  private async supersedeOtherCallsForUser(
    userId: string,
    keepCallUuid: string,
  ): Promise<Array<{ callId: string; notifyUuids: string[]; status: CallStatus }>> {
    const closed: Array<{
      callId: string;
      notifyUuids: string[];
      status: CallStatus;
    }> = [];

    // Loop in case of rare multi-zombie rows
    for (let i = 0; i < 5; i++) {
      const other = await this.repo.findActiveCallForUser(userId);
      if (!other || other.uuid === keepCallUuid) break;

      const notifyUuids = await this.repo.listAllParticipantUuids(
        String(other.id),
      );
      const status: CallStatus =
        other.status === 'ringing' ? 'cancelled' : 'ended';
      await this.repo.forceCloseCall(String(other.id), status);
      closed.push({
        callId: other.uuid,
        notifyUuids,
        status,
      });
    }
    return closed;
  }

  private async clearStaleActiveCallIfNeeded(row: CallRow): Promise<boolean> {
    const age = this.callAgeMs(row);
    if (row.status === 'ringing' && age > RING_TIMEOUT_MS) {
      await this.repo.forceCloseCall(String(row.id), 'missed');
      return true;
    }
    if (row.status === 'ongoing') {
      const joined = await this.repo.countJoinedParticipants(String(row.id));
      const isGroup = await this.isGroupCall(row);
      // Group call with anyone still connected is live — don't force-close.
      if (isGroup && joined >= 1) return false;
      // Solo / abandoned after refresh, or very old zombie sessions
      if ((joined <= 1 && age > RING_TIMEOUT_MS) || age > 2 * 60_000) {
        await this.repo.forceCloseCall(String(row.id), 'ended');
        return true;
      }
    }
    return false;
  }

  async createCall(
    actorUuid: string,
    input: CreateCallInput,
  ): Promise<CallSessionPayload & { inviteeUuids: string[] }> {
    const type: CallType = input.type === 'video' ? 'video' : 'audio';
    const callerId = await this.repo.findUserIdByUuid(actorUuid);
    if (!callerId) throw new NotFoundError('User not found');

    const conversation = await this.repo.findConversationByUuid(
      input.conversationId,
    );
    if (!conversation) throw new NotFoundError('Conversation not found');

    const isMember = await this.repo.isParticipant(conversation.id, callerId);
    if (!isMember) throw new ForbiddenError('Not a participant');

    const memberIds = await this.repo.listConversationMemberIds(conversation.id);
    if (memberIds.length < 2) {
      throw new ValidationError('Need at least 2 members to start a call');
    }

    // Always replace caller's prior session — UI "Start call" means they are
    // not in a live call (zombies from refresh/missed hangup are common).
    const busyCaller = await this.repo.findActiveCallForUser(callerId);
    if (busyCaller) {
      await this.supersedeActiveCall(busyCaller);
    }

    let calleeId: string | null = null;
    if (conversation.type === 'direct') {
      calleeId = await this.repo.findDirectPeerUserId(conversation.id, callerId);
      if (!calleeId) throw new NotFoundError('Callee not found');
      // WhatsApp-style: still ring / push even if callee is on another call.
      // They can Accept to drop the current call, or Decline / ignore.
      const busyCallee = await this.repo.findActiveCallForUser(calleeId);
      if (busyCallee) {
        await this.clearStaleActiveCallIfNeeded(busyCallee);
      }
    }

    const channelName = `call_${newPublicId().replace(/-/g, '').slice(0, 24)}`;
    const row = await this.repo.createCall({
      conversationId: conversation.id,
      callerId,
      calleeId,
      type,
      channelName,
      memberIds,
    });

    const enriched: CallRow = {
      ...row,
      conversation_uuid: conversation.uuid,
      conversation_type: conversation.type,
      conversation_title: conversation.title,
    };

    const session = await this.sessionFor(enriched, actorUuid);
    const inviteeUuids = session.call.participants
      .filter((p) => p.userId !== actorUuid && p.state === 'ringing')
      .map((p) => p.userId);

    return { ...session, inviteeUuids };
  }

  async buildSessionForUser(
    actorUuid: string,
    callId: string,
  ): Promise<CallSessionPayload> {
    const row = await this.repo.findByUuid(callId);
    if (!row) throw new NotFoundError('Call not found');
    return this.sessionFor(row, actorUuid);
  }

  async acceptCall(
    actorUuid: string,
    callId: string,
  ): Promise<{
    joinerSession: CallSessionPayload;
    /** Already-joined peers that should receive a full Agora session (e.g. caller) */
    joinedPeerUuids: string[];
    /** Still-ringing invitees — participant update only */
    ringingUuids: string[];
    /** Left / declined members — so clients can refresh Join banner */
    watcherUuids: string[];
    firstAccept: boolean;
    /** Other calls this user left to take this one (WhatsApp replace) */
    superseded: Array<{
      callId: string;
      notifyUuids: string[];
      status: CallStatus;
    }>;
  }> {
    const userId = await this.repo.findUserIdByUuid(actorUuid);
    if (!userId) throw new NotFoundError('User not found');

    const row = await this.repo.findByUuid(callId);
    if (!row) throw new NotFoundError('Call not found');

    if (row.status !== 'ringing' && row.status !== 'ongoing') {
      throw new ConflictError('Call is no longer available');
    }

    // Accepting a new call ends any other live session for this user.
    const superseded = await this.supersedeOtherCallsForUser(userId, callId);

    const isGroup = await this.isGroupCall(row);
    let participant = await this.repo.getParticipant(String(row.id), userId);
    const isLegacyCallee =
      row.callee_id != null && String(row.callee_id) === userId;

    if (!participant && !isLegacyCallee) {
      // Group members may join/rejoin an active call even if their row was
      // missing (or they were added to the chat after the call started).
      if (isGroup) {
        const isMember = await this.repo.isParticipant(
          String(row.conversation_id),
          userId,
        );
        if (!isMember) throw new ForbiddenError('Not invited to this call');
        await this.repo.ensureParticipant(String(row.id), userId, 'member');
        participant = await this.repo.getParticipant(String(row.id), userId);
      } else {
        throw new ForbiddenError('Not invited to this call');
      }
    }

    if (participant) {
      const canJoinNow = ['ringing', 'joined'].includes(participant.state);
      const canRejoinGroup =
        isGroup &&
        ['left', 'declined', 'missed'].includes(participant.state);
      if (!canJoinNow && !canRejoinGroup) {
        throw new ConflictError('You cannot join this call');
      }
    }

    let firstAccept = false;
    let updated = row;
    if (row.status === 'ringing') {
      const next = await this.repo.updateStatus(String(row.id), 'ongoing', {
        startedAt: true,
      });
      if (!next) throw new NotFoundError('Call not found');
      updated = { ...row, ...next, status: 'ongoing' };
      firstAccept = true;
    }

    await this.repo.updateParticipantState(String(row.id), userId, 'joined');

    const joinerSession = await this.sessionFor(updated, actorUuid);
    const joinedPeerUuids = (
      await this.repo.listParticipantUuidsByStates(String(row.id), ['joined'])
    ).filter((id) => id !== actorUuid);
    const ringingUuids = (
      await this.repo.listParticipantUuidsByStates(String(row.id), ['ringing'])
    ).filter((id) => id !== actorUuid);
    const watcherUuids = (
      await this.repo.listParticipantUuidsByStates(String(row.id), [
        'left',
        'declined',
        'missed',
      ])
    ).filter((id) => id !== actorUuid);

    return {
      joinerSession,
      joinedPeerUuids,
      ringingUuids,
      watcherUuids,
      firstAccept,
      superseded,
    };
  }

  async getActiveCallForConversation(
    actorUuid: string,
    conversationId: string,
  ): Promise<Awaited<ReturnType<CallRepository['toDto']>> | null> {
    const userId = await this.repo.findUserIdByUuid(actorUuid);
    if (!userId) throw new NotFoundError('User not found');

    const conversation = await this.repo.findConversationByUuid(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found');

    const isMember = await this.repo.isParticipant(conversation.id, userId);
    if (!isMember) throw new ForbiddenError('Not a participant');

    const row = await this.repo.findActiveCallForConversation(conversation.id);
    if (!row) return null;

    const enriched = await this.repo.findByUuid(row.uuid);
    if (!enriched) return null;
    return this.repo.toDto(enriched);
  }

  async declineCall(
    actorUuid: string,
    callId: string,
  ): Promise<{
    notifyUuids: string[];
    callId: string;
    callEnded: boolean;
    message: ChatMessage | null;
    call: Awaited<ReturnType<CallRepository['toDto']>> | null;
  }> {
    const userId = await this.repo.findUserIdByUuid(actorUuid);
    if (!userId) throw new NotFoundError('User not found');

    const row = await this.repo.findByUuid(callId);
    if (!row) throw new NotFoundError('Call not found');

    const participant = await this.repo.getParticipant(String(row.id), userId);
    const isLegacyCallee =
      row.callee_id != null && String(row.callee_id) === userId;
    if (!participant && !isLegacyCallee) {
      throw new ForbiddenError('Not invited to this call');
    }
    if (row.status !== 'ringing' && row.status !== 'ongoing') {
      throw new ConflictError('Call is no longer available');
    }

    await this.repo.updateParticipantState(String(row.id), userId, 'declined');

    const isGroup = await this.isGroupCall(row);
    const notifyUuids = (
      await this.repo.listAllParticipantUuids(String(row.id))
    ).filter((id) => id !== actorUuid);

    // Direct: decline ends the call. Group: only end if still ringing and
    // nobody else is left ringing (everyone declined).
    if (!isGroup && row.status === 'ringing') {
      const updated = await this.repo.updateStatus(String(row.id), 'declined', {
        endedAt: true,
      });
      const message = await this.insertCallHistoryMessage({
        conversationId: String(row.conversation_id),
        callerId: String(row.caller_id),
        callUuid: row.uuid,
        callType: row.type,
        status: 'declined',
        startedAt: updated?.started_at ?? row.started_at,
        endedAt: updated?.ended_at ?? new Date(),
        isGroup: false,
      });
      return {
        notifyUuids,
        callId: row.uuid,
        callEnded: true,
        message,
        call: await this.repo.toDto({ ...row, status: 'declined' }),
      };
    }

    if (isGroup && row.status === 'ringing') {
      const stillRinging = await this.repo.listParticipantUuidsByStates(
        String(row.id),
        ['ringing'],
      );
      if (stillRinging.length === 0) {
        const updated = await this.repo.updateStatus(String(row.id), 'missed', {
          endedAt: true,
        });
        const message = await this.insertCallHistoryMessage({
          conversationId: String(row.conversation_id),
          callerId: String(row.caller_id),
          callUuid: row.uuid,
          callType: row.type,
          status: 'missed',
          startedAt: updated?.started_at ?? row.started_at,
          endedAt: updated?.ended_at ?? new Date(),
          isGroup: true,
        });
        return {
          notifyUuids,
          callId: row.uuid,
          callEnded: true,
          message,
          call: await this.repo.toDto({ ...row, status: 'missed' }),
        };
      }
    }

    return {
      notifyUuids,
      callId: row.uuid,
      callEnded: false,
      message: null,
      call: await this.repo.toDto(row),
    };
  }

  async leaveCall(
    actorUuid: string,
    callId: string,
  ): Promise<{
    notifyUuids: string[];
    callId: string;
    callEnded: boolean;
    status: string;
    message: ChatMessage | null;
  }> {
    const userId = await this.repo.findUserIdByUuid(actorUuid);
    if (!userId) throw new NotFoundError('User not found');

    const row = await this.repo.findByUuid(callId);
    if (!row) throw new NotFoundError('Call not found');

    const participant = await this.repo.getParticipant(String(row.id), userId);
    const isCaller = String(row.caller_id) === userId;
    const isCallee =
      row.callee_id != null && String(row.callee_id) === userId;
    if (!participant && !isCaller && !isCallee) {
      throw new ForbiddenError('Not a participant of this call');
    }

    if (
      row.status === 'ended' ||
      row.status === 'missed' ||
      row.status === 'declined' ||
      row.status === 'cancelled'
    ) {
      const notifyUuids = (
        await this.repo.listAllParticipantUuids(String(row.id))
      ).filter((id) => id !== actorUuid);
      return {
        notifyUuids,
        callId: row.uuid,
        callEnded: true,
        status: row.status,
        message: null,
      };
    }

    const isGroup = await this.isGroupCall(row);

    // Direct leave === end
    if (!isGroup) {
      const ended = await this.endCall(actorUuid, callId);
      return {
        notifyUuids: ended.notifyUuids,
        callId: ended.callId,
        callEnded: true,
        status: ended.status,
        message: ended.message,
      };
    }

    await this.repo.updateParticipantState(String(row.id), userId, 'left');
    const joinedLeft = await this.repo.countJoinedParticipants(String(row.id));
    const notifyUuids = (
      await this.repo.listAllParticipantUuids(String(row.id))
    ).filter((id) => id !== actorUuid);

    if (joinedLeft === 0) {
      const nextStatus: CallStatus =
        row.status === 'ringing' ? 'missed' : 'ended';
      await this.repo.markRingingParticipantsMissed(String(row.id));
      const updated = await this.repo.updateStatus(String(row.id), nextStatus, {
        endedAt: true,
      });
      const message = await this.insertCallHistoryMessage({
        conversationId: String(row.conversation_id),
        callerId: String(row.caller_id),
        callUuid: row.uuid,
        callType: row.type,
        status: nextStatus,
        startedAt: updated?.started_at ?? row.started_at,
        endedAt: updated?.ended_at ?? new Date(),
        isGroup: true,
      });
      return {
        notifyUuids,
        callId: row.uuid,
        callEnded: true,
        status: nextStatus,
        message,
      };
    }

    return {
      notifyUuids,
      callId: row.uuid,
      callEnded: false,
      status: row.status,
      message: null,
    };
  }

  async endCall(
    actorUuid: string,
    callId: string,
  ): Promise<{
    peerUuid: string;
    notifyUuids: string[];
    callId: string;
    status: string;
    message: ChatMessage | null;
    reason: 'cancelled' | 'rejected' | 'missed' | 'ended';
  }> {
    const userId = await this.repo.findUserIdByUuid(actorUuid);
    if (!userId) throw new NotFoundError('User not found');

    const row = await this.repo.findByUuid(callId);
    if (!row) throw new NotFoundError('Call not found');

    const participant = await this.repo.getParticipant(String(row.id), userId);
    const isCaller = String(row.caller_id) === userId;
    const isCallee =
      row.callee_id != null && String(row.callee_id) === userId;
    if (!participant && !isCaller && !isCallee) {
      throw new ForbiddenError('Not a participant of this call');
    }

    const notifyUuids = (
      await this.repo.listAllParticipantUuids(String(row.id))
    ).filter((id) => id !== actorUuid);

    if (
      row.status === 'ended' ||
      row.status === 'missed' ||
      row.status === 'declined' ||
      row.status === 'cancelled'
    ) {
      const peerUuid = notifyUuids[0] ?? '';
      return {
        peerUuid,
        notifyUuids,
        callId: row.uuid,
        status: row.status,
        message: null,
        reason:
          row.status === 'cancelled'
            ? ('cancelled' as const)
            : row.status === 'declined'
              ? ('rejected' as const)
              : row.status === 'missed'
                ? ('missed' as const)
                : ('ended' as const),
      };
    }

    const isGroup = await this.isGroupCall(row);
    // Caller cancels before pickup → cancelled (not missed).
    // Missed is reserved for ring timeout / no answer.
    const nextStatus: CallStatus =
      row.status === 'ringing' && isCaller ? 'cancelled' : 'ended';
    const reason =
      row.status === 'ringing' && isCaller
        ? ('cancelled' as const)
        : ('ended' as const);

    await this.repo.markRingingParticipantsMissed(String(row.id));
    if (participant || isCaller || isCallee) {
      await this.repo.updateParticipantState(String(row.id), userId, 'left');
    }

    const updated = await this.repo.updateStatus(String(row.id), nextStatus, {
      endedAt: true,
    });

    const message = await this.insertCallHistoryMessage({
      conversationId: String(row.conversation_id),
      callerId: String(row.caller_id),
      callUuid: row.uuid,
      callType: row.type,
      status: nextStatus,
      startedAt: updated?.started_at ?? row.started_at,
      endedAt: updated?.ended_at ?? new Date(),
      isGroup,
    });

    return {
      peerUuid: notifyUuids[0] ?? '',
      notifyUuids,
      callId: row.uuid,
      status: nextStatus,
      message,
      reason,
    };
  }

  async markMissedIfStillRinging(
    callId: string,
  ): Promise<{ callerUuid: string; notifyUuids: string[]; message: ChatMessage | null } | null> {
    const row = await this.repo.findByUuid(callId);
    if (!row || row.status !== 'ringing') return null;

    const isGroup = await this.isGroupCall(row);
    await this.repo.markActiveParticipantsLeft(String(row.id));
    const updated = await this.repo.updateStatus(String(row.id), 'missed', {
      endedAt: true,
    });
    const callerUuid =
      row.caller_uuid ??
      (await this.repo.findUserUuidById(String(row.caller_id)));
    if (!callerUuid) return null;

    const notifyUuids = (
      await this.repo.listAllParticipantUuids(String(row.id))
    ).filter((id) => id !== callerUuid);

    const message = await this.insertCallHistoryMessage({
      conversationId: String(row.conversation_id),
      callerId: String(row.caller_id),
      callUuid: row.uuid,
      callType: row.type,
      status: 'missed',
      startedAt: updated?.started_at ?? row.started_at,
      endedAt: updated?.ended_at ?? new Date(),
      isGroup,
    });

    return { callerUuid, notifyUuids, message };
  }

  /**
   * Page refresh / tab close / socket gone — drop this user from their live call.
   * Direct → end; group → leave (ends when last joined leaves).
   */
  async leaveActiveCallOnDisconnect(actorUuid: string): Promise<{
    callId: string;
    notifyUuids: string[];
    callEnded: boolean;
    status: string;
  } | null> {
    const userId = await this.repo.findUserIdByUuid(actorUuid);
    if (!userId) return null;

    const row = await this.repo.findActiveCallForUser(userId);
    if (!row) return null;

    const participant = await this.repo.getParticipant(String(row.id), userId);
    // Still ringing invitee who never joined — treat as decline so caller
    // gets rejected/busy-style cleanup instead of a silent "ended".
    if (
      row.status === 'ringing' &&
      participant?.state === 'ringing' &&
      String(row.caller_id) !== userId
    ) {
      const declined = await this.declineCall(actorUuid, row.uuid);
      return {
        callId: declined.callId,
        notifyUuids: declined.notifyUuids,
        callEnded: declined.callEnded,
        status: declined.call?.status ?? 'declined',
      };
    }

    const left = await this.leaveCall(actorUuid, row.uuid);
    return {
      callId: left.callId,
      notifyUuids: left.notifyUuids,
      callEnded: left.callEnded,
      status: left.status,
    };
  }

  get ringTimeoutMs(): number {
    return RING_TIMEOUT_MS;
  }
}
