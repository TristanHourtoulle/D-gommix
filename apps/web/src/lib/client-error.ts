import { z } from 'zod'

/** Wire limits — the client truncates before sending, the server enforces. */
export const CLIENT_ERROR_LIMITS = {
  message: 500,
  stack: 4000,
  route: 200,
  userAgent: 300,
  digest: 100,
} as const

export const clientErrorSchema = z.object({
  message: z.string().min(1).max(CLIENT_ERROR_LIMITS.message),
  stack: z.string().max(CLIENT_ERROR_LIMITS.stack).optional(),
  digest: z.string().max(CLIENT_ERROR_LIMITS.digest).optional(),
  route: z.string().min(1).max(CLIENT_ERROR_LIMITS.route),
  userAgent: z.string().max(CLIENT_ERROR_LIMITS.userAgent).optional(),
})

export type ClientErrorReport = z.infer<typeof clientErrorSchema>

/**
 * One structured JSON line per crash, matching the ws-server convention
 * ({level, scope, userId, error} — see apps/ws-server/src/server.ts:215) so a
 * single Railway log query covers server and client errors.
 */
export function formatClientErrorLine(userId: string, report: ClientErrorReport): string {
  return JSON.stringify({
    level: 'error',
    scope: 'client',
    userId,
    route: report.route,
    digest: report.digest,
    userAgent: report.userAgent,
    error: report.stack ? `${report.message}\n${report.stack}` : report.message,
  })
}
