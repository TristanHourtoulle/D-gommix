import { notFound, redirect } from 'next/navigation'
import { GazetteParchment } from '@/components/stats/gazette-parchment'
import { buildGazette } from '@/lib/gazette/render'
import { getTitleHolder } from '@/lib/queries/gazette'
import { getGameDetail } from '@/lib/queries/stats'
import { requireOnboardedSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface GazettePageProps {
  params: Promise<{ gameId: string }>
}

/**
 * « La Gazette du Village » for one finished game. Same guards as the detail
 * page: `getGameDetail` returning non-null IS the authorization check (it walls
 * anybody who is neither a participant nor a friend of one), so there is no
 * second gate here and this one must never be weakened.
 */
export default async function GazettePage({ params }: GazettePageProps) {
  const { gameId } = await params
  if (!UUID_PATTERN.test(gameId)) notFound()

  const { user } = await requireOnboardedSession()
  const detail = await getGameDetail(gameId, user.id)
  if (!detail || detail.status === 'lobby') notFound()
  if (detail.status === 'active') redirect(`/partie/${gameId}`)

  // Participant-scoped and bounded to games that ended before this one: two
  // players at the same table must read the same parchment, and a past game's
  // gazette must never rewrite itself when somebody plays a new game.
  const titleHolder = await getTitleHolder(detail.players, detail.endedAt)
  // Plan 030's moment stamps do not exist yet; the stamps brief family and any
  // stamp-bearing template degrade out on their own until they do.
  const facts = { ...detail.gazetteFacts, titleHolder, stamps: [] }
  const gazette = buildGazette(detail.id, facts)

  return (
    <main className="tab-page">
      <GazetteParchment
        gameId={detail.id}
        gazette={gazette}
        facts={facts}
        players={detail.players}
      />
    </main>
  )
}
