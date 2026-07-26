import { NextResponse } from 'next/server'
import { getActiveGame, getHomeStats, getLastGames } from '@/lib/queries/home'
import { getViewerRank } from '@/lib/queries/stats'
import { serializeHomePayload, type HomePayload } from '@/lib/api-payloads'
import { getOnboardedApiSession } from '@/lib/session'

/** Per-user data: never cacheable by the browser or any intermediary. */
const PRIVATE_HEADERS = { 'cache-control': 'private, no-store' }

/**
 * JSON twin of the Accueil server component. Same authorization as the page
 * (onboarded session required) and same scope: every query is keyed by the
 * caller's own id, so there is nothing to leak across users.
 */
export async function GET() {
  const session = await getOnboardedApiSession()
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const [stats, activeGame, lastGames, viewerRank] = await Promise.all([
    getHomeStats(session.user.id),
    getActiveGame(session.user.id),
    getLastGames(session.user.id),
    getViewerRank(session.user.id),
  ])

  const payload: HomePayload = serializeHomePayload(stats, activeGame, lastGames, viewerRank)
  return NextResponse.json(payload, { headers: PRIVATE_HEADERS })
}
