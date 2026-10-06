import { z } from 'zod';

export const checkBadWordBodySchema = z.object({
  text: z.string().trim().min(1, 'Missing text field in the request body'),
});

export const generateContentBodySchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Missing content field in the request body')
    .max(200, 'Prompt exceeds 200 characters limit'),
});

/** Linkgram-compatible POST /translation body */
export const translateBodySchema = z.object({
  text: z.string().min(1, 'Missing text field in the request body'),
  source_language: z.string().trim().min(1).max(16).optional(),
  target_language: z.string().trim().min(1).max(16).optional(),
});

/** Linkgram-compatible POST /detect body */
export const detectLanguageBodySchema = z.object({
  text: z.string().min(1, 'Missing text field in the request body'),
});
