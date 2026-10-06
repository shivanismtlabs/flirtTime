import { z } from 'zod';

export const dashboardOverviewQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d', 'all']).default('30d'),
  gender: z.enum(['Male', 'Female', 'Other']).optional(),
  contentType: z.enum(['post', 'reel', 'vibe']).optional(),
  verified: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export type DashboardOverviewQuery = z.infer<typeof dashboardOverviewQuerySchema>;
