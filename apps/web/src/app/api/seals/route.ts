import { NextResponse } from 'next/server'
import { getSealsEarnedIn } from '@/lib/queries/seals'
import type { SealsPayload } from '@/lib/api-payloads'
import { getOnboardedApiSession } from '@/lib/session'

/** Per-user data: never cacheable by the browser or any intermediary. */
const PRIVATE_HEADERS = { 'cache-control': 'private, no-store' }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Seals the CALLER first earned in a given game — what the Banquet announces
 * (plan 033). The query is always keyed by `session.user.id`: `gameId` only
 * narrows the result, it never selects whose seals are returned, so there is
 * nothing to authorize beyond the session and nothing to leak across users.
 */
export async function GET(request: Request) {
  const session = await getOnboardedApiSession()
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const gameId = new URL(request.url).searchParams.get('gameId')
  if (gameId === null || !UUID_PATTERN.test(gameId)) {
    return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 })
  }

  const seals = await getSealsEarnedIn(session.user.id, gameId)
  return NextResponse.json({ seals } satisfies SealsPayload, { headers: PRIVATE_HEADERS })
}
