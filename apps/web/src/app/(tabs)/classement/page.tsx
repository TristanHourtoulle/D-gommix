import { requireOnboardedSession } from '@/lib/session'
import { getLeaderboard } from '@/lib/queries/stats'
import { getSeasonMeta } from '@/lib/queries/month-champions'
import { getRivalryPairs, getRivalrySpotlight, getSouffreDouleur } from '@/lib/queries/rivalries'
import { LeaderboardScreen } from '@/components/stats/leaderboard-screen'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const { user } = await requireOnboardedSession()
  const [leaderboard, rivalry, souffreDouleur, rivalryPairs, season] = await Promise.all([
    getLeaderboard(user.id),
    getRivalrySpotlight(user.id),
    getSouffreDouleur(user.id),
    getRivalryPairs(user.id),
    getSeasonMeta(user.id),
  ])

  return (
    <LeaderboardScreen
      viewerId={user.id}
      initialData={{ ...leaderboard, rivalry, souffreDouleur, rivalryPairs, season }}
    />
  )
}
