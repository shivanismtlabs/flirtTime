import { z } from 'zod';

export const shareUsernameParamsSchema = z.object({
  /** Handle, optional `@` prefix — e.g. `dani.entakly` or `@dani.entakly` */
  username: z.string().min(1).max(64),
});

export const contentIdParamsSchema = z.object({
  id: z.string().min(1).max(128),
});

export const contentIdWithUsernameParamsSchema = z.object({
  id: z.string().min(1).max(128),
  username: z.string().min(1).max(64),
});

export const CONTENT_TYPES = ['post', 'vibe', 'reel', 'channel'] as const;
