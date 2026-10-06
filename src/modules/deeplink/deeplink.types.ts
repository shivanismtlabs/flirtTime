/** Content kinds that open via `onevibe://{type}/{id}` */
export type DeeplinkContentType = 'post' | 'vibe' | 'reel' | 'channel';

export type DeeplinkTarget =
  | { kind: 'profile'; username: string }
  | { kind: 'content'; contentType: DeeplinkContentType; id: string; username: string };

export interface ShareProfileResult {
  qrCodeUrl: string;
  qrCodeString: string;
  userProfileLink: string;
}
