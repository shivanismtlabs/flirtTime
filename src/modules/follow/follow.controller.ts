import type { FastifyReply, FastifyRequest } from 'fastify';
import { FollowService } from './follow.service.js';

export class FollowController {
  constructor(private readonly service = new FollowService()) {}

  follow = async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.params as { userId: string };
    const edge = await this.service.follow(request.user!.sub, userId);
    return reply.code(201).send({ follow: edge });
  };

  unfollow = async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.params as { userId: string };
    await this.service.unfollow(request.user!.sub, userId);
    return reply.code(204).send();
  };

  pending = async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit, cursor } = request.query as {
      limit: number;
      cursor?: string;
    };
    const result = await this.service.pendingRequests(
      request.user!.sub,
      limit,
      cursor,
    );
    return reply.send(result);
  };

  approve = async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.params as { userId: string };
    const edge = await this.service.approveRequest(request.user!.sub, userId);
    return reply.send({ follow: edge });
  };

  reject = async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.params as { userId: string };
    await this.service.rejectRequest(request.user!.sub, userId);
    return reply.code(204).send();
  };

  removeFollower = async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.params as { userId: string };
    await this.service.removeFollower(request.user!.sub, userId);
    return reply.code(204).send();
  };

  status = async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.params as { userId: string };
    const status = await this.service.status(request.user!.sub, userId);
    return reply.send({ status });
  };

  followers = async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.params as { userId: string };
    const { limit, cursor } = request.query as {
      limit: number;
      cursor?: string;
    };
    const result = await this.service.followers(
      userId,
      limit,
      cursor,
      request.user!.sub,
    );
    return reply.send(result);
  };

  following = async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.params as { userId: string };
    const { limit, cursor } = request.query as {
      limit: number;
      cursor?: string;
    };
    const result = await this.service.following(
      userId,
      limit,
      cursor,
      request.user!.sub,
    );
    return reply.send(result);
  };

  counts = async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.params as { userId: string };
    const counts = await this.service.counts(userId, request.user?.sub);
    return reply.send({ counts });
  };
}
