import { z } from 'zod';

export const createCallBodySchema = z.object({
  conversationId: z
    .string()
    .uuid()
    .describe('Direct or group conversation UUID to start the call in'),
  type: z
    .enum(['audio', 'video'])
    .default('audio')
    .describe('Call media type'),
});

export const callIdBodySchema = z.object({
  callId: z.string().uuid().describe('Public call UUID'),
});

export const activeCallQuerySchema = z.object({
  conversationId: z
    .string()
    .uuid()
    .describe('Conversation UUID to look up an active (ringing/ongoing) call'),
});

export const callIdParamsSchema = z.object({
  callId: z.string().uuid().describe('Public call UUID'),
});

/** Swagger response shapes (envelope unwraps `data` depending on client tooling). */
export const callSessionResponseSchema = z.object({
  call: z
    .object({
      id: z.string().uuid(),
      conversationId: z.string().uuid(),
      conversationType: z.enum(['direct', 'group']).optional(),
      type: z.enum(['audio', 'video']),
      status: z.enum([
        'ringing',
        'ongoing',
        'ended',
        'missed',
        'declined',
        'cancelled',
      ]),
      channelName: z.string(),
      callerId: z.string().uuid(),
      calleeId: z.string().uuid().nullable().optional(),
      appId: z.string(),
      startedAt: z.string().datetime().nullable().optional(),
      endedAt: z.string().datetime().nullable().optional(),
      createdAt: z.string().datetime().optional(),
    })
    .passthrough(),
  token: z.string().describe('Agora RTC token for this user'),
  uid: z.string().describe('Agora UID for this user'),
  appId: z.string().describe('Agora App ID'),
});

export const activeCallResponseSchema = z.object({
  call: z
    .object({
      id: z.string().uuid(),
      status: z.enum(['ringing', 'ongoing']),
    })
    .passthrough()
    .nullable()
    .describe('Active call DTO, or null if none'),
});

export const leaveCallResponseSchema = z.object({
  callId: z.string().uuid(),
  callEnded: z
    .boolean()
    .describe('true if the whole call ended; false if only this member left (group)'),
  status: z
    .string()
    .describe('Call status after leave: ongoing | ended | missed | cancelled | …'),
});

export const declineCallResponseSchema = z.object({
  callId: z.string().uuid(),
  callEnded: z
    .boolean()
    .describe('true for 1:1 decline or when no invitees remain ringing in a group'),
  status: z.string().describe('declined | missed | ringing | ongoing | …'),
});

export const endCallResponseSchema = z.object({
  callId: z.string().uuid(),
  status: z.string().describe('ended | cancelled'),
  reason: z
    .enum(['cancelled', 'rejected', 'missed', 'ended'])
    .describe('cancelled = caller hung up while ringing; otherwise ended'),
});
