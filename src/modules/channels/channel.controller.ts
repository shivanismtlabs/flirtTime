import type { FastifyReply, FastifyRequest } from 'fastify';
import { ChannelService } from './channel.service.js';
import type {
  CreateChannelInput,
  ChannelSettingsInput,
  DeleteChannelMessageInput,
  DeleteChannelMessagesInput,
  EditChannelMessageInput,
  SendChannelMessageInput,
  UpdateChannelInput,
} from './channel.types.js';

export class ChannelController {
  constructor(private readonly service = new ChannelService()) {}

  createChannel = async (request: FastifyRequest, reply: FastifyReply) => {
    const channel = await this.service.createChannel(
      request.user!.sub,
      request.body as CreateChannelInput,
    );
    return reply.code(201).send({ channel });
  };

  listChannels = async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit, cursor, archived } = request.query as {
      limit: number;
      cursor?: string;
      archived?: boolean;
    };
    const result = await this.service.listChannels(request.user!.sub, {
      limit,
      cursor,
      archived,
    });
    return reply.send(result);
  };

  browseChannels = async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit, cursor, q } = request.query as {
      limit: number;
      cursor?: string;
      q?: string;
    };
    const result = await this.service.browseChannels(request.user!.sub, {
      limit,
      cursor,
      q,
    });
    return reply.send(result);
  };

  checkInviteSlug = async (request: FastifyRequest, reply: FastifyReply) => {
    const { slug, excludeChannelId } = request.query as {
      slug: string;
      excludeChannelId?: string;
    };
    const result = await this.service.checkInviteSlug(slug, excludeChannelId);
    return reply.send(result);
  };

  getChannel = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const channel = await this.service.getChannel(request.user!.sub, id);
    return reply.send({ channel });
  };

  getChannelBySlug = async (request: FastifyRequest, reply: FastifyReply) => {
    const { slug } = request.params as { slug: string };
    const channel = await this.service.getChannelBySlug(
      request.user!.sub,
      slug,
    );
    return reply.send({ channel });
  };

  updateChannel = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const channel = await this.service.updateChannel(
      request.user!.sub,
      id,
      request.body as UpdateChannelInput,
    );
    return reply.send({ channel });
  };

  leaveChannel = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await this.service.leaveChannel(request.user!.sub, id);
    return reply.code(204).send();
  };

  followChannel = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const channel = await this.service.followChannel(request.user!.sub, id);
    return reply.send({ channel });
  };

  markRead = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { messageId?: string };
    const result = await this.service.markRead(request.user!.sub, id, body);
    return reply.send(result);
  };

  markUnread = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.markUnread(request.user!.sub, id);
    return reply.send(result);
  };

  updateSettings = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const settings = await this.service.updateSettings(
      request.user!.sub,
      id,
      request.body as ChannelSettingsInput,
    );
    return reply.send({ settings });
  };

  deleteChannel = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await this.service.deleteChannel(request.user!.sub, id);
    return reply.code(204).send();
  };

  listMessages = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { limit, cursor } = request.query as {
      limit: number;
      cursor?: string;
    };
    const result = await this.service.listMessages(request.user!.sub, id, {
      limit,
      cursor,
    });
    return reply.send(result);
  };

  sendMessage = async (request: FastifyRequest, reply: FastifyReply) => {
    const message = await this.service.sendMessage(
      request.user!.sub,
      request.body as SendChannelMessageInput,
    );
    return reply.code(201).send({ message });
  };

  editMessage = async (request: FastifyRequest, reply: FastifyReply) => {
    const { messageId } = request.params as { messageId: string };
    const message = await this.service.editMessage(
      request.user!.sub,
      messageId,
      request.body as EditChannelMessageInput,
    );
    return reply.send({ message });
  };

  deleteMessage = async (request: FastifyRequest, reply: FastifyReply) => {
    const { messageId } = request.params as { messageId: string };
    const { scope } = request.query as { scope: 'me' | 'everyone' };
    const result = await this.service.deleteMessage(
      request.user!.sub,
      messageId,
      { scope } as DeleteChannelMessageInput,
    );
    return reply.send(result);
  };

  deleteMessages = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.service.deleteMessages(
      request.user!.sub,
      request.body as DeleteChannelMessagesInput,
    );
    return reply.send(result);
  };
}
