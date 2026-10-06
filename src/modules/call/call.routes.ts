import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { CallController } from './call.controller.js';
import {
  activeCallQuerySchema,
  activeCallResponseSchema,
  callIdParamsSchema,
  callSessionResponseSchema,
  createCallBodySchema,
  declineCallResponseSchema,
  endCallResponseSchema,
  leaveCallResponseSchema,
} from './call.schema.js';

export async function callRoutes(app: FastifyInstance): Promise<void> {
  const controller = new CallController();
  tagRoutes(app, 'Calls');
  app.addHook('preHandler', authenticate);

  app.post(
    '/',
    {
      schema: requireBearer({
        summary: 'Start an audio/video call',
        description:
          'Creates a **ringing** call in a direct or group conversation and returns an Agora session for the caller.\n\n' +
          '**Prefer socket** `call:create` for realtime (incoming fan-out + push). This REST path is a fallback.\n\n' +
          '**Behavior**\n' +
          '- After create, invitees get **socket `call:incoming`** immediately. PushKit VoIP + Android FCM go in parallel unless the invitee app is in the **foreground** (heartbeat). No delayed fallback. Online-but-background still gets push.\n' +
          '- Clients dedupe by `callId`. iOS uses APNs VoIP (`voipToken`); Android uses FCM high-priority.\n' +
          '- Direct: callee still rings if already on another call; they can **Accept** to switch (WhatsApp-style).\n' +
          '- Caller prior zombie ringing/ongoing rows are superseded.\n' +
          '- Conflict may return `409` / envelope code related to busy or validation.\n\n' +
          '**Statuses:** `ringing` → `ongoing` → `ended` | `missed` | `declined` | `cancelled`.',
        body: createCallBodySchema,
        response: {
          201: callSessionResponseSchema,
        },
      }),
    },
    controller.create,
  );

  app.get(
    '/active',
    {
      schema: requireBearer({
        summary: 'Get active call for a conversation',
        description:
          'Returns the **ringing** or **ongoing** call for a conversation the user belongs to, or `{ call: null }`.\n\n' +
          'Used by the webapp for group **Join / Rejoin** banners after refresh or when not currently in the call UI.',
        querystring: activeCallQuerySchema,
        response: {
          200: activeCallResponseSchema,
        },
      }),
    },
    controller.active,
  );

  app.post(
    '/:callId/leave',
    {
      schema: requireBearer({
        summary: 'Leave a call (group-safe)',
        description:
          'Leave the call as the current user.\n\n' +
          '- **Direct:** leave === end for everyone (`callEnded: true`).\n' +
          '- **Group:** only this participant leaves; others stay connected (`callEnded: false` unless nobody remains joined).\n\n' +
          '**Use for page refresh / tab close** via `fetch(..., { keepalive: true })` — Socket.IO `call:leave` often never arrives because the WebSocket is already tearing down.\n\n' +
          'Peers are notified over the socket bridge (`call:participant:left`, and `call:end:ack` only if the call fully ended).',
        params: callIdParamsSchema,
        response: {
          200: leaveCallResponseSchema,
        },
      }),
    },
    controller.leave,
  );

  app.post(
    '/:callId/decline',
    {
      schema: requireBearer({
        summary: 'Decline a ringing call',
        description:
          'Decline a ringing invite for the current user.\n\n' +
          '- **Direct:** ends the call as `declined` (`callEnded: true`).\n' +
          '- **Group:** marks only this invitee declined; others keep **Calling…** / incoming UI (`callEnded: false` while someone is still ringing or joined).\n\n' +
          'REST fallback for socket `call:decline` (e.g. unload while the incoming screen is open).\n\n' +
          'When `callEnded` is true, peers also get `call:rejected` / `call:end:ack` via realtime fan-out.',
        params: callIdParamsSchema,
        response: {
          200: declineCallResponseSchema,
        },
      }),
    },
    controller.decline,
  );

  app.post(
    '/:callId/end',
    {
      schema: requireBearer({
        summary: 'End a call for everyone',
        description:
          'Ends the call for all participants.\n\n' +
          '- If status is still **ringing** and the actor is the **caller** → status/reason **`cancelled`** (hung up before pickup).\n' +
          '- Otherwise → status/reason **`ended`**.\n\n' +
          'Prefer for **1:1 hangup** and caller cancel. REST fallback for socket `call:end` (keepalive on unload).\n\n' +
          'Peers receive `call:end:ack` (and `call:cancelled` when cancelled).',
        params: callIdParamsSchema,
        response: {
          200: endCallResponseSchema,
        },
      }),
    },
    controller.end,
  );
}
