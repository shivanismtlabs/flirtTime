import type { FastifyReply, FastifyRequest } from 'fastify';
import { okResponse } from '../../shared/http/index.js';
import { localizeResponse } from '../lookup/lookup.service.js';
import { ChatService } from './chat.service.js';
import type {
  AddMembersInput,
  BulkArchiveConversationsInput,
  ConversationSettingsInput,
  CreateConversationInput,
  DeleteMessageInput,
  DeleteMessagesInput,
  EditMessageInput,
  ForwardMessagesInput,
  MarkDeliveredInput,
  MarkReadInput,
  PinMessageInput,
  ReactMessageInput,
  ReactMessagesInput,
  SendMessageInput,
  TranslateMessageInput,
  TranslateMessagesInput,
  UpdateConversationInput,
  UpdateMemberRoleInput,
  VotePollInput,
} from './chat.types.js';

export class ChatController {
  constructor(private readonly service = new ChatService()) {}

  listGroupCandidates = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      q?: string;
      gender?: string;
      nationality?: string | string[];
      profession?: string;
      ageMin?: number;
      ageMax?: number;
      latitude?: number;
      longitude?: number;
      radiusKm?: number;
      page: number;
      limit: number;
      conversationId?: string;
    };
    const nationality = Array.isArray(query.nationality)
      ? query.nationality
      : query.nationality
        ? [query.nationality]
        : undefined;
    const nationalities = nationality
      ?.map((v) => v.trim())
      .filter((v) => v && v.toLowerCase() !== 'all');
    const profession = query.profession?.trim();
    const ageMin = query.ageMin;
    const ageMax = query.ageMax;
    const ageIsAll =
      ageMin != null && ageMax != null && ageMin <= 18 && ageMax >= 99;

    const result = await this.service.listGroupCandidates(
      request.user!.sub,
      {
        q: query.q,
        gender:
          query.gender?.trim() && query.gender.trim().toLowerCase() !== 'all'
            ? query.gender
            : undefined,
        nationalities:
          nationalities && nationalities.length > 0 && nationalities.length < 150
            ? nationalities
            : undefined,
        profession:
          profession && profession.toLowerCase() !== 'all'
            ? profession
            : undefined,
        ageMin: ageIsAll ? undefined : ageMin,
        ageMax: ageIsAll ? undefined : ageMax,
        latitude: query.latitude,
        longitude: query.longitude,
        radiusKm: query.radiusKm,
      },
      query.page,
      query.limit,
      query.conversationId,
    );
    // Same payload as GET /users: { rows, total }
    return reply.send(await localizeResponse(request, result));
  };

  createConversation = async (request: FastifyRequest, reply: FastifyReply) => {
    const conversation = await this.service.createConversation(
      request.user!.sub,
      request.body as CreateConversationInput,
    );
    return reply.code(201).send({ conversation });
  };

  listConversations = async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit, cursor, archived } = request.query as {
      limit: number;
      cursor?: string;
      archived?: boolean;
    };
    const result = await this.service.listConversations(request.user!.sub, {
      limit,
      cursor,
      archived,
    });
    return reply.send(result);
  };

  getConversation = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const conversation = await this.service.getConversation(request.user!.sub, id);
    return reply.send({ conversation });
  };

  updateConversation = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const conversation = await this.service.updateConversation(
      request.user!.sub,
      id,
      request.body as UpdateConversationInput,
    );
    return reply.send({ conversation });
  };

  updateSettings = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.updateSettings(
      request.user!.sub,
      id,
      request.body as ConversationSettingsInput,
    );
    return reply.send(result);
  };

  archiveConversations = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.service.archiveConversations(
      request.user!.sub,
      request.body as BulkArchiveConversationsInput,
    );
    return reply.send(result);
  };

  listMembers = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const members = await this.service.listMembers(request.user!.sub, id);
    return reply.send({ members });
  };

  addMembers = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const conversation = await this.service.addMembers(
      request.user!.sub,
      id,
      request.body as AddMembersInput,
    );
    return reply.send({ conversation });
  };

  removeMember = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    await this.service.removeMember(request.user!.sub, id, userId);
    return reply.code(204).send();
  };

  deleteConversation = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { scope } = request.query as { scope?: 'me' | 'everyone' };
    await this.service.deleteConversation(
      request.user!.sub,
      id,
      scope ?? 'me',
    );
    return reply.code(204).send();
  };

  updateMemberRole = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    const members = await this.service.updateMemberRole(
      request.user!.sub,
      id,
      userId,
      request.body as UpdateMemberRoleInput,
    );
    return reply.send({ members });
  };

  markRead = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.markRead(
      request.user!.sub,
      id,
      (request.body ?? {}) as MarkReadInput,
    );
    return reply.send(result);
  };

  markUnread = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.markUnread(request.user!.sub, id);
    return reply.send(result);
  };

  markDelivered = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.markDelivered(
      request.user!.sub,
      id,
      (request.body ?? {}) as MarkDeliveredInput,
    );
    return reply.send(result);
  };

  getMessageInfo = async (request: FastifyRequest, reply: FastifyReply) => {
    const { messageId } = request.params as { messageId: string };
    const info = await this.service.getMessageInfo(
      request.user!.sub,
      messageId,
    );
    return reply.send({ info });
  };

  syncInboxDelivered = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.service.syncInboxDelivered(request.user!.sub);
    return reply.send(result);
  };

  sendMessage = async (request: FastifyRequest, reply: FastifyReply) => {
    const message = await this.service.sendMessage(
      request.user!.sub,
      request.body as SendMessageInput,
    );
    return reply.code(201).send({ message });
  };

  listMessages = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { limit, cursor } = request.query as { limit: number; cursor?: string };
    const result = await this.service.listMessages(request.user!.sub, id, {
      limit,
      cursor,
    });
    return reply.send(result);
  };

  editMessage = async (request: FastifyRequest, reply: FastifyReply) => {
    const { messageId } = request.params as { messageId: string };
    const message = await this.service.editMessage(
      request.user!.sub,
      messageId,
      request.body as EditMessageInput,
    );
    return reply.send({ message });
  };

  deleteMessage = async (request: FastifyRequest, reply: FastifyReply) => {
    const { messageId } = request.params as { messageId: string };
    const { scope } = request.query as { scope: 'me' | 'everyone' };
    const result = await this.service.deleteMessage(
      request.user!.sub,
      messageId,
      { scope } as DeleteMessageInput,
    );
    return reply.send(result);
  };

  deleteMessages = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.service.deleteMessages(
      request.user!.sub,
      request.body as DeleteMessagesInput,
    );
    return reply.send(result);
  };

  forwardMessages = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.service.forwardMessages(
      request.user!.sub,
      request.body as ForwardMessagesInput,
    );
    return reply.code(201).send(result);
  };

  pinMessage = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, messageId } = request.params as { id: string; messageId: string };
    const message = await this.service.pinMessage(
      request.user!.sub,
      id,
      messageId,
      request.body as PinMessageInput,
    );
    return reply.send({ message });
  };

  reactMessage = async (request: FastifyRequest, reply: FastifyReply) => {
    const { messageId } = request.params as { messageId: string };
    const body = request.body as ReactMessageInput;
    const result = await this.service.reactToMessage(
      request.user!.sub,
      messageId,
      body.emoji,
    );
    return reply.send(result);
  };

  reactMessages = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.service.reactToMessages(
      request.user!.sub,
      request.body as ReactMessagesInput,
    );
    return reply.send(result);
  };

  translateMessage = async (request: FastifyRequest, reply: FastifyReply) => {
    const { messageId } = request.params as { messageId: string };
    const body = request.body as TranslateMessageInput;
    const result = await this.service.translateMessage(
      request.user!.sub,
      messageId,
      body.targetLanguage,
    );
    return reply.send(result);
  };

  translateMessages = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.service.translateMessages(
      request.user!.sub,
      request.body as TranslateMessagesInput,
    );
    return reply.send(result);
  };

  getPinnedMessage = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const message = await this.service.getPinnedMessage(request.user!.sub, id);
    return reply.send({ message });
  };

  votePoll = async (request: FastifyRequest, reply: FastifyReply) => {
    const { pollId } = request.params as { pollId: string };
    const poll = await this.service.votePoll(
      request.user!.sub,
      pollId,
      request.body as VotePollInput,
    );
    return reply.send(okResponse({ poll }, 'Your vote was recorded'));
  };

  closePoll = async (request: FastifyRequest, reply: FastifyReply) => {
    const { pollId } = request.params as { pollId: string };
    const poll = await this.service.closePoll(request.user!.sub, pollId);
    return reply.send(okResponse({ poll }, 'Poll closed'));
  };

  listPollVoters = async (request: FastifyRequest, reply: FastifyReply) => {
    const { pollId, optionId } = request.params as {
      pollId: string;
      optionId: string;
    };
    const { limit, cursor } = request.query as { limit: number; cursor?: string };
    const result = await this.service.listPollVoters(
      request.user!.sub,
      pollId,
      optionId,
      { limit, cursor },
    );
    return reply.send(result);
  };
}
