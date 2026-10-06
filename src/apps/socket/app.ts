import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { env } from '../../shared/config/index.js';
import {
  disconnectRedis,
  getRedisPubSub,
  isRedisEnabled,
} from '../../shared/cache/index.js';
import { buildSocketLiveness } from '../../shared/health/liveness.js';
import {
  buildSocketLogContext,
  resolveDeviceFromHeaders,
} from '../../shared/http/request-log-context.js';
import { status } from '../../shared/logger/index.js';
import { SOCKET_EVENT, SOCKET_ROOM } from '../../shared/socket/index.js';
import type { ChatRealtimePayload } from '../../modules/chat/chat.realtime.js';
import { emitChatRealtime } from '../../modules/chat/chat.realtime.emit.js';
import type { CallRealtimePayload } from '../../modules/call/call.realtime.js';
import { emitCallRealtime } from './lib/call.realtime.emit.js';
import type { AuthSessionRevokedPayload } from '../../modules/auth/auth.realtime.js';
import type { NotifyRealtimePayload } from '../../modules/notification/notification.realtime.js';
import type { SocialRealtimePayload } from '../../modules/social/social.realtime.js';
import { socketAuthMiddleware } from './middleware/auth.js';
import { registerChatHandlers } from './handlers/chat.handler.js';
import { registerChannelHandlers } from './handlers/channel.handler.js';
import { registerCallHandlers } from './handlers/call.handler.js';
import { registerNotificationHandlers } from './handlers/notification.handler.js';
import { registerSocialHandlers } from './handlers/social.handler.js';
import { attachPresence } from './handlers/presence.handler.js';
import { emitNotifyRealtime } from './bridges/notification.bridge.js';
import { emitSocialRealtime } from './bridges/social.bridge.js';
import { tryServeSocketConsole } from './console/serve.js';
import { enableSocketLiveOwner, resolveLiveState } from '../../shared/chat/index.js';

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : null);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

