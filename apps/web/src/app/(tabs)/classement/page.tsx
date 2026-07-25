import { requireOnboardedSession } from '@/lib/session'
import { getLeaderboard } from '@/lib/queries/stats'
import { LeaderboardScreen } from '@/components/stats/leaderboard-screen'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const { user } = await requireOnboardedSession()
  const leaderboard = await getLeaderboard(user.id)

  return <LeaderboardScreen viewerId={user.id} initialData={leaderboard} />
}
