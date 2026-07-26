import { requireOnboardedSession } from '@/lib/session'
import { getPendingInvites } from '@/lib/queries/invites'
import { getFriendsPageData } from '@/lib/queries/friends'
import { PlayScreen } from '@/components/lobby/play-screen'

export default async function PlayPage() {
  const { user } = await requireOnboardedSession()
  const [invites, friendsData] = await Promise.all([
    getPendingInvites(user.id),
    getFriendsPageData(user.id),
  ])

  return <PlayScreen initialInvites={{ invites }} initialFriends={friendsData} />
}
