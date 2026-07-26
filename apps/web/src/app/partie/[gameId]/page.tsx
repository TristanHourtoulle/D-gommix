import { redirect } from 'next/navigation'
import { and, eq, or, gamePlayers, games, user } from '@degommix/db'
import { LiveScreen } from '@/components/live/live-screen'
import type { LivePlayer } from '@/components/live/types'
import { db } from '@/lib/db'
import { getPendingInvites } from '@/lib/queries/invites'
import { requireOnboardedSession } from '@/lib/session'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface PartiePageProps {
  params: Promise<{ gameId: string }>
}

/**
 * Server shell of the live screen: checks membership (seat `joined` or
 * `left`), redirects non-members and unknown games to the home screen, and
 * hands usernames + DB fallbacks to the realtime client component.
 */
export default async function PartiePage({ params }: PartiePageProps) {
  const { user: viewer } = await requireOnboardedSession()
  const { gameId } = await params
  if (!UUID_PATTERN.test(gameId)) redirect('/')

  const [game] = await db.select().from(games).where(eq(games.id, gameId))
  if (!game) redirect('/')
  if (game.status === 'lobby') redirect(`/lobby/${gameId}`)

  const members = await db
    .select({ userId: gamePlayers.userId, username: user.username })
    .from(gamePlayers)
    .innerJoin(user, eq(user.id, gamePlayers.userId))
    .where(
      and(
        eq(gamePlayers.gameId, gameId),
        or(eq(gamePlayers.status, 'joined'), eq(gamePlayers.status, 'left'))
      )
    )
  if (!members.some((member) => member.userId === viewer.id)) redirect('/')

  const players: LivePlayer[] = members.map((member) => ({
    userId: member.userId,
    username: member.username ?? 'Joueur',
  }))

  // Seeds the `invites` query so the rematch prompt's hook paints from server
  // state on reload instead of an empty cache (same seeding as the tabs).
  const invites = await getPendingInvites(viewer.id)

  return (
    <LiveScreen
      gameId={gameId}
      viewerId={viewer.id}
      initialHostId={game.hostId}
      players={players}
      fallbackStartedAt={game.startedAt?.toISOString() ?? null}
      fallbackEndedAt={game.endedAt?.toISOString() ?? null}
      initialInvites={{ invites }}
    />
  )
}
