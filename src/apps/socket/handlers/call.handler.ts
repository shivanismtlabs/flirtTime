import type { Server, Socket } from 'socket.io';
import { CallPushNotifier } from '../../../modules/call/call-push.notifier.js';
import { CallService } from '../../../modules/call/call.service.js';
import { AppError, ConflictError } from '../../../shared/errors/index.js';
import { logger } from '../../../shared/logger/index.js';
import { SOCKET_EVENT, SOCKET_ROOM } from '../../../shared/socket/index.js';
import { isUserOnline } from '../lib/presence.store.js';

const callService = new CallService();
const callPush = new CallPushNotifier();
const ringTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Pending disconnect hangups — cancelled if user reconnects quickly. */
const disconnectHangups = new Map<string, ReturnType<typeof setTimeout>>();

/** After last socket drops, briefly wait then leave call (covers failed unload emit).
 * Short enough that a full page refresh still hangs up before reconnect. */
const DISCONNECT_HANGUP_GRACE_MS = 900;

function clearRingTimer(callId: string): void {
  const t = ringTimers.get(callId);
  if (t) {
    clearTimeout(t);
    ringTimers.delete(callId);
  }
}

function clearDisconnectHangup(userUuid: string): void {
  const t = disconnectHangups.get(userUuid);
  if (t) {
    clearTimeout(t);
    disconnectHangups.delete(userUuid);
  }
}

function scheduleDisconnectHangup(
  io: Server,
  userUuid: string,
  callIdHint?: string | null,
): void {
  clearDisconnectHangup(userUuid);
  const timer = setTimeout(() => {
    disconnectHangups.delete(userUuid);
    void (async () => {
      try {
        // Another tab still connected — keep the call.
        if (isUserOnline(userUuid)) return;

        let result: {
          callId: string;
          notifyUuids: string[];
          callEnded: boolean;
          status: string;
        } | null = null;

        // Prefer the call this socket was on (survives REST keepalive that
        // already closed the row — still need to fan out END_ACK to peers).
        if (callIdHint) {
          try {
            const left = await callService.leaveCall(userUuid, callIdHint);
            result = {
              callId: left.callId,
              notifyUuids: left.notifyUuids,
              callEnded: left.callEnded,
              status: left.status,
            };
          } catch {
            result = await callService.leaveActiveCallOnDisconnect(userUuid);
          }
        } else {
          result = await callService.leaveActiveCallOnDisconnect(userUuid);
        }
        if (!result) return;

        // Only kill the whole call when nobody remains. A single member
        // refreshing a group call must not END_ACK everyone else.
        if (result.callEnded) {
          clearRingTimer(result.callId);
          emitToUsers(io, result.notifyUuids, SOCKET_EVENT.CALL_END_ACK, {
            callId: result.callId,
            status: result.status,
            reason: 'ended' as const,
            callEnded: true,
            disconnected: true,
          });
        }
        emitToUsers(io, result.notifyUuids, SOCKET_EVENT.CALL_PARTICIPANT_LEFT, {
          callId: result.callId,
          userId: userUuid,
          callEnded: result.callEnded,
          status: result.status,
        });
      } catch (err) {
        logger.warn({ err, userUuid }, 'Disconnect call hangup failed');
      }
    })();
  }, DISCONNECT_HANGUP_GRACE_MS);
  disconnectHangups.set(userUuid, timer);
}

