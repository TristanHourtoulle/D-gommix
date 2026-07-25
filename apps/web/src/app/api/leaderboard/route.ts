import { NextResponse } from 'next/server'
import { getLeaderboard } from '@/lib/queries/stats'
import { getRivalrySpotlight } from '@/lib/queries/rivalries'
import type { LeaderboardPayload } from '@/lib/api-payloads'
import { getOnboardedApiSession } from '@/lib/session'

/** Per-user data: never cacheable by the browser or any intermediary. */
const PRIVATE_HEADERS = { 'cache-control': 'private, no-store' }

/**
 * JSON twin of the Classement server component. Onboarded session required;
 * `getLeaderboard` builds the circle from the caller's own friendships, so the
 * ranking stays limited to me + my friends.
 */
export async function GET() {
  const session = await getOnboardedApiSession()
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const [leaderboard, rivalry] = await Promise.all([
    getLeaderboard(session.user.id),
    getRivalrySpotlight(session.user.id),
  ])
  const payload: LeaderboardPayload = { ...leaderboard, rivalry }
  return NextResponse.json(payload, { headers: PRIVATE_HEADERS })
}
