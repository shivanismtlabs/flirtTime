import { env } from '../../shared/config/index.js';
import type { DeeplinkContentType } from './deeplink.types.js';

const BOT_AGENTS = [
  'facebookexternalhit',
  'Twitterbot',
  'WhatsApp',
  'Slackbot',
  'TelegramBot',
  'LinkedInBot',
  'Discordbot',
  'Googlebot',
  'PostmanRuntime',
] as const;

export function isShareBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return BOT_AGENTS.some((bot) => ua.includes(bot.toLowerCase()));
}

export function detectPlatform(userAgent: string): 'ios' | 'android' | 'other' {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'other';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function storeUrls() {
  return {
    appStoreUrl: env.APP_STORE_URL,
    playStoreUrl: env.PLAY_STORE_URL,
    ogImage: env.DEEPLINK_OG_IMAGE_URL,
    itunesAppId: env.DEEPLINK_IOS_APP_STORE_ID,
  };
}

export function botProfileHtml(username: string, pageUrl: string): string {
  const { ogImage } = storeUrls();
  const u = escapeHtml(username);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OneVibe - ${u}</title>
  <meta property="og:title" content="Check out ${u} on OneVibe!" />
  <meta property="og:description" content="Connect with ${u} and join the vibe." />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
  <meta property="og:url" content="${escapeHtml(pageUrl)}" />
  <meta property="og:type" content="profile" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
</head>
<body>
  <p>Redirecting to OneVibe profile...</p>
</body>
</html>`;
}

export function botContentHtml(
  contentType: DeeplinkContentType | string,
  username: string,
): string {
  const { ogImage } = storeUrls();
  const formatted =
    contentType.charAt(0).toUpperCase() + contentType.slice(1);
  const t = escapeHtml(contentType);
  const u = escapeHtml(username);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OneVibe - ${escapeHtml(formatted)}</title>
  <meta property="og:title" content="Check out this ${t} by @${u} on OneVibe!" />
  <meta property="og:description" content="Download OneVibe app to view this ${t} and discover more content." />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
  <meta property="og:site_name" content="OneVibe" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
</head>
<body>
  <p>Redirecting to OneVibe ${t}...</p>
</body>
</html>`;
}

export function iosLandingHtml(opts: {
  title: string;
  subtitle: string;
  customScheme: string;
}): string {
  const { appStoreUrl, ogImage, itunesAppId } = storeUrls();
  return `<!DOCTYPE html>
<html>
  <head>
    <title>${escapeHtml(opts.title)}</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="apple-itunes-app" content="app-id=${escapeHtml(itunesAppId)}, app-argument=${escapeHtml(opts.customScheme)}">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; text-align: center; background: #000; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
      .logo { width: 100px; height: 100px; border-radius: 22%; margin-bottom: 20px; box-shadow: 0 10px 30px rgba(255,255,255,0.1); }
      h1 { font-size: 24px; margin-bottom: 10px; }
      p { font-size: 16px; color: #aaa; margin-bottom: 40px; }
      .btn { background: #fff; color: #000; text-decoration: none; padding: 15px 40px; border-radius: 30px; font-weight: bold; transition: transform 0.2s; display: block; width: 220px; margin: 10px auto; }
      .btn-outline { background: transparent; color: #fff; border: 1px solid #fff; }
      .btn:active { transform: scale(0.95); }
    </style>
  </head>
  <body>
    <img src="${escapeHtml(ogImage)}" alt="OneVibe" class="logo">
    <h1>${escapeHtml(opts.title)}</h1>
    <p>${escapeHtml(opts.subtitle)}</p>
    <a href="${escapeHtml(opts.customScheme)}" class="btn">Open in App</a>
    <a href="${escapeHtml(appStoreUrl)}" class="btn btn-outline">Get OneVibe on App Store</a>
  </body>
</html>`;
}

export function desktopLandingHtml(message: string): string {
  const { appStoreUrl, playStoreUrl, ogImage } = storeUrls();
  return `<!DOCTYPE html>
<html>
  <head>
    <title>OneVibe - Download App</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
       body { font-family: sans-serif; text-align: center; padding: 60px 20px; background: #fafafa; }
       .container { max-width: 400px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
       img { width: 80px; margin-bottom: 20px; }
       h2 { font-size: 22px; margin-bottom: 10px; }
       p { color: #666; font-size: 15px; margin-bottom: 25px; }
    </style>
  </head>
  <body>
    <div class="container">
      <img src="${escapeHtml(ogImage)}" alt="OneVibe">
      <h2>OneVibe is better on mobile</h2>
      <p>${escapeHtml(message)}</p>
      <div style="margin-top: 30px;">
        <a href="${escapeHtml(appStoreUrl)}" style="display:inline-block; margin-bottom: 10px;"><img src="https://upload.wikimedia.org/wikipedia/commons/3/3c/Download_on_the_App_Store_Badge.svg" style="width:140px; margin:0" alt="App Store"></a><br>
        <a href="${escapeHtml(playStoreUrl)}"><img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" style="width:140px; margin:0" alt="Google Play"></a>
      </div>
    </div>
  </body>
</html>`;
}
