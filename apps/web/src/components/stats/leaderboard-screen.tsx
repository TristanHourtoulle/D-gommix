'use client'

import Link from 'next/link'
import type { LeaderboardPayload } from '@/lib/api-payloads'
import { useLeaderboardData } from '@/hooks/use-tab-data'
import { SectionTitle } from '@/components/ui/section-title'
import { EmptyState } from '@/components/ui/empty-state'
import { CharacterWinrateBars } from './character-winrate-bars'
import { RankingTable } from './ranking-table'
import { TopDegommeurTile } from './top-degommeur-tile'

interface LeaderboardScreenProps {
  viewerId: string
  /** SSR payload, so the first paint needs no client round-trip. */
  initialData: LeaderboardPayload
}

/**
 * Client shell of the Classement screen. The ranking lives in the
 * `leaderboard` query, invalidated whenever the friends circle changes.
 */
export function LeaderboardScreen({ viewerId, initialData }: LeaderboardScreenProps) {
  const { data: leaderboard } = useLeaderboardData(initialData)

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

      <RankingTable rows={leaderboard.rows} viewerId={viewerId} />

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
