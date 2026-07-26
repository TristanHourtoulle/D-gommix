import { requireOnboardedSession } from '@/lib/session'
import { getLeaderboard } from '@/lib/queries/stats'
import { getRivalryPairs, getRivalrySpotlight } from '@/lib/queries/rivalries'
import { LeaderboardScreen } from '@/components/stats/leaderboard-screen'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const { user } = await requireOnboardedSession()
  const [leaderboard, rivalry, rivalryPairs] = await Promise.all([
    getLeaderboard(user.id),
    getRivalrySpotlight(user.id),
    getRivalryPairs(user.id),
  ])

  return (
    <LeaderboardScreen viewerId={user.id} initialData={{ ...leaderboard, rivalry, rivalryPairs }} />
  )
}
