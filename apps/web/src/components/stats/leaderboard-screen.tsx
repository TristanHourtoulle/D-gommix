'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { LeaderboardPayload } from '@/lib/api-payloads'
import { useLeaderboardData, type LeaderboardPeriod } from '@/hooks/use-tab-data'
import { SectionTitle } from '@/components/ui/section-title'
import { EmptyState } from '@/components/ui/empty-state'
import { CharacterWinrateBars } from './character-winrate-bars'
import { PeriodSegmented } from './period-segmented'
import { Podium } from './podium'
import { RankingTable } from './ranking-table'
import { RecordsCard } from './records-card'
import { RivalryTile } from './rivalry-tile'
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
  const [period, setPeriod] = useState<LeaderboardPeriod>('all')
  const { data } = useLeaderboardData(initialData, period)
  // `keepPreviousData` keeps the previous window during a fetch; the SSR
  // payload is the last-resort fallback and matches the initial 'all' period.
  const leaderboard = data ?? initialData

  if (leaderboard.friendCount === 0) {
    return (
      <main className="tab-page">
        <SectionTitle sub="Toute la tribu, du premier au dernier">Lauriers</SectionTitle>
        <EmptyState
          icon="trophy"
          title="Pas encore de tribu"
          description="Ajoute des amis pour comparer victoires, winrate et dégommages."
        />
        <Link href="/amis" className="cta text-center no-underline">
          Trouver des amis
        </Link>
      </main>
    )
  }

  const podiumRows = leaderboard.rows.slice(0, 3)
  const tableRows = leaderboard.rows.slice(3)

  return (
    <main className="tab-page">
      <SectionTitle sub="Toute la tribu, du premier au dernier">Lauriers</SectionTitle>

      <PeriodSegmented value={period} onChange={setPeriod} />

      {leaderboard.topDegommeur ? <TopDegommeurTile top={leaderboard.topDegommeur} /> : null}

      <RivalryTile rivalry={leaderboard.rivalry} pairs={leaderboard.rivalryPairs} />

      <Podium rows={podiumRows} viewerId={viewerId} />

      {leaderboard.records ? <RecordsCard records={leaderboard.records} /> : null}

      {tableRows.length > 0 ? <RankingTable rows={tableRows} viewerId={viewerId} /> : null}

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
