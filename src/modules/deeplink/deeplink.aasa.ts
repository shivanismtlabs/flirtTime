import { env } from '../../shared/config/index.js';

/**
 * Apple App Site Association — Universal Links.
 * Served at `/.well-known/apple-app-site-association` and `/apple-app-site-association`.
 */
export function buildAasaDocument() {
  const appIds = env.DEEPLINK_IOS_APP_IDS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const paths = [
    '/*',
    '/@*',
    '/share/*',
    '/post/*',
    '/vibe/*',
    '/reel/*',
    '/channel/*',
    '/group/invite/*',
    '/api/v1/share/*',
    '/api/v1/auth/share/*',
    '/api/v1/auth/post/*',
    '/api/v1/auth/vibe/*',
    '/api/v1/auth/reel/*',
    '/api/v1/auth/channel/*',
    '/api/v1/auth/download-app',
    '/api/v1/auth/dl',
  ];

  return {
    applinks: {
      apps: [] as string[],
      details: appIds.map((appID) => ({
        appID,
        paths,
      })),
    },
  };
}

/**
 * Android Digital Asset Links — App Links verification.
 * Served at `/.well-known/assetlinks.json`.
 */
export function buildAssetLinksDocument() {
  const fingerprints = env.DEEPLINK_ANDROID_SHA256_FINGERPRINTS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: env.DEEPLINK_ANDROID_PACKAGE,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}
