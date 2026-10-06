import { createRequire } from 'node:module';
import { env } from '../../shared/config/index.js';
import { ValidationError } from '../../shared/errors/index.js';

const require = createRequire(import.meta.url);
const { RtcRole, RtcTokenBuilder } = require('agora-token') as {
  RtcRole: { PUBLISHER: number; SUBSCRIBER: number };
  RtcTokenBuilder: {
    buildTokenWithUserAccount: (
      appId: string,
      appCertificate: string,
      channelName: string,
      account: string,
      role: number,
      tokenExpire: number,
      privilegeExpire: number,
    ) => string;
  };
};

/** Token validity window (seconds from now) — Agora token builder v2 uses relative TTL */
const TOKEN_TTL_SEC = 60 * 60; // 1 hour

export function assertAgoraConfigured(): void {
  if (!env.AGORA_APP_ID || !env.AGORA_APP_CERTIFICATE) {
    throw new ValidationError('Agora is not configured');
  }
}

export function getAgoraAppId(): string {
  assertAgoraConfigured();
  return env.AGORA_APP_ID;
}

/** RTC token for a string user account (public user UUID). */
export function buildAgoraRtcToken(channelName: string, userAccount: string): string {
  assertAgoraConfigured();
  return RtcTokenBuilder.buildTokenWithUserAccount(
    env.AGORA_APP_ID,
    env.AGORA_APP_CERTIFICATE,
    channelName,
    userAccount,
    RtcRole.PUBLISHER,
    TOKEN_TTL_SEC,
    TOKEN_TTL_SEC,
  );
}
