import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { StoryController } from './story.controller.js';
import {
  createStoryBodySchema,
  storyIdParamsSchema,
  storyQuerySchema,
} from './story.schema.js';

export async function storyRoutes(app: FastifyInstance): Promise<void> {
  const controller = new StoryController();
  tagRoutes(app, 'Stories');
  app.addHook('preHandler', authenticate);

  app.get(
    '/',
    {
      schema: requireBearer({
        summary: 'Story feed',
        description:
          'Return active stories from people the authenticated user follows (and own stories when included). Ephemeral — expired stories are omitted.',
        querystring: storyQuerySchema,
      }),
    },
    controller.feed,
  );

  app.get(
    '/me',
    {
      schema: requireBearer({
        summary: 'My stories',
        description: 'List the authenticated user’s currently active stories.',
        querystring: storyQuerySchema,
      }),
    },
    controller.mine,
  );

  app.post(
    '/',
    {
      schema: requireBearer({
        summary: 'Create story',
        description:
          'Create a new story for the authenticated user. Stories expire automatically based on TTL rules.',
        body: createStoryBodySchema,
      }),
    },
    controller.create,
  );

  app.get(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Get story',
        description: 'Fetch a single story by public UUID if still active and visible to the viewer.',
        params: storyIdParamsSchema,
      }),
    },
    controller.getById,
  );

  app.delete(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Delete story',
        description: 'Delete (or soft-delete) a story owned by the authenticated user.',
        params: storyIdParamsSchema,
      }),
    },
    controller.remove,
  );

  app.post(
    '/:id/seen',
    {
      schema: requireBearer({
        summary: 'Mark story seen',
        description:
          'Record that the authenticated user viewed this story (used for viewer lists / rings).',
        params: storyIdParamsSchema,
      }),
    },
    controller.markSeen,
  );

  app.post(
    '/:id/like',
    {
      schema: requireBearer({
        summary: 'Like story',
        description: 'Like an active story. Idempotent if already liked.',
        params: storyIdParamsSchema,
      }),
    },
    controller.like,
  );

  app.delete(
    '/:id/like',
    {
      schema: requireBearer({
        summary: 'Unlike story',
        description: 'Remove the authenticated user’s like from a story.',
        params: storyIdParamsSchema,
      }),
    },
    controller.unlike,
  );
}
