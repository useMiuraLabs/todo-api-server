import { z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  TODO_NOT_FOUND: 'TODO_NOT_FOUND',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const errorCodeValues = Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]];

export const ErrorResponseSchema = z
  .object({
    error: z.object({
      code: z.enum(errorCodeValues).openapi({ example: ErrorCode.VALIDATION_ERROR }),
      message: z.string(),
      details: z.unknown().nullable().optional(),
    }),
  })
  .openapi('ErrorResponse');

export function errorResponse(
  c: Context,
  status: ContentfulStatusCode,
  code: ErrorCode,
  message: string,
  details?: unknown,
) {
  return c.json({ error: { code, message, details } }, status);
}
