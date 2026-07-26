import { NextResponse } from 'next/server'
import { clientErrorSchema, formatClientErrorLine } from '@/lib/client-error'
import { getSession } from '@/lib/session'

/**
 * Client crash sink: one structured JSON line to stdout per report so browser
 * crashes land in the Railway logs next to the ws-server's error lines.
 * Session-gated (plain session, not onboarded: /onboarding crashes count too).
 * No third-party SDK by design — Sentry is deferred (plans/020).
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }
  const body: unknown = await request.json().catch(() => null)
  const parsed = clientErrorSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REPORT' }, { status: 400 })
  }
  console.error(formatClientErrorLine(session.user.id, parsed.data))
  return NextResponse.json({ ok: true })
}
