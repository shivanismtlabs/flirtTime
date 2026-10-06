import type { Server } from 'socket.io';
import type { CallRealtimePayload } from '../../../modules/call/call.realtime.js';
import { SOCKET_EVENT, SOCKET_ROOM } from '../../../shared/socket/index.js';

export function emitCallRealtime(
  io: Server,
  payload: CallRealtimePayload,
): void {
  if (payload.type === 'call.incoming') {
    for (const uuid of payload.notifyUserIds) {
      io.to(SOCKET_ROOM.user(uuid)).emit(SOCKET_EVENT.CALL_INCOMING, {
        call: payload.call,
        caller: payload.caller,
      });
    }
    return;
  }

  if (payload.type !== 'call.hangup') return;

  for (const uuid of payload.notifyUserIds) {
    // Group member left — do NOT end everyone else's call UI.
    io.to(SOCKET_ROOM.user(uuid)).emit(SOCKET_EVENT.CALL_PARTICIPANT_LEFT, {
      callId: payload.callId,
      userId: payload.by,
      callEnded: payload.callEnded,
      status: payload.status,
    });

    if (!payload.callEnded) continue;

    const ack = {
      callId: payload.callId,
      status: payload.status,
      reason: payload.reason ?? 'ended',
      callEnded: true,
      disconnected: true,
    };
    io.to(SOCKET_ROOM.user(uuid)).emit(SOCKET_EVENT.CALL_END_ACK, ack);

    if (payload.status === 'cancelled' || payload.reason === 'cancelled') {
      io.to(SOCKET_ROOM.user(uuid)).emit(SOCKET_EVENT.CALL_CANCELLED, {
        callId: payload.callId,
        by: payload.by,
        status: 'cancelled',
        reason: 'cancelled',
      });
    }
    if (payload.status === 'declined' || payload.reason === 'rejected') {
      io.to(SOCKET_ROOM.user(uuid)).emit(SOCKET_EVENT.CALL_REJECTED, {
        callId: payload.callId,
        by: payload.by,
        callEnded: true,
        reason: 'rejected',
      });
    }
  }
}
