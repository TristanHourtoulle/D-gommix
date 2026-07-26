import { NextResponse } from 'next/server'
import { and, eq, sql, gamePlayers } from '@degommix/db'
import { db } from '@/lib/db'
import { getRevealedOraclePicks } from '@/lib/queries/oracle'
import type { OraclePayload } from '@/lib/api-payloads'
import { getOnboardedApiSession } from '@/lib/session'

/** Per-user data: never cacheable by the browser or any intermediary. */
const PRIVATE_HEADERS = { 'cache-control': 'private, no-store' }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * « L'Oracle du village » (plan 040): every prediction made in one game, as the
 * Banquet reveals them.
 *
 * Two gates, and both must stay:
 *
 * 1. SECRECY — the finished-game check lives in `getRevealedOraclePicks`, not
 *    here, so no future caller can forget it. Before a game ends this route
 *    answers `{ picks: [] }` to everybody, the players themselves included.
 * 2. PARTICIPATION — unlike `/api/seals` (keyed by the caller's own id and so
 *    self-authorizing) this endpoint returns OTHER people's data. Predictions
 *    are table talk, not public record, so the caller must hold a
 *    `joined`/`left` seat in that game.
 *
 * Scoring is deliberately absent from the response: the Banquet already holds
 * the finished GameState and derives it locally with `scoreOraclePicks`.
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

  const [seat] = await db
    .select({ status: gamePlayers.status })
    .from(gamePlayers)
    .where(
      and(
        eq(gamePlayers.gameId, gameId),
        eq(gamePlayers.userId, session.user.id),
        sql`${gamePlayers.status} in ('joined', 'left')`
      )
    )
  if (!seat) {
    return NextResponse.json({ picks: [] } satisfies OraclePayload, { headers: PRIVATE_HEADERS })
  }

  const picks = await getRevealedOraclePicks(gameId)
  return NextResponse.json({ picks } satisfies OraclePayload, { headers: PRIVATE_HEADERS })
}
