import { ForbiddenError, NotFoundError } from '../../shared/errors/index.js';
import { FollowService } from '../follow/follow.service.js';
import { UserFeedService } from '../user-feed/user-feed.service.js';
import type { CreateReelInput } from './reel.types.js';
import { ReelRepository } from './reel.repository.js';

export class ReelService {
  constructor(
    private readonly repo = new ReelRepository(),
    private readonly follows = new FollowService(),
    private readonly userFeed = new UserFeedService(),
  ) {}

  private async resolveUserId(uuid: string): Promise<string> {
    const id = await this.repo.findUserIdByUuid(uuid);
    if (!id) {
      throw new NotFoundError('User not found');
    }
    return id;
  }

  private async assertCanViewReel(
    reel: { user_id: string | number },
    viewerUuid: string,
  ) {
    const authorUuid = await this.repo.findUserUuidById(String(reel.user_id));
    if (!authorUuid) {
      throw new NotFoundError('Reel not found');
    }
    const canView = await this.follows.canViewAuthorContent(
      viewerUuid,
      authorUuid,
    );
    if (!canView) {
      throw new ForbiddenError('This account is private');
    }
  }

  async create(actorUuid: string, input: CreateReelInput) {
    const userId = await this.resolveUserId(actorUuid);
    const reel = await this.repo.create(userId, input);
    void this.userFeed
      .onContentPublished({
        postId: reel.id as string | number,
        authorId: userId,
        contentType: 'reel',
        privacy: String(reel.privacy ?? 'public'),
        createdAt: (reel.created_at as Date | string) ?? new Date(),
      })
      .catch(() => {});
    return reel;
  }

  async getById(uuid: string, viewerUuid: string) {
    const reel = await this.repo.findByUuid(uuid);
    if (!reel) {
      throw new NotFoundError('Reel not found');
    }
    await this.assertCanViewReel(reel, viewerUuid);
    return reel;
  }

  async explore(viewerUuid: string, limit: number, cursor?: string) {
    const viewerId = await this.resolveUserId(viewerUuid);
    return this.repo.listExplore(viewerId, limit, cursor);
  }

  async listByUser(
    userUuid: string,
    limit: number,
    cursor: string | undefined,
    viewerUuid: string,
  ) {
    const canView = await this.follows.canViewAuthorContent(
      viewerUuid,
      userUuid,
    );
    if (!canView) {
      throw new ForbiddenError('This account is private');
    }
    const userId = await this.resolveUserId(userUuid);
    return this.repo.listByUser(userId, limit, cursor);
  }

  async remove(uuid: string, actorUuid: string) {
    const userId = await this.resolveUserId(actorUuid);
    const { deleted, postId } = await this.repo.softDelete(uuid, userId);
    if (!deleted) {
      throw new NotFoundError('Reel not found');
    }
    if (postId) {
      void this.userFeed.onContentRemoved(postId).catch(() => {});
    }
  }
}
