import Link from 'next/link'
import { requireOnboardedSession } from '@/lib/session'
import { getLeaderboard } from '@/lib/queries/stats'
import { SectionTitle } from '@/components/ui/section-title'
import { EmptyState } from '@/components/ui/empty-state'
import { CharacterWinrateBars } from '@/components/stats/character-winrate-bars'
import { RankingTable } from '@/components/stats/ranking-table'
import { TopDegommeurTile } from '@/components/stats/top-degommeur-tile'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const { user } = await requireOnboardedSession()
  const leaderboard = await getLeaderboard(user.id)

  if (leaderboard.friendCount === 0) {
    return (
      <main className="tab-page">
        <SectionTitle sub="Le cercle d'amis au grand complet">Classement</SectionTitle>
        <EmptyState
          icon="trophy"
          title="Pas encore de cercle"
          description="Ajoute des amis pour comparer victoires, winrate et dégommages."
        />
        <Link href="/amis" className="cta text-center no-underline">
          Trouver des amis
        </Link>
      </main>
    )
  }

  return (
    <main className="tab-page">
      <SectionTitle sub="Le cercle d'amis au grand complet">Classement</SectionTitle>

      {leaderboard.topDegommeur ? <TopDegommeurTile top={leaderboard.topDegommeur} /> : null}

      <RankingTable rows={leaderboard.rows} viewerId={user.id} />

      {leaderboard.characterWinrates.length > 0 ? (
        <CharacterWinrateBars winrates={leaderboard.characterWinrates} />
      ) : (
        <p className="m-0 text-center text-sm text-ink-soft">
          Les winrates par personnage apparaîtront après vos premières parties menées au village.
        </p>
      )}
    </main>
  )
}
