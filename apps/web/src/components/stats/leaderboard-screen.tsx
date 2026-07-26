'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { LeaderboardPayload } from '@/lib/api-payloads'
import { useLeaderboardData, type LeaderboardPeriod } from '@/hooks/use-tab-data'
import { currentParisMonthKey } from '@/lib/season'
import { SectionTitle } from '@/components/ui/section-title'
import { EmptyState } from '@/components/ui/empty-state'
import { ChampionsStrip } from './champions-strip'
import { CharacterWinrateBars } from './character-winrate-bars'
import { CoteCard } from './cote-card'
import { MonthStepper } from './month-stepper'
import { PeriodSegmented } from './period-segmented'
import { Podium } from './podium'
import { RankingTable } from './ranking-table'
import { RecordsCard } from './records-card'
import { RivalryTile } from './rivalry-tile'
import { SouffreDouleurTile } from './souffre-douleur-tile'
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
  const [monthKey, setMonthKey] = useState<string | null>(null)
  const { data } = useLeaderboardData(initialData, period, monthKey)
  // `keepPreviousData` keeps the previous window during a fetch; the SSR
  // payload is the last-resort fallback and matches the initial 'all' period.
  const leaderboard = data ?? initialData
  const season = leaderboard.season ?? initialData.season

  const selectPeriod = (next: LeaderboardPeriod): void => {
    setPeriod(next)
    setMonthKey(null)
  }

  const browseMonth = (key: string): void => {
    setPeriod('month')
    setMonthKey(key === currentParisMonthKey() ? null : key)
  }

  // Archived months only (plan 027 decision 5): the month-to-date view keeps
  // plan 019's zeroed rows; an archive month nobody played renders an empty
  // state instead of a podium of zeros.
  const monthIsEmpty =
    monthKey !== null &&
    leaderboard.rows.every(
      (row) => row.wins === 0 && row.villageGames === 0 && row.degommages === 0
    )

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

      <PeriodSegmented value={period} onChange={selectPeriod} />

      {period === 'month' ? (
        <MonthStepper
          monthKey={monthKey}
          earliestMonth={season?.earliestMonth ?? null}
          onChange={setMonthKey}
        />
      ) : null}

      {season !== undefined && season.pastChampions.length > 0 ? (
        <ChampionsStrip
          champions={season.pastChampions}
          activeMonth={monthKey}
          onSelect={browseMonth}
        />
      ) : null}

      {monthIsEmpty ? (
        <EmptyState
          icon="trophy"
          title="Aucune partie ce mois-là"
          description="Personne du village n'a terminé de partie sur ce mois."
        />
      ) : (
        <>
          {leaderboard.topDegommeur ? <TopDegommeurTile top={leaderboard.topDegommeur} /> : null}

          <SouffreDouleurTile peer={leaderboard.souffreDouleur ?? null} />

          <RivalryTile rivalry={leaderboard.rivalry} pairs={leaderboard.rivalryPairs} />

          <Podium rows={podiumRows} viewerId={viewerId} titles={leaderboard.titles} />

          {leaderboard.records ? <RecordsCard records={leaderboard.records} /> : null}

          {tableRows.length > 0 ? <RankingTable rows={tableRows} viewerId={viewerId} /> : null}

          {leaderboard.cotes ? (
            <CoteCard cotes={leaderboard.cotes} rows={leaderboard.rows} viewerId={viewerId} />
          ) : null}

          {leaderboard.characterWinrates.length > 0 ? (
            <CharacterWinrateBars winrates={leaderboard.characterWinrates} />
          ) : (
            <p className="m-0 text-center text-sm text-ink-soft">
              Les winrates par personnage apparaîtront après vos premières parties menées au
              village.
            </p>
          )}
        </>
      )}

      <div className="flex items-center justify-between">
        <p className="sec-label">L’Almanach</p>
        <Link
          href="/almanach"
          data-testid="almanach-link"
          className="text-xs font-semibold text-bronze underline underline-offset-2"
        >
          Tout voir
        </Link>
      </div>
    </main>
  )
}
