import { requireOnboardedSession } from '@/lib/session'
import { getActiveGame, getHomeStats, getLastGames } from '@/lib/queries/home'
import { serializeHomePayload } from '@/lib/api-payloads'
import { HomeScreen } from '@/components/home/home-screen'

export default async function HomePage() {
  const { user } = await requireOnboardedSession()
  const [stats, activeGame, lastGames] = await Promise.all([
    getHomeStats(user.id),
    getActiveGame(user.id),
    getLastGames(user.id),
  ])

  return (
    <HomeScreen
      username={user.username}
      initialData={serializeHomePayload(stats, activeGame, lastGames)}
    />
  )
}
