import { CLIENT_ERROR_LIMITS, type ClientErrorReport } from './client-error'

export const MAX_REPORTS_PER_SESSION = 3

export interface ReportableError {
  message: string
  stack?: string
  digest?: string
}

type PostReport = (body: string) => Promise<unknown>

/**
 * Builds a crash reporter around a POST transport. Fire-and-forget: failures
 * are swallowed (never crash on reporting a crash) and at most
 * MAX_REPORTS_PER_SESSION reports leave one page lifetime (loop guard).
 */
export function createClientErrorReporter(
  post: PostReport
): (error: ReportableError, route: string, userAgent?: string) => void {
  let sent = 0
  return (error, route, userAgent) => {
    if (sent >= MAX_REPORTS_PER_SESSION) return
    sent += 1
    const report: ClientErrorReport = {
      message: (error.message || 'Unknown client error').slice(0, CLIENT_ERROR_LIMITS.message),
      stack: error.stack?.slice(0, CLIENT_ERROR_LIMITS.stack),
      digest: error.digest?.slice(0, CLIENT_ERROR_LIMITS.digest),
      route: route.slice(0, CLIENT_ERROR_LIMITS.route),
      userAgent: userAgent?.slice(0, CLIENT_ERROR_LIMITS.userAgent),
    }
    void post(JSON.stringify(report)).catch(() => {
      /* reporting must never throw */
    })
  }
}

/** Default browser reporter, POSTing to /api/client-error. */
export const reportClientError = createClientErrorReporter((body) =>
  fetch('/api/client-error', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  })
)
