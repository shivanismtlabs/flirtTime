import { NotFoundError } from '../../shared/errors/index.js';
import { SettingRepository } from './setting.repository.js';
import type {
  CommentSettings,
  FollowersFollowingPrivacySettings,
  MessagePrivacySettings,
  OffensiveSettings,
  PostSettings,
  StorySettings,
  TagVisibilitySettings,
  UpdateCommentSettingsInput,
  UpdateFollowersFollowingPrivacyInput,
  UpdateMessagePrivacyInput,
  UpdateOffensiveSettingsInput,
  UpdatePostSettingsInput,
  UpdateStorySettingsInput,
  UpdateTagVisibilityInput,
  UpdateUserVisibilityInput,
  UserVisibilitySettings,
} from './setting.types.js';
import { DEFAULT_OFFENSIVE } from './setting.types.js';

export class SettingService {
  constructor(private readonly repo = new SettingRepository()) {}

  private async requireUserId(actorUuid: string): Promise<string> {
    const userId = await this.repo.findUserIdByUuid(actorUuid);
    if (!userId) throw new NotFoundError('User not found');
    return userId;
  }

  async getOffensive(actorUuid: string): Promise<OffensiveSettings> {
    const userId = await this.requireUserId(actorUuid);
    return (await this.repo.getOffensive(userId)) ?? { ...DEFAULT_OFFENSIVE };
  }

  async updateOffensive(
    actorUuid: string,
    input: UpdateOffensiveSettingsInput,
  ): Promise<OffensiveSettings> {
    const userId = await this.requireUserId(actorUuid);
    return this.repo.upsertOffensive(userId, input);
  }

  async getMessagePrivacy(actorUuid: string): Promise<MessagePrivacySettings> {
    const userId = await this.requireUserId(actorUuid);
    return this.repo.ensureMessagePrivacy(userId);
  }

  async updateMessagePrivacy(
    actorUuid: string,
    input: UpdateMessagePrivacyInput,
  ): Promise<MessagePrivacySettings> {
    const userId = await this.requireUserId(actorUuid);
    return this.repo.upsertMessagePrivacy(userId, input);
  }

  async getStorySettings(actorUuid: string): Promise<StorySettings> {
    const userId = await this.requireUserId(actorUuid);
    return this.repo.ensureStorySettings(userId);
  }

  async updateStorySettings(
    actorUuid: string,
    input: UpdateStorySettingsInput,
  ): Promise<StorySettings> {
    const userId = await this.requireUserId(actorUuid);
    return this.repo.upsertStorySettings(userId, input);
  }

  async getCommentSettings(actorUuid: string): Promise<CommentSettings> {
    const userId = await this.requireUserId(actorUuid);
    return this.repo.ensureCommentSettings(userId);
  }

  async updateCommentSettings(
    actorUuid: string,
    input: UpdateCommentSettingsInput,
  ): Promise<CommentSettings> {
    const userId = await this.requireUserId(actorUuid);
    return this.repo.upsertCommentSettings(userId, input);
  }

  async getPostSettings(actorUuid: string): Promise<PostSettings> {
    const userId = await this.requireUserId(actorUuid);
    return this.repo.ensurePostSettings(userId);
  }

  async updatePostSettings(
    actorUuid: string,
    input: UpdatePostSettingsInput,
  ): Promise<PostSettings> {
    const userId = await this.requireUserId(actorUuid);
    return this.repo.upsertPostSettings(userId, input);
  }

  async getTagVisibility(actorUuid: string): Promise<TagVisibilitySettings> {
    const userId = await this.requireUserId(actorUuid);
    return this.repo.ensureTagVisibility(userId);
  }

  async updateTagVisibility(
    actorUuid: string,
    input: UpdateTagVisibilityInput,
  ): Promise<TagVisibilitySettings> {
    const userId = await this.requireUserId(actorUuid);
    return this.repo.upsertTagVisibility(userId, input);
  }

  async getUserVisibility(actorUuid: string): Promise<UserVisibilitySettings> {
    const userId = await this.requireUserId(actorUuid);
    return this.repo.ensureUserVisibility(userId);
  }

  async updateUserVisibility(
    actorUuid: string,
    input: UpdateUserVisibilityInput,
  ): Promise<UserVisibilitySettings> {
    const userId = await this.requireUserId(actorUuid);
    return this.repo.upsertUserVisibility(userId, input);
  }

  async getFollowersFollowingPrivacy(
    actorUuid: string,
  ): Promise<FollowersFollowingPrivacySettings> {
    const userId = await this.requireUserId(actorUuid);
    return this.repo.ensureFollowersFollowingPrivacy(userId);
  }

  async updateFollowersFollowingPrivacy(
    actorUuid: string,
    input: UpdateFollowersFollowingPrivacyInput,
  ): Promise<FollowersFollowingPrivacySettings> {
    const userId = await this.requireUserId(actorUuid);
    return this.repo.upsertFollowersFollowingPrivacy(userId, input);
  }
}
