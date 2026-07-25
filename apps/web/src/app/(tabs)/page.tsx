import { requireOnboardedSession } from '@/lib/session'
import { getActiveGame, getHomeStats, getLastGames } from '@/lib/queries/home'
import { getPendingInvites } from '@/lib/queries/invites'
import { getAvatarId } from '@/lib/queries/profile'
import { serializeHomePayload } from '@/lib/api-payloads'
import { HomeScreen } from '@/components/home/home-screen'

export default async function HomePage() {
  const { user } = await requireOnboardedSession()
  const [stats, activeGame, lastGames, invites, avatarId] = await Promise.all([
    getHomeStats(user.id),
    getActiveGame(user.id),
    getLastGames(user.id),
    getPendingInvites(user.id),
    getAvatarId(user.id),
  ])

  return (
    <HomeScreen
      username={user.username}
      avatarId={avatarId}
      initialData={serializeHomePayload(stats, activeGame, lastGames)}
      initialInvites={{ invites }}
    />
  )
}
