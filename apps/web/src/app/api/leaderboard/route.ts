import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getLeaderboard, type LeaderboardRange } from '@/lib/queries/stats'
import { getSeasonMeta } from '@/lib/queries/month-champions'
import { getRivalryPairs, getRivalrySpotlight, getSouffreDouleur } from '@/lib/queries/rivalries'
import { getProphets } from '@/lib/queries/oracle'
import { getCircleTitles } from '@/lib/queries/titles'
import { currentParisMonthKey, monthWindowParis, startOfCurrentMonthParis } from '@/lib/season'
import type { LeaderboardPayload } from '@/lib/api-payloads'
import { getOnboardedApiSession } from '@/lib/session'

/** Per-user data: never cacheable by the browser or any intermediary. */
const PRIVATE_HEADERS = { 'cache-control': 'private, no-store' }

const querySchema = z.object({
  period: z.enum(['all', 'month']).default('all'),
  /** Paris month key of an archived month; only honored with period=month. */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
})

/**
 * JSON twin of the Classement server component. Onboarded session required;
 * `getLeaderboard` and `getSeasonMeta` build the circle from the caller's own
 * friendships, so ranking and champions stay limited to me + my friends.
 * `?period=month` windows on the Paris month start; `&month=YYYY-MM` browses
 * a past month as a closed [from, to) window (plan 027). Invalid params fall
 * back to all-time; a current/future `month` clamps to month-to-date. The
 * default response stays byte-identical to the SSR seed.
 */
export async function GET(request: Request) {
  const session = await getOnboardedApiSession()
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse({
    period: searchParams.get('period') ?? undefined,
    month: searchParams.get('month') ?? undefined,
  })
  const period = parsed.success ? parsed.data.period : 'all'
  const month = parsed.success ? parsed.data.month : undefined

  let range: LeaderboardRange = {}
  if (period === 'month') {
    const archived = month !== undefined && month < currentParisMonthKey()
    range = (archived ? monthWindowParis(month) : null) ?? {
      from: startOfCurrentMonthParis(),
    }
  }

  const [leaderboard, rivalry, souffreDouleur, rivalryPairs, season, titles, prophets] =
    await Promise.all([
      getLeaderboard(session.user.id, range),
      getRivalrySpotlight(session.user.id),
      getSouffreDouleur(session.user.id),
      getRivalryPairs(session.user.id),
      getSeasonMeta(session.user.id),
      getCircleTitles(session.user.id),
      getProphets(session.user.id),
    ])
  const payload: LeaderboardPayload = {
    ...leaderboard,
    rivalry,
    souffreDouleur,
    rivalryPairs,
    season,
    titles,
    prophets,
  }
  return NextResponse.json(payload, { headers: PRIVATE_HEADERS })
}
