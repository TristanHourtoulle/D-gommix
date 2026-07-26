import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getLeaderboard } from '@/lib/queries/stats'
import { getRivalryPairs, getRivalrySpotlight } from '@/lib/queries/rivalries'
import { startOfCurrentMonthParis } from '@/lib/season'
import type { LeaderboardPayload } from '@/lib/api-payloads'
import { getOnboardedApiSession } from '@/lib/session'

/** Per-user data: never cacheable by the browser or any intermediary. */
const PRIVATE_HEADERS = { 'cache-control': 'private, no-store' }

const querySchema = z.object({ period: z.enum(['all', 'month']).default('all') })

/**
 * JSON twin of the Classement server component. Onboarded session required;
 * `getLeaderboard` builds the circle from the caller's own friendships, so the
 * ranking stays limited to me + my friends. `?period=month` windows the
 * aggregates on the Paris month start; an invalid `period` falls back to
 * all-time, which is byte-identical to the SSR seed.
 */
export async function GET(request: Request) {
  const session = await getOnboardedApiSession()
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse({ period: searchParams.get('period') ?? undefined })
  const period = parsed.success ? parsed.data.period : 'all'
  const from = period === 'month' ? startOfCurrentMonthParis() : undefined

  const [leaderboard, rivalry, rivalryPairs] = await Promise.all([
    getLeaderboard(session.user.id, { from }),
    getRivalrySpotlight(session.user.id),
    getRivalryPairs(session.user.id),
  ])
  const payload: LeaderboardPayload = { ...leaderboard, rivalry, rivalryPairs }
  return NextResponse.json(payload, { headers: PRIVATE_HEADERS })
}