export async function buildSocketApp() {
  enableSocketLiveOwner();
  let io: Server | null = null;

  const httpServer = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0] ?? '';

    // Do not 404 Engine.IO — Socket.IO owns /socket.io (polling + websocket handshake).
    if (path === '/socket.io' || path.startsWith('/socket.io/')) {
      return;
    }

    if (tryServeSocketConsole(req, res)) {
      return;
    }

    // Liveness only — fast WITHOUT Redis/DB/cache I/O
    if (path === '/health') {
      const started = performance.now();
      const body = buildSocketLiveness(performance.now() - started);
      sendJson(res, 200, body);
      return;
    }

    // API → socket fan-out when Redis pub/sub is unavailable
    if (path === '/internal/chat/realtime' && req.method === 'POST') {
      void (async () => {
        try {
          const token = req.headers['x-internal-token'];
          if (token !== env.JWT_ACCESS_SECRET) {
            sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
            return;
          }
          if (!io) {
            sendJson(res, 503, { ok: false, error: 'SOCKET_NOT_READY' });
            return;
          }
          const payload = (await readJsonBody(req)) as ChatRealtimePayload;
          emitChatRealtime(io, payload);
          sendJson(res, 200, { ok: true });
        } catch {
          sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' });
        }
      })();
      return;
    }

    if (path === '/internal/chat/live-state' && req.method === 'POST') {
      void (async () => {
        try {
          const token = req.headers['x-internal-token'];
          if (token !== env.JWT_ACCESS_SECRET) {
            sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
            return;
          }
          const payload = (await readJsonBody(req)) as {
            kind?: 'conversation' | 'channel';
            targetId?: string;
            conversationId?: string;
            userUuids?: unknown;
          };
          const targetId = String(
            payload?.targetId || payload?.conversationId || '',
          ).trim();
          const userUuids = Array.isArray(payload?.userUuids)
            ? payload.userUuids.filter(
                (id): id is string => typeof id === 'string',
              )
            : [];
          if (!targetId || userUuids.length > 200) {
            sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' });
            return;
          }
          const kind =
            payload?.kind === 'channel' ? 'channel' : 'conversation';
          const live = await resolveLiveState(kind, targetId, userUuids);
          sendJson(res, 200, {
            ok: true,
            viewing: [...live.viewing],
            online: [...live.online],
          });
        } catch {
          sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' });
        }
      })();
      return;
    }

    if (path === '/internal/call/realtime' && req.method === 'POST') {
      void (async () => {
        try {
          const token = req.headers['x-internal-token'];
          if (token !== env.JWT_ACCESS_SECRET) {
            sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
            return;
          }
          if (!io) {
            sendJson(res, 503, { ok: false, error: 'SOCKET_NOT_READY' });
            return;
          }
          const payload = (await readJsonBody(req)) as CallRealtimePayload;
          emitCallRealtime(io, payload);
          sendJson(res, 200, { ok: true });
        } catch {
          sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' });
        }
      })();
      return;
    }

    if (path === '/internal/notify/realtime' && req.method === 'POST') {
      void (async () => {
        try {
          const token = req.headers['x-internal-token'];
          if (token !== env.JWT_ACCESS_SECRET) {
            sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
            return;
          }
          if (!io) {
            sendJson(res, 503, { ok: false, error: 'SOCKET_NOT_READY' });
            return;
          }
          const payload = (await readJsonBody(req)) as NotifyRealtimePayload;
          emitNotifyRealtime(io, payload);
          sendJson(res, 200, { ok: true });
        } catch {
          sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' });
        }
      })();
      return;
    }

    if (path === '/internal/social/realtime' && req.method === 'POST') {
      void (async () => {
        try {
          const token = req.headers['x-internal-token'];
          if (token !== env.JWT_ACCESS_SECRET) {
            sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
            return;
          }
          if (!io) {
            sendJson(res, 503, { ok: false, error: 'SOCKET_NOT_READY' });
            return;
          }
          const payload = (await readJsonBody(req)) as SocialRealtimePayload;
          emitSocialRealtime(io, payload);
          sendJson(res, 200, { ok: true });
        } catch {
          sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' });
        }
      })();
      return;
    }

    if (path === '/internal/auth/session-revoked' && req.method === 'POST') {
      void (async () => {
        try {
          const token = req.headers['x-internal-token'];
          if (token !== env.JWT_ACCESS_SECRET) {
            sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
            return;
          }
          if (!io) {
            sendJson(res, 503, { ok: false, error: 'SOCKET_NOT_READY' });
            return;
          }
          const payload = (await readJsonBody(req)) as AuthSessionRevokedPayload;
          if (!payload?.userId || typeof payload.userId !== 'string') {
            sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' });
            return;
          }
          const room = SOCKET_ROOM.user(payload.userId);
          io.to(room).emit(SOCKET_EVENT.AUTH_SESSION_REVOKED, {
            reason: payload.reason ?? 'device_limit',
            message: 'Your device has been logged out',
          });
          const sockets = await io.in(room).fetchSockets();
          await Promise.all(sockets.map((s) => s.disconnect(true)));
          sendJson(res, 200, { ok: true, disconnected: sockets.length });
        } catch {
          sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' });
        }
      })();
      return;
    }

    res.writeHead(404);
    res.end();
  });

  status.ok(
    'HTTP',
    'health + console + internal chat/notify/social/auth fan-out + live-state ready',
  );

  io = new Server(httpServer, {
    // Reflect browser Origin (JWT still required). Web app hosts vary (onevibeapp.walit.in).
    cors: {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    allowRequest: (_req, cb) => cb(null, true),
    // Polling first so chat still works if nginx/Cloudflare blocks websocket upgrade.
    transports: ['polling', 'websocket'],
    pingInterval: 25_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 1e6,
  });
  status.ok('Socket.IO', 'server instance created');

  if (!isRedisEnabled()) {
    status.skip('Redis adapter', 'disabled (REDIS_ENABLED=false) — single-node');
  } else {
    try {
      const { pub, sub } = getRedisPubSub();
      if (pub.status === 'wait') await pub.connect();
      if (sub.status === 'wait') await sub.connect();
      await pub.ping();
      io.adapter(createAdapter(pub, sub));
      status.ok('Redis adapter', `${env.REDIS_HOST}:${env.REDIS_PORT}`);
    } catch (err) {
      try {
        await disconnectRedis();
      } catch {
        // ignore cleanup errors
      }
      const message = err instanceof Error ? err.message : 'adapter failed';
      status.warn('Redis adapter', `${message} — single-node only`);
    }
  }

  io.use(socketAuthMiddleware);
  status.ok('Auth', 'socket JWT middleware attached');

  io.on('connection', (socket) => {
    const device = resolveDeviceFromHeaders(
      socket.handshake.headers as Record<string, string | string[] | undefined>,
    );
    const ctx = buildSocketLogContext({
      device,
      username: socket.user?.username,
      email: socket.user?.email,
    });
    status.ok(ctx, `| connected sid=${socket.id}`);

    // Immediately join personal room so call invites/messages can fan out
    // even before async presence setup finishes.
    if (socket.user?.sub) {
      void socket.join(SOCKET_ROOM.user(socket.user.sub));
    }

    registerChatHandlers(io!, socket);
    registerChannelHandlers(io!, socket);
    registerCallHandlers(io!, socket);
    registerNotificationHandlers(socket);
    registerSocialHandlers(socket);
    void attachPresence(io!, socket);

    socket.on('disconnect', (reason) => {
      status.warn(ctx, `| disconnected sid=${socket.id} reason=${reason}`);
    });
  });

  status.ok('Handlers', 'chat, channel, call, notification, social, presence');

  const { startChatRealtimeBridge } = await import('./bridges/chat.bridge.js');
  const stopChatBridge = await startChatRealtimeBridge(io);

  const { startNotifyRealtimeBridge } = await import(
    './bridges/notification.bridge.js'
  );
  const stopNotifyBridge = await startNotifyRealtimeBridge(io);

  const { startSocialRealtimeBridge } = await import(
    './bridges/social.bridge.js'
  );
  const stopSocialBridge = await startSocialRealtimeBridge(io);

  const { startCallRealtimeBridge } = await import('./bridges/call.bridge.js');
  const stopCallBridge = await startCallRealtimeBridge(io);

  return {
    httpServer,
    io,
    stopChatBridge,
    stopNotifyBridge,
    stopSocialBridge,
    stopCallBridge,
  };
}

export async function listenSocketApp(
  httpServer: ReturnType<typeof createServer>,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    httpServer.listen(env.SOCKET_PORT, env.SOCKET_HOST, () => resolve());
    httpServer.on('error', reject);
  });

  status.ok('Socket URL', `http://${env.SOCKET_HOST}:${env.SOCKET_PORT}`);
  status.ok('Socket health', `http://${env.SOCKET_HOST}:${env.SOCKET_PORT}/health`);
  status.ok(
    'Socket console',
    `http://localhost:${env.SOCKET_PORT}/console`,
  );
  status.ok('Socket path', `ws://${env.SOCKET_HOST}:${env.SOCKET_PORT}/socket.io`);
}
