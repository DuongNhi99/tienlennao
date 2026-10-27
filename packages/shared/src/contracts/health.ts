import { z } from 'zod';

export const dependencyStatusSchema = z.enum(['up', 'down']);

export const dependencyCheckSchema = z.object({
  status: dependencyStatusSchema,
  latencyMs: z.number().int().nonnegative(),
});
export type DependencyCheck = z.infer<typeof dependencyCheckSchema>;

/** GET /api/v1/health/live — the process is running. Never touches dependencies. */
export const livenessResponseSchema = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.number().int().nonnegative(),
});
export type LivenessResponse = z.infer<typeof livenessResponseSchema>;

/** GET /api/v1/health/ready — 200 when all dependencies are up, 503 otherwise. */
export const readinessResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.object({
    database: dependencyCheckSchema,
    redis: dependencyCheckSchema,
  }),
});
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
