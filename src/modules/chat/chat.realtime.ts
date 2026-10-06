import { Redis } from 'ioredis';
import { env, getRedisConnection } from '../../shared/config/index.js';
import { isRedisEnabled } from '../../shared/cache/index.js';
import type { ChatMessage } from './chat.types.js';
import type {
  ChannelDetail,
  ChannelMessage,
} from '../channels/channel.types.js';

/**
 * Absolute Redis channel (no ioredis keyPrefix).
 * API publishes here; socket bridge subscribes and fans out to rooms.
 */
export const CHAT_REALTIME_CHANNEL = 'onevibe:chat:events';

export type ChatRealtimePayload =
  | {
      type: 'message.created';
      conversationId: string;
      message: ChatMessage;
      /** Public user uuids that should refresh inbox (usually other members) */
      notifyUserIds?: string[];
      /** Per-recipient unread after this message (and live receipts). */
      unreadByUserId?: Record<string, number>;
    }
  | {
      type: 'message.edited';
      conversationId: string;
      message: ChatMessage;
      notifyUserIds?: string[];
    }
  | {
      type: 'message.deleted';
      conversationId: string;
      /** Primary / first deleted id (compat) */
      messageId: string;
      /** All deleted public message uuids (single or multi) */
      messageIds: string[];
      scope: 'me' | 'everyone';
      actorId: string;
      notifyUserIds?: string[];
    }
  | {
      type: 'conversation.deleted';
      conversationId: string;
      actorId: string;
      /** me = hide for actor only; everyone = destroy for all */
      scope?: 'me' | 'everyone';
      notifyUserIds?: string[];
    }
  | {
      /** Group title / avatar updated (admin) */
      type: 'conversation.updated';
      conversationId: string;
      actorId: string;
      conversation: {
        id: string;
        type: 'direct' | 'group';
        title: string | null;
        avatarPath: string | null;
        participantsCount: number;
      };
      notifyUserIds?: string[];
    }
  | {
      /** Per-user settings (archive / mute / pin) — actor devices only */
      type: 'conversation.settings';
      conversationId: string;
      /** All affected conversation UUIDs (bulk archive) */
      conversationIds?: string[];
      actorId: string;
      settings: {
        isArchived?: boolean;
        isMuted?: boolean;
        isPinned?: boolean;
      };
      notifyUserIds?: string[];
    }
  | {
      type: 'message.pinned' | 'message.unpinned';
      conversationId: string;
      message: ChatMessage | null;
      messageId: string;
      notifyUserIds?: string[];
    }
  | {
      type: 'message.reacted';
      conversationId: string;
      messageId: string;
      actorId: string;
      emoji: string | null;
      reactions: ChatMessage['reactions'];
      myReactionByUser?: Record<string, string | null>;
      notifyUserIds?: string[];
    }
  | {
      type: 'message.seen';
      conversationId: string;
      readerId: string;
      messageId: string | null;
      notifyUserIds?: string[];
    }
  | {
      type: 'message.delivered';
      conversationId: string;
      delivererId: string;
      messageId: string | null;
      notifyUserIds?: string[];
    }
  | {
      type: 'channel.created' | 'channel.updated';
      channelId: string;
      channel: ChannelDetail;
      notifyUserIds?: string[];
    }
  | {
      type: 'channel.deleted' | 'channel.left';
      channelId: string;
      userId?: string;
      notifyUserIds?: string[];
    }
  | {
      type: 'channel.message.created';
      channelId: string;
      message: ChannelMessage;
      notifyUserIds?: string[];
    }
  | {
      type: 'channel.message.edited';
      channelId: string;
      message: ChannelMessage;
      notifyUserIds?: string[];
    }
  | {
      type: 'channel.message.deleted';
      channelId: string;
      messageId: string;
      /** All deleted ids (bulk). Prefer over messageId alone. */
      messageIds?: string[];
      actorId: string;
      scope: 'me' | 'everyone';
      notifyUserIds?: string[];
    }
  | {
      /** Actor marked a channel read — inbox/footer unread → 0 on their devices */
      type: 'channel.message.seen';
      channelId: string;
      readerId: string;
      messageId: string | null;
      unreadCount: number;
      notifyUserIds?: string[];
    }
  | {
      /** Actor marked a channel unread — inbox badge on their devices */
      type: 'channel.message.unread';
      channelId: string;
      readerId: string;
      unreadCount: number;
      notifyUserIds?: string[];
    }
  | {
      /** Public user uuids: actor blocked/unblocked target */
      type: 'user.blocked' | 'user.unblocked';
      actorId: string;
      targetId: string;
      /** DM conversation public uuid when one exists */
      conversationId?: string | null;
      notifyUserIds?: string[];
    };

let chatPub: Redis | null = null;

function getChatPublisher(): Redis {
  if (!chatPub) {
    chatPub = new Redis(getRedisConnection()); // no keyPrefix — channel is absolute
    chatPub.on('error', () => {
      // quiet — publish is best-effort
    });
  }
  return chatPub;
}

function socketInternalUrl(): string {
  const host =
    env.SOCKET_HOST === '0.0.0.0' || env.SOCKET_HOST === '::'
      ? '127.0.0.1'
      : env.SOCKET_HOST;
  return `http://${host}:${env.SOCKET_PORT}/internal/chat/realtime`;
}

/** When Redis is off (or publish fails), POST into the socket process. */
async function publishViaHttp(payload: ChatRealtimePayload): Promise<void> {
  const res = await fetch(socketInternalUrl(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-token': env.JWT_ACCESS_SECRET,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(3_000),
  });
  if (!res.ok) {
    throw new Error(`socket fan-out HTTP ${res.status}`);
  }
}

/** Publish after HTTP chat writes. Redis preferred; HTTP fan-out when Redis off. */
export async function publishChatRealtime(
  payload: ChatRealtimePayload,
): Promise<void> {
  try {
    if (isRedisEnabled()) {
      const pub = getChatPublisher();
      if (pub.status === 'wait') await pub.connect();
      await pub.publish(CHAT_REALTIME_CHANNEL, JSON.stringify(payload));
      return;
    }
    await publishViaHttp(payload);
  } catch {
    // If Redis path failed, try HTTP once (e.g. Redis down but socket up)
    if (isRedisEnabled()) {
      try {
        await publishViaHttp(payload);
      } catch {
        // realtime best-effort; HTTP path already succeeded
      }
    }
  }
}
