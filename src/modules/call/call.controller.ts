import type { FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../../shared/logger/index.js';
import { CallPushNotifier } from './call-push.notifier.js';
import { publishCallHangup, publishCallIncoming } from './call.realtime.js';
import { CallService } from './call.service.js';
import type { CreateCallInput } from './call.types.js';

export class CallController {
  constructor(
    private readonly service = new CallService(),
    private readonly callPush = new CallPushNotifier(),
  ) {}

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as CreateCallInput;
    const result = await this.service.createCall(request.user!.sub, body);
    const { inviteeUuids, ...session } = result;

    // Same fan-out as socket `call:create`: socket always; VoIP/FCM unless foreground.
    if (inviteeUuids.length) {
      void publishCallIncoming({
        notifyUserIds: inviteeUuids,
        call: session.call,
        caller: session.call.caller,
      }).catch((err) => {
        logger.warn({ err, callId: session.call.id }, 'call.incoming fan-out failed');
      });

      void this.callPush
        .notifyIncomingCall({
          calleeUuids: inviteeUuids,
          call: session.call,
        })
        .catch((err) => {
          logger.warn(
            { err, callId: session.call.id },
            'Incoming call VoIP/FCM push failed',
          );
        });
    }

    return reply.code(201).send(session);
  };

  active = async (request: FastifyRequest, reply: FastifyReply) => {
    const { conversationId } = request.query as { conversationId: string };
    const call = await this.service.getActiveCallForConversation(
      request.user!.sub,
      conversationId,
    );
    return reply.send({ call });
  };

  /** Reliable hangup for page refresh / tab close (keepalive fetch). */
  leave = async (request: FastifyRequest, reply: FastifyReply) => {
    const { callId } = request.params as { callId: string };
    const by = request.user!.sub;
    const result = await this.service.leaveCall(by, callId);
    void publishCallHangup({
      type: 'call.hangup',
      callId: result.callId,
      status: result.status,
      reason: result.callEnded ? 'ended' : 'left',
      by,
      callEnded: result.callEnded,
      notifyUserIds: result.notifyUuids,
    });
    return reply.send({
      callId: result.callId,
      callEnded: result.callEnded,
      status: result.status,
    });
  };

  decline = async (request: FastifyRequest, reply: FastifyReply) => {
    const { callId } = request.params as { callId: string };
    const by = request.user!.sub;
    const result = await this.service.declineCall(by, callId);
    const status = result.call?.status ?? 'declined';
    void publishCallHangup({
      type: 'call.hangup',
      callId: result.callId,
      status,
      reason: 'rejected',
      by,
      callEnded: result.callEnded,
      notifyUserIds: result.notifyUuids,
    });
    return reply.send({
      callId: result.callId,
      callEnded: result.callEnded,
      status,
    });
  };

  end = async (request: FastifyRequest, reply: FastifyReply) => {
    const { callId } = request.params as { callId: string };
    const by = request.user!.sub;
    const result = await this.service.endCall(by, callId);
    void publishCallHangup({
      type: 'call.hangup',
      callId: result.callId,
      status: result.status,
      reason: result.reason,
      by,
      callEnded: true,
      notifyUserIds: result.notifyUuids,
    });
    return reply.send({
      callId: result.callId,
      status: result.status,
      reason: result.reason,
    });
  };
}
