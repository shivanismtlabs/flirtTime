import { NotFoundError, ValidationError } from '../../shared/errors/index.js';
import { NotificationService } from '../notification/notification.service.js';
import { ProfileVisitorsRepository } from './profile-visitors.repository.js';
import type {
  ListProfileVisitorsInput,
  ListProfileVisitorsResult,
  RecordProfileViewInput,
  RecordProfileViewResult,
} from './profile-visitors.types.js';

export class ProfileVisitorsService {
  constructor(
    private readonly repo = new ProfileVisitorsRepository(),
    private readonly notifications = new NotificationService(),
  ) {}

  async listMine(
    actorUuid: string,
    input: ListProfileVisitorsInput,
  ): Promise<ListProfileVisitorsResult> {
    const ownerId = await this.repo.findUserIdByUuid(actorUuid);
    if (!ownerId) throw new NotFoundError('User not found');
    return this.repo.listByCountry(ownerId, input);
  }

  async recordView(
    actorUuid: string,
    input: RecordProfileViewInput,
  ): Promise<RecordProfileViewResult> {
    const ownerUuid = input.userId?.trim();
    if (!ownerUuid) {
      throw new ValidationError('userId is required');
    }

    if (ownerUuid === actorUuid) {
      return { recorded: false, alreadyViewed: false };
    }

    const [ownerId, viewerId] = await Promise.all([
      this.repo.findUserIdByUuid(ownerUuid),
      this.repo.findUserIdByUuid(actorUuid),
    ]);
    if (!ownerId) throw new NotFoundError('Profile user not found');
    if (!viewerId) throw new NotFoundError('User not found');

    const { inserted } = await this.repo.recordView(ownerId, viewerId);
    if (inserted) {
      void this.notifications
        .create({
          userId: ownerUuid,
          type: 'system',
          i18nKey: 'PROFILE_VISIT',
          actorId: actorUuid,
          entityType: 'profile',
          entityId: ownerUuid,
          icon: 'system',
          tag: `profile-visit-${ownerUuid}-${actorUuid}`,
          link: `/users/${actorUuid}`,
        })
        .catch(() => {});
    }
    return {
      recorded: true,
      alreadyViewed: !inserted,
    };
  }

  async clearMine(actorUuid: string): Promise<{ deletedCount: number }> {
    const ownerId = await this.repo.findUserIdByUuid(actorUuid);
    if (!ownerId) throw new NotFoundError('User not found');
    const deletedCount = await this.repo.clearAllForOwner(ownerId);
    return { deletedCount };
  }
}
