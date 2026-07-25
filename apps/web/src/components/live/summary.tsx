'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import type { GameState } from '@degommix/game-core'
import { Icon } from '@/components/icons'
import { RematchButton } from '@/components/rematch-button'
import { Button } from '@/components/ui/button'
import { CharacterBadge } from '@/components/ui/character-badge'
import { Pill } from '@/components/ui/pill'
import { StatTile } from '@/components/ui/stat-tile'
import { CHARACTER_META } from '@/lib/characters'
import { formatChrono } from '@/lib/chrono'
import { displayName, type NameMap } from './types'

interface SummaryProps {
  gameId: string
  state: GameState
  names: NameMap
  startedAt: string | null
  endedAt: string | null
}

const FORMAT_LABELS = { 2: '1v1', 3: '3J', 4: '4J' } as const

/**
 * Inline end-of-game recap (same route, design §5.2 Résumé): winner header
 * with the character portrait fading in the background — or « Partie
 * abandonnée » — per-player sword tallies, stat tiles and the follow-up CTAs.
 */
export function Summary({ gameId, state, names, startedAt, endedAt }: SummaryProps) {
  const router = useRouter()

  const winner = state.winnerId ? state.players[state.winnerId] : undefined
  const durationSec =
    startedAt !== null && endedAt !== null
      ? Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000))
      : null
  const totalDegommages = Object.values(state.players).reduce((sum, p) => sum + p.degommages, 0)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-6">
      <h1 className="s-title">Résumé de partie</h1>

      {winner ? (
        <section className="card relative overflow-hidden p-4">
          <Image
            src={CHARACTER_META[winner.character].portraitSrc}
            alt=""
            width={240}
            height={240}
            className="pointer-events-none absolute -top-4 -right-6 h-auto w-40"
            style={{ opacity: 0.16, transform: 'rotate(6deg)' }}
          />
          <div className="relative flex flex-col items-start gap-2">
            <Pill variant="win">Victoire</Pill>
            <CharacterBadge character={winner.character} size="lg" />
            <p className="m-0 text-lg font-extrabold">{displayName(names, winner.userId)}</p>
            <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
              {CHARACTER_META[winner.character].label}
              {durationSec !== null ? ` · village atteint en ${formatChrono(durationSec)}` : ''}
            </p>
          </div>
        </section>
      ) : (
        <section className="card flex flex-col items-start gap-2 p-4">
          <Pill variant="wait">Partie abandonnée</Pill>
          <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
            Pas de vainqueur cette fois-ci.
          </p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        {state.seats.map((userId) => {
          const player = state.players[userId]
          if (!player) return null
          const isWinner = userId === state.winnerId
          return (
            <div
              key={userId}
              className="card flex items-center gap-3 p-3"
              data-testid={`summary-row-${displayName(names, userId)}`}
              style={isWinner ? { borderColor: 'var(--bronze)' } : undefined}
            >
              <CharacterBadge character={player.character} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-sm font-bold">{displayName(names, userId)}</p>
                <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
                  {CHARACTER_META[player.character].label}
                  {isWinner ? ' · vainqueur' : ''}
                  {!player.inGame && !isWinner ? ' · a quitté la partie' : ''}
                </p>
              </div>
              <span className="flex items-center gap-1 text-sm font-bold" title="Pions dégommés">
                <Icon name="sword" size={14} />
                {player.degommages}
              </span>
            </div>
          )
        })}
      </section>

      <div className="stat-row">
        <StatTile
          icon="timer"
          label="Durée"
          value={durationSec !== null ? formatChrono(durationSec) : '—'}
        />
        <StatTile icon="sword" label="Dégommages" value={totalDegommages} />
        <StatTile icon="flag" label="Format" value={FORMAT_LABELS[state.format]} />
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <Button onClick={() => router.push('/classement')}>Voir le classement</Button>
        <RematchButton finishedGameId={gameId} variant="ghost" />
      </div>
    </main>
  )
}
