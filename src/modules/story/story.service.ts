import { ForbiddenError, NotFoundError } from '../../shared/errors/index.js';
import { FollowService } from '../follow/follow.service.js';
import { NotificationService } from '../notification/notification.service.js';
import type { CreateStoryInput } from './story.types.js';
import { StoryRepository } from './story.repository.js';

export class StoryService {
  constructor(
    private readonly repo = new StoryRepository(),
    private readonly follows = new FollowService(),
    private readonly notifications = new NotificationService(),
  ) {}

  private async resolveUserId(uuid: string): Promise<string> {
    const id = await this.repo.findUserIdByUuid(uuid);
    if (!id) {
      throw new NotFoundError('User not found');
    }
    return id;
  }

  private async assertCanViewStory(
    story: { user_id: string | number },
    viewerUuid: string,
  ) {
    const authorUuid = await this.repo.findUserUuidById(String(story.user_id));
    if (!authorUuid) {
      throw new NotFoundError('Story not found');
    }
    const canView = await this.follows.canViewAuthorContent(
      viewerUuid,
      authorUuid,
    );
    if (!canView) {
      throw new ForbiddenError('This account is private');
    }
  }

  async create(actorUuid: string, input: CreateStoryInput) {
    const userId = await this.resolveUserId(actorUuid);
    return this.repo.create(userId, input);
  }

  async getById(uuid: string, viewerUuid: string) {
    const story = await this.repo.findByUuid(uuid);
    if (!story) {
      throw new NotFoundError('Story not found');
    }
    await this.assertCanViewStory(story, viewerUuid);
    return story;
  }

  async feed(actorUuid: string, limit: number, cursor?: string) {
    const userId = await this.resolveUserId(actorUuid);
    return this.repo.listFeed(userId, limit, cursor);
  }

  async mine(actorUuid: string, limit: number, cursor?: string) {
    const userId = await this.resolveUserId(actorUuid);
    return this.repo.listMine(userId, limit, cursor);
  }

  async remove(uuid: string, actorUuid: string) {
    const userId = await this.resolveUserId(actorUuid);
    const deleted = await this.repo.softDelete(uuid, userId);
    if (!deleted) {
      throw new NotFoundError('Story not found');
    }
  }

  async markSeen(storyUuid: string, actorUuid: string) {
    const [story, userId] = await Promise.all([
      this.repo.findByUuid(storyUuid),
      this.resolveUserId(actorUuid),
    ]);
    if (!story) {
      throw new NotFoundError('Story not found');
    }
    await this.assertCanViewStory(story, actorUuid);
    return this.repo.markSeen(String(story.id), userId);
  }

  async like(storyUuid: string, actorUuid: string) {
    const [story, userId] = await Promise.all([
      this.repo.findByUuid(storyUuid),
      this.resolveUserId(actorUuid),
    ]);
    if (!story) {
      throw new NotFoundError('Story not found');
    }
    await this.assertCanViewStory(story, actorUuid);
    const { like, created } = await this.repo.like(String(story.id), userId);

    if (created && String(story.user_id) !== String(userId)) {
      const authorUuid = await this.repo.findUserUuidById(String(story.user_id));
      if (authorUuid) {
        const display = await this.repo.findUserDisplayByUuid(actorUuid);
        const name =
          display?.fullName?.trim() || display?.username || 'Someone';
        void this.notifications
          .create({
            userId: authorUuid,
            type: 'like',
            i18nKey: 'LIKE',
            i18nParams: { user: name, content: 'story' },
            actorId: actorUuid,
            entityType: 'story',
            entityId: storyUuid,
            tag: `story-like-${storyUuid}`,
            link: `/stories/${storyUuid}`,
          })
          .catch(() => {});
      }
    }

    return like;
  }

  async unlike(storyUuid: string, actorUuid: string) {
    const [story, userId] = await Promise.all([
      this.repo.findByUuid(storyUuid),
      this.resolveUserId(actorUuid),
    ]);
    if (!story) {
      throw new NotFoundError('Story not found');
    }
    await this.assertCanViewStory(story, actorUuid);
    const updated = await this.repo.unlike(String(story.id), userId);
    if (!updated) {
      throw new NotFoundError('Story like not found');
    }
  }
}
