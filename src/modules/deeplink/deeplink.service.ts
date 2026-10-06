import QRCode from 'qrcode';
import { env } from '../../shared/config/index.js';
import { NotFoundError } from '../../shared/errors/index.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { buildAasaDocument, buildAssetLinksDocument } from './deeplink.aasa.js';
import {
  botContentHtml,
  botProfileHtml,
  desktopLandingHtml,
  detectPlatform,
  iosLandingHtml,
  isShareBot,
} from './deeplink.html.js';
import {
  getAppSchemeLink,
  getProfileShareLink,
} from './deeplink.share-link.js';
import type {
  DeeplinkContentType,
  ShareProfileResult,
} from './deeplink.types.js';

export type LandingResult =
  | { kind: 'html'; status: number; html: string; cacheControl?: string }
  | { kind: 'redirect'; status: number; url: string };

export class DeeplinkService {
  constructor(private readonly authRepo = new AuthRepository()) {}

  async shareProfileQr(userId: string): Promise<ShareProfileResult> {
    const username = await this.authRepo.findUsernameByUserId(userId);
    if (!username) {
      throw new NotFoundError('User profile not found');
    }
    const userProfileLink = getProfileShareLink(username);
    const [qrCodeUrl, qrCodeString] = await Promise.all([
      QRCode.toDataURL(userProfileLink),
      QRCode.toString(userProfileLink, { type: 'svg' }),
    ]);
    return { qrCodeUrl, qrCodeString, userProfileLink };
  }

  serveAasa() {
    return buildAasaDocument();
  }

  serveAssetLinks() {
    return buildAssetLinksDocument();
  }

  profileLanding(username: string, userAgent: string): LandingResult {
    const pageUrl = getProfileShareLink(username);
    const customScheme = getAppSchemeLink('profile', username);

    if (isShareBot(userAgent)) {
      return {
        kind: 'html',
        status: 200,
        html: botProfileHtml(username, pageUrl),
        cacheControl: 'no-store',
      };
    }

    const platform = detectPlatform(userAgent);
    if (platform === 'ios') {
      return {
        kind: 'html',
        status: 200,
        html: iosLandingHtml({
          title: `Check out ${username}`,
          subtitle: 'Join OneVibe to see this profile and more.',
          customScheme,
        }),
      };
    }
    if (platform === 'android') {
      return { kind: 'redirect', status: 302, url: env.PLAY_STORE_URL };
    }
    return {
      kind: 'html',
      status: 200,
      html: desktopLandingHtml(
        `Scan this page or open the link on your phone to view ${username}'s profile.`,
      ),
    };
  }

  contentLanding(opts: {
    contentType: DeeplinkContentType;
    id: string;
    username: string;
    userAgent: string;
  }): LandingResult {
    const { contentType, id, username, userAgent } = opts;
    const customScheme = getAppSchemeLink(contentType, id);
    const formatted =
      contentType.charAt(0).toUpperCase() + contentType.slice(1);

    if (isShareBot(userAgent)) {
      return {
        kind: 'html',
        status: 200,
        html: botContentHtml(contentType, username),
        cacheControl: 'no-store',
      };
    }

    const platform = detectPlatform(userAgent);
    if (platform === 'android') {
      return { kind: 'redirect', status: 302, url: env.PLAY_STORE_URL };
    }
    if (platform === 'ios') {
      return {
        kind: 'html',
        status: 200,
        html: iosLandingHtml({
          title: `View this ${formatted} on OneVibe`,
          subtitle: `Install OneVibe to see content shared by @${username}.`,
          customScheme,
        }),
      };
    }
    return {
      kind: 'html',
      status: 200,
      html: desktopLandingHtml(
        `Install OneVibe on your phone to view this ${formatted}.`,
      ),
    };
  }
}
