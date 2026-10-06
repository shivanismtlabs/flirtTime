import { buildApiApp } from './app.js';
import { env } from '../../shared/config/index.js';
import { connectRedis, disconnectRedis } from '../../shared/cache/index.js';
import { connectDb, destroyDb } from '../../shared/database/index.js';
import { initFirebase } from '../../shared/firebase/index.js';
import { status } from '../../shared/logger/index.js';

async function start(): Promise<void> {
  status.banner(`${env.APP_NAME} API`);
  status.step('Boot', `env=${env.NODE_ENV}`);

  try {
    await connectDb();
  } catch {
    status.fail('API', 'cannot start without PostgreSQL');
    process.exit(1);
  }

  try {
    await connectRedis();
  } catch {
    status.warn('Redis', 'continuing without cache');
  }

  initFirebase();

  const app = await buildApiApp();

  try {
    // Fastify still emits empty INFO lines when listenTextResolver returns '';
    // silence the logger for listen, then print our own boot summary.
    const prevLevel = app.log.level;
    app.log.level = 'silent';
    try {
      await app.listen({
        host: env.API_HOST,
        port: env.API_PORT,
        listenTextResolver: () => '',
      });
    } finally {
      app.log.level = prevLevel;
    }

    status.ok('API', `http://${env.API_HOST}:${env.API_PORT}`);
    status.ok('Health', `http://${env.API_HOST}:${env.API_PORT}/health`);
    const swaggerOn =
      env.SWAGGER_ENABLED !== undefined
        ? env.SWAGGER_ENABLED
        : env.NODE_ENV !== 'production';
    if (swaggerOn) {
      status.ok('Swagger', `http://${env.API_HOST}:${env.API_PORT}/docs`);
      status.ok('Admin Swagger', `http://${env.API_HOST}:${env.API_PORT}/admindocs`);
    }
    // Socket is a separate process — surface its URL here so boot logs stay complete
    status.ok('Socket', `http://${env.SOCKET_HOST}:${env.SOCKET_PORT}`);
    status.ok('Socket health', `http://${env.SOCKET_HOST}:${env.SOCKET_PORT}/health`);
    status.ok('Server', 'ready');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'listen failed';
    status.fail('API', message);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    status.step('Shutdown', signal);
    try {
      await app.close();
      status.ok('API', 'closed');
      await destroyDb();
      await disconnectRedis();
      status.ok('Shutdown', 'complete');
      process.exit(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'shutdown failed';
      status.fail('Shutdown', message);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void start();
