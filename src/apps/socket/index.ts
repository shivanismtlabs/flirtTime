import { buildSocketApp, listenSocketApp } from './app.js';
import { env } from '../../shared/config/index.js';
import { disconnectRedis } from '../../shared/cache/index.js';
import { connectDb, destroyDb } from '../../shared/database/index.js';
import { status } from '../../shared/logger/index.js';

async function start(): Promise<void> {
  status.banner(`${env.APP_NAME} Socket`);
  status.step('Boot', `env=${env.NODE_ENV}`);

  try {
    await connectDb();
  } catch {
    status.warn('PostgreSQL', 'continuing without DB — last-seen persist disabled');
  }

  let httpServer: Awaited<ReturnType<typeof buildSocketApp>>['httpServer'];
  let io: Awaited<ReturnType<typeof buildSocketApp>>['io'];
  let stopChatBridge: Awaited<ReturnType<typeof buildSocketApp>>['stopChatBridge'];
  let stopNotifyBridge: Awaited<ReturnType<typeof buildSocketApp>>['stopNotifyBridge'];
  let stopSocialBridge: Awaited<ReturnType<typeof buildSocketApp>>['stopSocialBridge'];
  let stopCallBridge: Awaited<ReturnType<typeof buildSocketApp>>['stopCallBridge'];

  try {
    ({
      httpServer,
      io,
      stopChatBridge,
      stopNotifyBridge,
      stopSocialBridge,
      stopCallBridge,
    } = await buildSocketApp());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'build failed';
    status.fail('Socket', message);
    process.exit(1);
  }

  try {
    await listenSocketApp(httpServer);
    status.ok('Server', 'ready');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'listen failed';
    status.fail('Socket', message);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    status.step('Shutdown', signal);
    try {
      await stopChatBridge();
      await stopNotifyBridge();
      await stopSocialBridge();
      await stopCallBridge();
      io.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      status.ok('Socket', 'closed');
      await destroyDb();
      await disconnectRedis();
      status.ok('Shutdown', 'complete');
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
