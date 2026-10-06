import { Redis } from 'ioredis';
import { env, getRedisConnection } from '../../shared/config/index.js';
import { isRedisEnabled } from '../../shared/cache/index.js';

/**
 * Absolute Redis channel (no ioredis keyPrefix).
 * API publishes here; socket bridge fans out to user/profile/post/vibe rooms.
 */
export const SOCIAL_REALTIME_CHANNEL = 'onevibe:social:events';

/** Bounded follower fan-out for create/delete blasts (same as notify). */
export const SOCIAL_REALTIME_FOLLOWER_CAP = 200;

export type SocialContentStats = {
  likeCount?: number;
  commentCount?: number;
  /** Direct child vibe replies (Threads-style), not post_comments */
  repliesCount?: number;
  shareCount?: number;
  viewCount?: number;
  giftCount?: number;
  saveCount?: number;
  votesCount?: number;
};

export type FollowRealtimeStatus = 'requested' | 'following' | 'none';

/** Lean comment wire body (same shape for post + vibe). */
export type SocialCommentPayload = {
  id: string;
  body: string;
  parentId: string | null;
  likesCount: number;
  repliesCount: number;
  createdAt: string;
  user: {
    id: string;
    username: string;
    fullName: string | null;
    profilePicture: string | null;
    isVerified: boolean;
  };
};

export type SocialRealtimePayload =
  | {
      type: 'post.created';
      postId: string;
      authorId: string;
      privacy: string;
      createdAt: string;
      /** User rooms to notify (author + up to N followers) */
      notifyUserIds?: string[];
    }
  | {
      type: 'post.deleted';
      postId: string;
      authorId: string;
      notifyUserIds?: string[];
    }
  | {
      type: 'post.updated';
      postId: string;
      authorId: string;
      kind: 'stats' | 'meta';
      stats?: SocialContentStats;
      notifyUserIds?: string[];
    }
  | {
      type: 'vibe.created';
      vibeId: string;
      authorId: string;
      privacy: string;
      createdAt: string;
      /** Immediate parent vibe UUID — set for child replies (no follower fan-out). */
      parentId?: string;
      /** Parent's direct replies count after this create. */
      repliesCount?: number;
      /** Full child vibe row so open thread sheets can append without refetch. */
      reply?: Record<string, unknown>;
      notifyUserIds?: string[];
    }
  | {
      type: 'vibe.deleted';
      vibeId: string;
      authorId: string;
      /** Immediate parent vibe UUID when the deleted row was a reply. */
      parentId?: string;
      /** Parent's direct replies count after this delete. */
      repliesCount?: number;
      notifyUserIds?: string[];
    }
  | {
      type: 'vibe.updated';
      vibeId: string;
      authorId: string;
      kind: 'stats' | 'meta';
      stats?: SocialContentStats;
      notifyUserIds?: string[];
    }
  | {
      type: 'comment.created';
      contentType: 'post' | 'vibe';
      contentId: string;
      contentAuthorId: string;
      commentCount: number;
      /** Parent comment's replies count after this reply (omit for top-level). */
      parentRepliesCount?: number;
      comment: SocialCommentPayload;
      /** Public UUIDs mutually blocked with the commenter — omit from fan-out. */
      exceptUserIds?: string[];
    }
  | {
      type: 'comment.deleted';
      contentType: 'post' | 'vibe';
      contentId: string;
      contentAuthorId: string;
      commentId: string;
      parentId: string | null;
      commentCount: number;
      commenterId?: string;
      exceptUserIds?: string[];
    }
  | {
      type: 'comment.updated';
      contentType: 'post' | 'vibe';
      contentId: string;
      contentAuthorId: string;
      commentId: string;
      kind: 'stats';
      stats: { likeCount?: number; repliesCount?: number };
    }
  | {
      type: 'follow.changed';
      actorId: string;
      targetId: string;
      status: FollowRealtimeStatus;
      /** Who initiated: actor followed target, or target accepted/requested etc. */
      direction: 'outbound' | 'inbound';
      /** Live counts after the edge change (best-effort, for optimistic UI). */
      actorCounts?: { followerCount: number; followingCount: number };
      targetCounts?: { followerCount: number; followingCount: number };
    };

let socialPub: Redis | null = null;

function getSocialPublisher(): Redis {
  if (!socialPub) {
    socialPub = new Redis(getRedisConnection());
    socialPub.on('error', () => {
      // quiet — publish is best-effort
    });
  }
  return socialPub;
}

function socketInternalUrl(): string {
  const host =
    env.SOCKET_HOST === '0.0.0.0' || env.SOCKET_HOST === '::'
      ? '127.0.0.1'
      : env.SOCKET_HOST;
  return `http://${host}:${env.SOCKET_PORT}/internal/social/realtime`;
}

async function publishViaHttp(payload: SocialRealtimePayload): Promise<void> {
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
    throw new Error(`socket social fan-out HTTP ${res.status}`);
  }
}

/** Publish social domain event. Redis preferred; HTTP when Redis off. */
export async function publishSocialRealtime(
  payload: SocialRealtimePayload,
): Promise<void> {
  try {
    if (isRedisEnabled()) {
      const pub = getSocialPublisher();
      if (pub.status === 'wait') await pub.connect();
      await pub.publish(SOCIAL_REALTIME_CHANNEL, JSON.stringify(payload));
      return;
    }
    await publishViaHttp(payload);
  } catch {
    try {
      await publishViaHttp(payload);
    } catch {
      // best-effort
    }
  }
}