function scheduleRingTimeout(io: Server, callId: string): void {
  clearRingTimer(callId);
  const timer = setTimeout(() => {
    ringTimers.delete(callId);
    void (async () => {
      try {
        const result = await callService.markMissedIfStillRinging(callId);
        if (!result) return;
        const payload = {
          callId,
          status: 'missed' as const,
          reason: 'missed' as const,
        };
        io.to(SOCKET_ROOM.user(result.callerUuid)).emit(
          SOCKET_EVENT.CALL_END_ACK,
          payload,
        );
        for (const uuid of result.notifyUuids) {
          io.to(SOCKET_ROOM.user(uuid)).emit(
            SOCKET_EVENT.CALL_END_ACK,
            payload,
          );
        }
      } catch (err) {
        logger.warn({ err, callId }, 'Call ring timeout failed');
      }
    })();
  }, callService.ringTimeoutMs);
  ringTimers.set(callId, timer);
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

function emitToUsers(
  io: Server,
  uuids: string[],
  event: string,
  payload: unknown,
): void {
  for (const uuid of uuids) {
    io.to(SOCKET_ROOM.user(uuid)).emit(event, payload);
  }
}

/** Never drop a client request-response event silently — UI waits on ACK. */
function emitCreateAck(
  socket: Socket,
  payload: {
    requestId?: string;
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  },
): void {
  socket.emit(SOCKET_EVENT.CALL_CREATE_ACK, payload);
}

function emitJoinAck(
  socket: Socket,
  payload: {
    requestId?: string;
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
    participantJoined?: string;
  },
): void {
  socket.emit(SOCKET_EVENT.CALL_JOIN, payload);
}

export function registerCallHandlers(io: Server, socket: Socket): void {
  socket.on(
    SOCKET_EVENT.CALL_CREATE,
    (payload: {
      conversationId?: string;
      type?: 'audio' | 'video';
      requestId?: string;
    }) => {
      void (async () => {
        if (!socket.user?.sub) {
          emitCreateAck(socket, {
            requestId: payload?.requestId,
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Not authenticated for calls',
            },
          });
          return;
        }
        const conversationId = payload?.conversationId?.trim();
        if (!conversationId) {
          emitCreateAck(socket, {
            requestId: payload?.requestId,
            success: false,
            error: {
              code: 'VALIDATION',
              message: 'conversationId is required',
            },
          });
          return;
        }

        try {
          const result = await callService.createCall(socket.user.sub, {
            conversationId,
            type: payload.type === 'video' ? 'video' : 'audio',
          });

          const { inviteeUuids, ...session } = result;
          void socket.join(SOCKET_ROOM.call(session.call.id));
          (
            socket.data as { activeCallId?: string }
          ).activeCallId = session.call.id;

          emitCreateAck(socket, {
            requestId: payload.requestId,
            success: true,
            data: session,
          });

          const incomingPayload = {
            call: session.call,
            caller: session.call.caller,
          };
          emitToUsers(
            io,
            inviteeUuids,
            SOCKET_EVENT.CALL_INCOMING,
            incomingPayload,
          );

          void callPush
            .notifyIncomingCall({
              calleeUuids: inviteeUuids,
              call: session.call,
            })
            .catch((err) => {
              logger.warn(
                { err, callId: session.call.id },
                'Incoming call push failed',
              );
            });

          scheduleRingTimeout(io, session.call.id);
        } catch (err) {
          const message = errorMessage(err, 'Could not start call');
          const isBusy =
            err instanceof ConflictError && /busy/i.test(message);
          emitCreateAck(socket, {
            requestId: payload?.requestId,
            success: false,
            error: {
              code: isBusy ? 'BUSY' : 'CREATE_FAILED',
              message: isBusy ? 'User is busy' : message,
            },
          });
          logger.warn({ err, userId: socket.user?.sub }, 'call:create failed');
        }
      })();
    },
  );

  socket.on(
    SOCKET_EVENT.CALL_ACCEPT,
    (payload: { callId?: string; requestId?: string }) => {
      void (async () => {
        if (!socket.user?.sub) {
          emitJoinAck(socket, {
            requestId: payload?.requestId,
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Not authenticated for calls',
            },
          });
          return;
        }
        const callId = payload?.callId?.trim();
        if (!callId) {
          emitJoinAck(socket, {
            requestId: payload?.requestId,
            success: false,
            error: { code: 'VALIDATION', message: 'callId is required' },
          });
          return;
        }

        try {
          const {
            joinerSession,
            joinedPeerUuids,
            ringingUuids,
            watcherUuids,
            firstAccept,
            superseded,
          } = await callService.acceptCall(socket.user.sub, callId);
          if (firstAccept) clearRingTimer(callId);

          // WhatsApp-style: notify peers on any call this user just left
          for (const prev of superseded) {
            clearRingTimer(prev.callId);
            const others = prev.notifyUuids.filter(
              (id) => id !== socket.user!.sub,
            );
            emitToUsers(io, others, SOCKET_EVENT.CALL_END_ACK, {
              callId: prev.callId,
              status: prev.status,
              reason:
                prev.status === 'cancelled' ? 'cancelled' : 'ended',
              supersededBy: callId,
            });
            if (prev.status === 'cancelled') {
              emitToUsers(io, others, SOCKET_EVENT.CALL_CANCELLED, {
                callId: prev.callId,
                reason: 'cancelled',
                supersededBy: callId,
              });
            }
          }

          void socket.join(SOCKET_ROOM.call(callId));
          (
            socket.data as { activeCallId?: string }
          ).activeCallId = callId;

          emitJoinAck(socket, {
            requestId: payload.requestId,
            success: true,
            data: joinerSession,
          });

          for (const uuid of joinedPeerUuids) {
            try {
              const peerSession = await callService.buildSessionForUser(
                uuid,
                callId,
              );
              io.to(SOCKET_ROOM.user(uuid)).emit(SOCKET_EVENT.CALL_JOIN, {
                success: true as const,
                data: peerSession,
                participantJoined: socket.user.sub,
              });
            } catch (err) {
              logger.warn({ err, uuid, callId }, 'Peer session build failed');
            }
          }

          const participantPayload = {
            callId,
            call: joinerSession.call,
            userId: socket.user.sub,
          };
          emitToUsers(
            io,
            [...ringingUuids, ...watcherUuids],
            SOCKET_EVENT.CALL_PARTICIPANT_JOINED,
            participantPayload,
          );
        } catch (err) {
          emitJoinAck(socket, {
            requestId: payload?.requestId,
            success: false,
            error: {
              code: 'ACCEPT_FAILED',
              message: errorMessage(err, 'Could not accept call'),
            },
          });
          logger.warn({ err, userId: socket.user?.sub }, 'call:accept failed');
        }
      })();
    },
  );

  socket.on(
    SOCKET_EVENT.CALL_DECLINE,
    (payload: {
      callId?: string;
      requestId?: string;
      /** `busy` = callee already on another call; omit/`declined` = explicit reject */
      reason?: string;
    }) => {
      void (async () => {
        if (!socket.user?.sub) return;
        const callId = payload?.callId?.trim();
        if (!callId) return;

        const reason =
          String(payload?.reason ?? '')
            .trim()
            .toLowerCase() === 'busy'
            ? 'busy'
            : 'declined';

        try {
          const result = await callService.declineCall(socket.user.sub, callId);
          if (result.callEnded) clearRingTimer(callId);

          const declinedPayload = {
            requestId: payload.requestId,
            callId,
            by: socket.user.sub,
            callEnded: result.callEnded,
            reason,
            call: result.call,
          };

          socket.emit(SOCKET_EVENT.CALL_DECLINED, declinedPayload);

          emitToUsers(io, result.notifyUuids, SOCKET_EVENT.CALL_DECLINED, {
            callId,
            by: socket.user.sub,
            callEnded: result.callEnded,
            reason,
            call: result.call,
          });

          // 1:1 (or last group decline ending the call): tell the caller it was
          // rejected / busy. Partial group declines must NOT broadcast REJECTED
          // or every ringing/outgoing UI tears down and shows Rejoin.
          if (result.callEnded) {
            if (reason === 'busy') {
              emitToUsers(io, result.notifyUuids, SOCKET_EVENT.CALL_BUSY, {
                callId,
                by: socket.user.sub,
                callEnded: true,
                reason: 'busy' as const,
                call: result.call,
              });
            } else {
              emitToUsers(io, result.notifyUuids, SOCKET_EVENT.CALL_REJECTED, {
                callId,
                by: socket.user.sub,
                callEnded: true,
                reason: 'rejected' as const,
                call: result.call,
              });
            }
            emitToUsers(io, result.notifyUuids, SOCKET_EVENT.CALL_END_ACK, {
              callId,
              status: result.call?.status ?? 'declined',
              reason: reason === 'busy' ? 'busy' : 'rejected',
              callEnded: true,
            });
          }
        } catch (err) {
          logger.warn({ err, userId: socket.user?.sub }, 'call:decline failed');
        }
      })();
    },
  );

  socket.on(
    SOCKET_EVENT.CALL_END,
    (payload: { callId?: string; requestId?: string }) => {
      void (async () => {
        if (!socket.user?.sub) return;
        const callId = payload?.callId?.trim();
        if (!callId) return;

        try {
          const { notifyUuids, status, reason } = await callService.endCall(
            socket.user.sub,
            callId,
          );
          clearRingTimer(callId);
          delete (socket.data as { activeCallId?: string }).activeCallId;

          const ack = {
            requestId: payload.requestId,
            callId,
            status,
            reason,
          };
          socket.emit(SOCKET_EVENT.CALL_END_ACK, ack);
          emitToUsers(io, notifyUuids, SOCKET_EVENT.CALL_END_ACK, ack);

          if (reason === 'cancelled' || status === 'cancelled') {
            emitToUsers(io, notifyUuids, SOCKET_EVENT.CALL_CANCELLED, {
              callId,
              by: socket.user.sub,
              status: 'cancelled',
              reason: 'cancelled',
            });
          }
        } catch (err) {
          logger.warn({ err, userId: socket.user?.sub }, 'call:end failed');
        }
      })();
    },
  );

  socket.on(
    SOCKET_EVENT.CALL_LEAVE,
    (payload: { callId?: string; requestId?: string }) => {
      void (async () => {
        if (!socket.user?.sub) return;
        const callId = payload?.callId?.trim();
        if (!callId) return;
        try {
          const result = await callService.leaveCall(socket.user.sub, callId);
          if (result.callEnded) clearRingTimer(callId);
          if (
            (socket.data as { activeCallId?: string }).activeCallId === callId
          ) {
            delete (socket.data as { activeCallId?: string }).activeCallId;
          }

          const ack = {
            requestId: payload.requestId,
            callId,
            status: result.status,
            callEnded: result.callEnded,
            userId: socket.user.sub,
          };
          socket.emit(SOCKET_EVENT.CALL_LEAVE_ACK, ack);
          emitToUsers(io, result.notifyUuids, SOCKET_EVENT.CALL_PARTICIPANT_LEFT, {
            callId,
            userId: socket.user.sub,
            callEnded: result.callEnded,
            status: result.status,
          });
          if (result.callEnded) {
            socket.emit(SOCKET_EVENT.CALL_END_ACK, ack);
            emitToUsers(io, result.notifyUuids, SOCKET_EVENT.CALL_END_ACK, ack);
          }
        } catch (err) {
          logger.warn({ err, userId: socket.user?.sub }, 'call:leave failed');
        }
      })();
    },
  );

  socket.on('disconnect', () => {
    const userUuid = socket.user?.sub;
    if (!userUuid) return;
    const callIdHint =
      (socket.data as { activeCallId?: string }).activeCallId ?? null;
    // Grace callback checks isUserOnline — multi-tab / brief blips keep the call;
    // full page refresh (~1s+) hangs up before the new socket connects.
    scheduleDisconnectHangup(io, userUuid, callIdHint);
  });
}
