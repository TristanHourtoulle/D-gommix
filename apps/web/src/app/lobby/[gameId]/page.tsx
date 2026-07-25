import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { TabBar } from '@/components/tab-bar'
import { LobbyScreen } from '@/components/lobby/lobby-screen'
import { RealtimeProviders } from '@/components/lobby/providers'
import { getInvitableFriends, getLobbyAccess } from '@/lib/queries/lobby'
import { requireOnboardedSession } from '@/lib/session'

interface LobbyPageProps {
  params: Promise<{ gameId: string }>
}

export default async function LobbyPage({ params }: LobbyPageProps) {
  const { gameId } = await params
  if (!z.uuid().safeParse(gameId).success) notFound()

  const { user } = await requireOnboardedSession()
  const access = await getLobbyAccess(gameId, user.id)
  if (!access) notFound()
  if (access.status === 'active' && access.isMember) redirect(`/partie/${gameId}`)
  if (access.status !== 'lobby' || !access.isMember) redirect('/jouer')

  const friends = await getInvitableFriends(user.id)

  return (
    <>
      <div className="tabs-content">
        <RealtimeProviders>
          <LobbyScreen gameId={gameId} meId={user.id} friends={friends} />
        </RealtimeProviders>
      </div>
      <TabBar />
    </>
  )
}
