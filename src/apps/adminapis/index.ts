import { buildAdminApiApp } from './app.js';
import { env } from '../../shared/config/index.js';
import { connectRedis, disconnectRedis } from '../../shared/cache/index.js';
import { connectDb, destroyDb } from '../../shared/database/index.js';
import { status } from '../../shared/logger/index.js';
import { ADMIN_API_PREFIX } from './routes.js';

async function start(): Promise<void> {
  status.banner(`${env.APP_NAME} Admin API`);
  status.step('Boot', `env=${env.NODE_ENV}`);

  try {
    await connectDb();
  } catch {
    status.fail('Admin API', 'cannot start without PostgreSQL');
    process.exit(1);
  }

  try {
    await connectRedis();
  } catch {
    status.warn('Redis', 'continuing without cache');
  }

  const app = await buildAdminApiApp();

  try {
    const prevLevel = app.log.level;
    app.log.level = 'silent';
    try {
      await app.listen({
        host: env.ADMIN_API_HOST,
        port: env.ADMIN_API_PORT,
        listenTextResolver: () => '',
      });
    } finally {
      app.log.level = prevLevel;
    }

    status.ok(
      'Admin API',
      `http://${env.ADMIN_API_HOST}:${env.ADMIN_API_PORT}${ADMIN_API_PREFIX}`,
    );
    status.ok(
      'Health',
      `http://${env.ADMIN_API_HOST}:${env.ADMIN_API_PORT}/health`,
    );
    const swaggerOn =
      env.SWAGGER_ENABLED !== undefined
        ? env.SWAGGER_ENABLED
        : env.NODE_ENV !== 'production';
    if (swaggerOn) {
      status.ok(
        'Swagger',
        `http://${env.ADMIN_API_HOST}:${env.ADMIN_API_PORT}/docs`,
      );
    }
    status.ok('Server', 'ready');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'listen failed';
    status.fail('Admin API', message);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    status.step('Shutdown', signal);
    try {
      await app.close();
      status.ok('Admin API', 'closed');
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
