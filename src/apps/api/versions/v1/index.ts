import type { FastifyInstance } from 'fastify';
import {
  authRoutes,
  chatRoutes,
  channelRoutes,
  callRoutes,
  coinPackagesRoutes,
  commonRoutes,
  contactsRoutes,
  devicesRoutes,
  feedRoutes,
  vibeRoutes,
  followRoutes,
  giftsRoutes,
  lookupRoutes,
  mediaRoutes,
  notificationRoutes,
  pageRoutes,
  deeplinkRoutes,
  deeplinkV1ShareRoutes,
  profileVisitorsRoutes,
  helpRoutes,
  languageRoutes,
  settingRoutes,
  requestVerificationRoutes,
  reelRoutes,
  storyRoutes,
  userRoutes,
  walletRoutes,
} from '../../../../modules/index.js';

/**
 * API v1 — current stable surface.
 * Domain modules live in src/modules/*; this file only wires HTTP mounts.
 * Staff admin routes live in src/apps/adminapis (separate process).
 */
export async function registerV1Routes(app: FastifyInstance): Promise<void> {
  app.get(
    '/',
    {
      schema: {
        tags: ['Meta'],
        summary: 'API v1 status',
        description:
          'Root status for the stable v1 API. Returns version label and the list of mounted modules.',
      },
    },
    async () => ({
      version: 'v1',
      status: 'stable',
      modules: [
        'auth',
        'lookup',
        'user',
        'contacts',
        'feed',
        'vibes',
        'gifts',
        'follow',
        'reel',
        'story',
        'chat',
        'channels',
        'calls',
        'media',
        'notification',
        'common',
        'coin-packages',
        'devices',
        'wallet',
        'profile-visitors',
        'help',
        'language',
        'setting',
        'request-verification',
        'page',
        'deeplink',
      ],
    }),
  );

  await app.register(authRoutes, { prefix: '/auth' });
  // Linkgram-compatible list endpoints under /auth
  await app.register(lookupRoutes, { prefix: '/auth' });
  // Share landings + AASA (Linkgram auth share routes)
  await app.register(deeplinkRoutes, { prefix: '/auth' });
  await app.register(deeplinkV1ShareRoutes, { prefix: '/share' });
  await app.register(userRoutes, { prefix: '/users' });
  await app.register(contactsRoutes, { prefix: '/contacts' });
  await app.register(feedRoutes, { prefix: '/feed' });
  await app.register(vibeRoutes, { prefix: '/vibes' });
  await app.register(giftsRoutes, { prefix: '/gifts' });
  await app.register(followRoutes, { prefix: '/follow' });
  await app.register(reelRoutes, { prefix: '/reels' });
  await app.register(storyRoutes, { prefix: '/stories' });
  await app.register(chatRoutes, { prefix: '/chat' });
  await app.register(channelRoutes, { prefix: '/chat' });
  await app.register(callRoutes, { prefix: '/calls' });
  await app.register(mediaRoutes, { prefix: '/media' });
  await app.register(notificationRoutes, { prefix: '/notifications' });
  await app.register(coinPackagesRoutes, { prefix: '/coin-packages' });
  await app.register(devicesRoutes, { prefix: '/devices' });
  await app.register(walletRoutes, { prefix: '/wallet' });
  await app.register(profileVisitorsRoutes, { prefix: '/profile-visitors' });
  await app.register(helpRoutes, { prefix: '/help' });
  await app.register(languageRoutes, { prefix: '/language' });
  await app.register(settingRoutes, { prefix: '/setting' });
  await app.register(requestVerificationRoutes, {
    prefix: '/request-verification',
  });
  // Public legal/support HTML — no auth (token not required)
  await app.register(pageRoutes, { prefix: '/page' });
  // Linkgram feed-new common OpenAI helpers (root paths)
  await app.register(commonRoutes);
}
