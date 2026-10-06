import { UserFeedRepository, type UserFeedContentType } from './user-feed.repository.js';

/**
 * Write-time timeline fan-out (no Redis).
 * Keep fire-and-forget from HTTP handlers so create latency stays low when
 * follower sets are large — errors are swallowed after attempt.
 */
export class UserFeedService {
  constructor(private readonly repo = new UserFeedRepository()) {}

  /**
   * @param opts.awaitAudience - default true. Create/HTTP paths pass false so only
   *   the author seed row blocks; full follower/tag fan-out continues in background.
   */
  async onContentPublished(
    data: {
      postId: string | number;
      authorId: string | number;
      contentType: UserFeedContentType;
      privacy: string;
      audienceUserUuids?: string[] | null;
      taggedUserIds?: string[];
      createdAt: Date | string;
    },
    opts?: { awaitAudience?: boolean },
  ): Promise<void> {
    await this.repo.fanoutContent(data, {
      awaitAudience: opts?.awaitAudience ?? true,
    });
  }

  async onContentRemoved(postId: string | number): Promise<void> {
    await this.repo.removeByPostId(postId);
  }

  async onFollowAccepted(
    followerId: string | number,
    authorId: string | number,
  ): Promise<void> {
    await this.repo.backfillAuthorIntoFollowerFeed(followerId, authorId);
  }

  async onUnfollow(
    followerId: string | number,
    authorId: string | number,
  ): Promise<void> {
    await this.repo.removeAuthorFromUserFeed(followerId, authorId);
  }

  async listAcceptedFollowerUuids(
    authorId: string | number,
    opts?: { limit?: number },
  ): Promise<string[]> {
    return this.repo.listAcceptedFollowerUuids(authorId, opts);
  }

  async maybeTrimPostViews(postId: string | number, viewsCount: number): Promise<void> {
    // Amortize: only when stats cross retention + every ~100 new views
    if (viewsCount < 1_100) return;
    if (viewsCount % 100 !== 0) return;
    const rows = await this.repo.countPostViews(postId);
    if (rows > 1_000) {
      await this.repo.trimPostViews(postId);
    }
  }

  /** Ops / future cron — not wired to HTTP. */
  async runMaintenance(): Promise<{ notifications: number; feedOrphans: number }> {
    const [notifications, feedOrphans] = await Promise.all([
      this.repo.purgeOldNotifications(90),
      this.repo.purgeSoftDeletedPostsFromFeed(),
    ]);
    return { notifications, feedOrphans };
  }
}
