import { requireOnboardedSession } from '@/lib/session'
import { getLastGames } from '@/lib/queries/home'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionTitle } from '@/components/ui/section-title'
import { GameHistoryItem } from '@/components/home/game-history-item'

export const dynamic = 'force-dynamic'

/** v1 cap of the full-history list — enough for playtests, no pagination yet. */
const FULL_HISTORY_LIMIT = 100

/**
 * Full history of the viewer's played games, newest first. Reached from the
 * « Tout voir » link of the home teaser; like its /parties/[gameId] sibling it
 * is not a tab-bar destination, so a plain force-dynamic server render (no
 * TanStack cache) keeps it consistent with the neighbors.
 */
export default async function GamesHistoryPage() {
  const { user } = await requireOnboardedSession()
  const games = await getLastGames(user.id, FULL_HISTORY_LIMIT)

  return (
    <main className="tab-page">
      <SectionTitle sub="Toutes tes parties jouées">Historique</SectionTitle>
      {games.length === 0 ? (
        <EmptyState icon="flag" title="Aucune partie" description="Lance ta première partie !" />
      ) : (
        <div className="flex flex-col gap-2">
          {games.map((game) => (
            <GameHistoryItem key={game.id} game={game} />
          ))}
        </div>
      )}
    </main>
  )
}
