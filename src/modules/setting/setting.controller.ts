import type { FastifyReply, FastifyRequest } from 'fastify';
import { SettingService } from './setting.service.js';
import type {
  UpdateCommentSettingsInput,
  UpdateFollowersFollowingPrivacyInput,
  UpdateMessagePrivacyInput,
  UpdateOffensiveSettingsInput,
  UpdatePostSettingsInput,
  UpdateStorySettingsInput,
  UpdateTagVisibilityInput,
  UpdateUserVisibilityInput,
} from './setting.types.js';

export class SettingController {
  constructor(private readonly service = new SettingService()) {}

  getOffensive = async (request: FastifyRequest, reply: FastifyReply) => {
    const settings = await this.service.getOffensive(request.user!.sub);
    return reply.send({ settings });
  };

  updateOffensive = async (request: FastifyRequest, reply: FastifyReply) => {
    const settings = await this.service.updateOffensive(
      request.user!.sub,
      request.body as UpdateOffensiveSettingsInput,
    );
    return reply.send({ settings });
  };

  getMessagePrivacy = async (request: FastifyRequest, reply: FastifyReply) => {
    const settings = await this.service.getMessagePrivacy(request.user!.sub);
    return reply.send({ settings });
  };

  updateMessagePrivacy = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const settings = await this.service.updateMessagePrivacy(
      request.user!.sub,
      request.body as UpdateMessagePrivacyInput,
    );
    return reply.send({ settings });
  };

  getStorySettings = async (request: FastifyRequest, reply: FastifyReply) => {
    const settings = await this.service.getStorySettings(request.user!.sub);
    return reply.send({ settings });
  };

  updateStorySettings = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const settings = await this.service.updateStorySettings(
      request.user!.sub,
      request.body as UpdateStorySettingsInput,
    );
    return reply.send({ settings });
  };

  getCommentSettings = async (request: FastifyRequest, reply: FastifyReply) => {
    const settings = await this.service.getCommentSettings(request.user!.sub);
    return reply.send({ settings });
  };

  updateCommentSettings = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const settings = await this.service.updateCommentSettings(
      request.user!.sub,
      request.body as UpdateCommentSettingsInput,
    );
    return reply.send({ settings });
  };

  getPostSettings = async (request: FastifyRequest, reply: FastifyReply) => {
    const settings = await this.service.getPostSettings(request.user!.sub);
    return reply.send({ settings });
  };

  updatePostSettings = async (request: FastifyRequest, reply: FastifyReply) => {
    const settings = await this.service.updatePostSettings(
      request.user!.sub,
      request.body as UpdatePostSettingsInput,
    );
    return reply.send({ settings });
  };

  getTagVisibility = async (request: FastifyRequest, reply: FastifyReply) => {
    const settings = await this.service.getTagVisibility(request.user!.sub);
    return reply.send({ settings });
  };

  updateTagVisibility = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const settings = await this.service.updateTagVisibility(
      request.user!.sub,
      request.body as UpdateTagVisibilityInput,
    );
    return reply.send({ settings });
  };

  getUserVisibility = async (request: FastifyRequest, reply: FastifyReply) => {
    const settings = await this.service.getUserVisibility(request.user!.sub);
    return reply.send({ settings });
  };

  updateUserVisibility = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const settings = await this.service.updateUserVisibility(
      request.user!.sub,
      request.body as UpdateUserVisibilityInput,
    );
    return reply.send({ settings });
  };

  getFollowersFollowingPrivacy = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const settings = await this.service.getFollowersFollowingPrivacy(
      request.user!.sub,
    );
    return reply.send({ settings });
  };

  updateFollowersFollowingPrivacy = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const settings = await this.service.updateFollowersFollowingPrivacy(
      request.user!.sub,
      request.body as UpdateFollowersFollowingPrivacyInput,
    );
    return reply.send({ settings });
  };
}
