import type { FastifyReply, FastifyRequest } from 'fastify';
import { VibeService } from './vibe.service.js';
import type {
  CreateCommentInput,
  CreateVibeInput,
  PostSettingsInput,
  ReportPostInput,
  SendGiftInput,
  SharePostInput,
  UpdatePostInput,
} from './vibe.types.js';

export class VibeController {
  constructor(private readonly service = new VibeService()) {}

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const vibe = await this.service.createVibe(
      request.user!.sub,
      request.body as CreateVibeInput,
    );
    return reply.code(201).send({ vibe });
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const vibe = await this.service.updateVibe(
      id,
      request.user!.sub,
      request.body as UpdatePostInput,
    );
    return reply.send({ vibe });
  };

  updateSettings = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const vibe = await this.service.updateSettings(
      id,
      request.user!.sub,
      request.body as PostSettingsInput,
    );
    return reply.send({ vibe });
  };

  home = async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit, page, cursor } = request.query as {
      limit: number;
      page?: number;
      cursor?: string;
    };
    const feed = await this.service.getHomeFeed(request.user!.sub, {
      limit,
      page,
      cursor,
    });
    return reply.send(feed);
  };

  userFeed = async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.params as { userId: string };
    const { limit, page, cursor } = request.query as {
      limit: number;
      page?: number;
      cursor?: string;
    };
    const feed = await this.service.getUserFeed(userId, request.user?.sub, {
      limit,
      page,
      cursor,
    });
    return reply.send(feed);
  };

  getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const viewerUuid = request.user?.sub;
    const vibe = await this.service.getVibe(id, viewerUuid);
    return reply.send({ vibe });
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await this.service.deleteVibe(id, request.user!.sub);
    return reply.code(204).send();
  };

  like = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.likeVibe(id, request.user!.sub);
    return reply.send(result);
  };

  unlike = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.unlikeVibe(id, request.user!.sub);
    return reply.send(result);
  };

  listLikers = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { limit, page } = request.query as { limit: number; page: number };
    const result = await this.service.listLikers(id, {
      limit,
      page,
      viewerUuid: request.user?.sub,
    });
    return reply.send(result);
  };

  listCommentLikers = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, commentId } = request.params as {
      id: string;
      commentId: string;
    };
    const { limit, page } = request.query as { limit: number; page: number };
    const result = await this.service.listCommentLikers(id, commentId, {
      limit,
      page,
      viewerUuid: request.user?.sub,
    });
    return reply.send(result);
  };

  addComment = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.addComment(
      id,
      request.user!.sub,
      request.body as CreateCommentInput,
    );
    return reply.code(201).send(result);
  };

  deleteComment = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, commentId } = request.params as {
      id: string;
      commentId: string;
    };
    await this.service.deleteComment(id, commentId, request.user!.sub);
    return reply.code(204).send();
  };

  report = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.reportVibe(
      id,
      request.user!.sub,
      (request.body as ReportPostInput) ?? {},
    );
    return reply.code(result.created ? 201 : 200).send(result);
  };

  unreport = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.unreportVibe(id, request.user!.sub);
    return reply.send(result);
  };

  listReports = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { limit, page } = request.query as { limit: number; page: number };
    const result = await this.service.listReports(id, {
      limit,
      page,
      viewerUuid: request.user!.sub,
    });
    return reply.send(result);
  };

  listViewers = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { limit, page } = request.query as { limit: number; page: number };
    const result = await this.service.listViewers(id, {
      limit,
      page,
      viewerUuid: request.user!.sub,
    });
    return reply.send(result);
  };

  listComments = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { limit, page, parentId } = request.query as {
      limit: number;
      page: number;
      parentId?: string;
    };
    const result = await this.service.listComments(id, {
      limit,
      page,
      parentId,
      viewerUuid: request.user?.sub,
    });
    return reply.send(result);
  };

  likeComment = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, commentId } = request.params as {
      id: string;
      commentId: string;
    };
    const result = await this.service.likeComment(
      id,
      commentId,
      request.user!.sub,
    );
    return reply.send(result);
  };

  unlikeComment = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, commentId } = request.params as {
      id: string;
      commentId: string;
    };
    const result = await this.service.unlikeComment(
      id,
      commentId,
      request.user!.sub,
    );
    return reply.send(result);
  };

  sendGift = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.sendGift(
      id,
      request.user!.sub,
      request.body as SendGiftInput,
    );
    return reply.code(201).send(result);
  };

  share = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.shareVibe(
      id,
      request.user!.sub,
      (request.body as SharePostInput) ?? {},
    );
    return reply.code(201).send(result);
  };

  save = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.saveVibe(id, request.user!.sub);
    return reply.send(result);
  };

  unsave = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.unsaveVibe(id, request.user!.sub);
    return reply.send(result);
  };

  recordView = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.recordView(id, request.user!.sub);
    return reply.send(result);
  };

  listReplies = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { limit, page, cursor } = request.query as {
      limit: number;
      page?: number;
      cursor?: string;
    };
    const result = await this.service.getReplies(id, request.user!.sub, {
      limit,
      page,
      cursor,
    });
    return reply.send(result);
  };

  getThread = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { limit, page, cursor } = request.query as {
      limit: number;
      page?: number;
      cursor?: string;
    };
    const result = await this.service.getThread(id, request.user!.sub, {
      limit,
      page,
      cursor,
    });
    return reply.send(result);
  };

  votePoll = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { optionId } = request.body as { optionId: string };
    const poll = await this.service.votePoll(id, request.user!.sub, optionId);
    return reply.send({ poll });
  };

  listPollVoters = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { limit, page } = request.query as { limit: number; page: number };
    const result = await this.service.listPollVoters(id, request.user!.sub, {
      limit,
      page,
    });
    return reply.send(result);
  };
}
