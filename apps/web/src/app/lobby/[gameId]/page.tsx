import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { TabBar } from '@/components/tab-bar'
import { LobbyScreen } from '@/components/lobby/lobby-screen'
import { SocketProvider } from '@/components/socket-provider'
import { getInvitableFriends, getLobbyAccess } from '@/lib/queries/lobby'
import { QueryProvider } from '@/lib/query-client'
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
        {/* Socket only: the toaster lives in the root layout, so a toast fired
            on the way in (« Invitation envoyée ! ») survives the landing. */}
        {/* The query provider hands back the same browser-singleton client as
            the tabs (see app/partie/[gameId]/layout.tsx), which is what lets
            the Duel banner read the Classement payload the challenger already
            has in cache. It stays INSIDE .tabs-content so the TabBar below
            keeps rendering outside any QueryClientProvider, unchanged. */}
        <QueryProvider>
          <SocketProvider>
            <LobbyScreen gameId={gameId} meId={user.id} friends={friends} />
          </SocketProvider>
        </QueryProvider>
      </div>
      <TabBar />
    </>
  )
}
