import { requireOnboardedSession } from '@/lib/session'
import { getLeaderboard } from '@/lib/queries/stats'
import { getSeasonMeta } from '@/lib/queries/month-champions'
import { getRivalryPairs, getRivalrySpotlight, getSouffreDouleur } from '@/lib/queries/rivalries'
import { getProphets } from '@/lib/queries/oracle'
import { getCircleTitles } from '@/lib/queries/titles'
import { LeaderboardScreen } from '@/components/stats/leaderboard-screen'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const { user } = await requireOnboardedSession()
  const [leaderboard, rivalry, souffreDouleur, rivalryPairs, season, titles, prophets] =
    await Promise.all([
      getLeaderboard(user.id),
      getRivalrySpotlight(user.id),
      getSouffreDouleur(user.id),
      getRivalryPairs(user.id),
      getSeasonMeta(user.id),
      getCircleTitles(user.id),
      getProphets(user.id),
    ])

  return (
    <LeaderboardScreen
      viewerId={user.id}
      initialData={{
        ...leaderboard,
        rivalry,
        souffreDouleur,
        rivalryPairs,
        season,
        titles,
        prophets,
      }}
    />
  )
}
