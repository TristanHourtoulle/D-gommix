'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { GameState } from '@degommix/game-core'
import { Icon } from '@/components/icons'
import { RematchButton } from '@/components/rematch-button'
import { Button } from '@/components/ui/button'
import { CharacterBadge } from '@/components/ui/character-badge'
import { MomentStamp } from '@/components/ui/moment-stamp'
import { Pill } from '@/components/ui/pill'
import { StatTile } from '@/components/ui/stat-tile'
import type { InvitesPayload } from '@/lib/api-payloads'
import { CHARACTER_META } from '@/lib/characters'
import { formatChrono } from '@/lib/chrono'
import { detectSummaryStamp } from '@/lib/game-stamps'
import { takenByTarget } from '@/lib/rivalries'
import {
  COUNTER_ROLL_MS,
  ENDGAME_TIMINGS,
  VICTORY_LETTERS,
  confettiPieces,
  endgameVariant,
  pickTease,
} from './endgame'
import {
  EndgameConfetti,
  EndgameLaurel,
  EndgamePawn,
  EndgameRays,
  EndgameVeil,
} from './endgame-decor'
import { RematchPrompt } from './rematch-prompt'
import { displayName, type NameMap } from './types'

interface SummaryProps {
  gameId: string
  state: GameState
  names: NameMap
  /** Who is looking — decides which end-of-game variant this phone plays. */
  viewerId: string
  startedAt: string | null
  endedAt: string | null
  /** SSR payload of the `invites` query, handed to the rematch prompt. */
  initialInvites: InvitesPayload
}

const FORMAT_LABELS = { 2: '1v1', 3: '3J', 4: '4J' } as const

/**
 * Inline end-of-game recap (same route, design §5.2 Résumé) plus the validated
 * end-of-game sequence: a winner orchestration and a loser one, chosen with
 * `winnerId === viewerId`, both playing on this very screen. The rest state is
 * the final image, so a tap (or `prefers-reduced-motion`) simply skips to it.
 */
export function Summary({
  gameId,
  state,
  names,
  viewerId,
  startedAt,
  endedAt,
  initialInvites,
}: SummaryProps) {
  const router = useRouter()

  const winner = state.winnerId ? state.players[state.winnerId] : undefined
  // Derived, never stored — the archive recomputes the same verdict from the
  // persisted log (buildSummaryStamp in queries/game-detail-journal.ts).
  const summaryStamp = useMemo(
    () => detectSummaryStamp(new Map(Object.entries(takenByTarget(state))), state.winnerId),
    [state]
  )
  const durationSec =
    startedAt !== null && endedAt !== null
      ? Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000))
      : null
  const totalDegommages = Object.values(state.players).reduce((sum, p) => sum + p.degommages, 0)

  const variant = endgameVariant(state.winnerId, viewerId)
  const timing = variant === 'loser' ? ENDGAME_TIMINGS.loser : ENDGAME_TIMINGS.winner
  const [phase, setPhase] = useState<'playing' | 'done'>(variant === 'none' ? 'done' : 'playing')
  const [shownDegommages, setShownDegommages] = useState(totalDegommages)
  const confetti = useMemo(() => confettiPieces(gameId), [gameId])

  // Auto-finish: the sequence lasts `timing.total`; after that the screen is at
  // rest anyway (every keyframe ends on the final image), so dropping the class
  // is only housekeeping.
  useEffect(() => {
    if (phase !== 'playing') return
    const id = setTimeout(() => setPhase('done'), timing.total)
    return () => clearTimeout(id)
  }, [phase, timing.total])

  // Counter roll 0 → N. The tile already renders the final value, so this only
  // ever *starts* from 0 when motion is allowed; under reduced motion nothing
  // happens and the number is simply correct from the first paint. The media
  // query is read in an effect (post-hydration) so it cannot desync SSR.
  useEffect(() => {
    if (phase !== 'playing') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setShownDegommages(0)
    let frame = 0
    const start = setTimeout(() => {
      const t0 = performance.now()
      const step = (now: number): void => {
        const k = Math.min(1, (now - t0) / COUNTER_ROLL_MS)
        setShownDegommages(Math.round(totalDegommages * (1 - Math.pow(1 - k, 3))))
        if (k < 1) frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
    }, timing.counterAt)
    return () => {
      clearTimeout(start)
      cancelAnimationFrame(frame)
      setShownDegommages(totalDegommages)
    }
  }, [phase, timing.counterAt, totalDegommages])

  const rootClass = [
    'eg-root mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-6 pt-[calc(1.5rem_+_env(safe-area-inset-top))]',
    phase === 'playing' ? `eg-play ${variant}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <main
      className={rootClass}
      onClick={() => setPhase('done')}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') setPhase('done')
      }}
    >
      {variant === 'winner' ? <EndgameRays /> : null}
      {variant === 'loser' ? <EndgameVeil /> : null}
      {variant === 'winner' ? <EndgameConfetti pieces={confetti} /> : null}

      <h1 className="s-title relative">Le banquet</h1>

      {winner ? (
        <section className="card eg-hero relative overflow-hidden p-4">
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
            {summaryStamp ? <MomentStamp stamp={summaryStamp} size="lg" /> : null}
            <CharacterBadge character={winner.character} size="lg" />
            <p className="m-0 text-lg font-extrabold">{displayName(names, winner.userId)}</p>
            <p className="eg-subtitle m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
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

      {variant === 'winner' ? (
        <div className="relative flex flex-col items-center gap-1">
          <EndgameLaurel />
          {/*
            The letters are separated by whitespace-only text runs. They render
            nothing — a flex container does not generate a box for a text run
            made only of white space — but they keep the DOM text from reading
            as the single word « VICTOIRE », which would otherwise collide with
            the « Victoire » pill in every case-insensitive text query.
          */}
          <p className="eg-title m-0" aria-label="Victoire">
            {VICTORY_LETTERS.map((letter, index) => (
              <Fragment key={`${letter}${index}`}>
                {index > 0 ? ' ' : null}
                <span
                  className="l"
                  aria-hidden="true"
                  style={
                    {
                      '--i': index - (VICTORY_LETTERS.length - 1) / 2,
                      '--i0': index,
                    } as CSSProperties
                  }
                >
                  {letter}
                </span>
              </Fragment>
            ))}
          </p>
        </div>
      ) : null}

      {variant === 'loser' ? (
        <div className="relative flex flex-col items-center gap-2">
          <p className="eg-defeat m-0">Défaite…</p>
          <EndgamePawn />
          <p className="eg-tease m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
            {pickTease(gameId)}
          </p>
          {winner ? (
            <p
              className="eg-fairplay card m-0 w-full p-2 text-center text-xs"
              style={{ color: 'var(--ink-soft)', borderColor: 'var(--bronze)' }}
            >
              {displayName(names, winner.userId)} remporte la partie
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="relative flex flex-col gap-2">
        {state.seats.map((userId, index) => {
          const player = state.players[userId]
          if (!player) return null
          const isWinner = userId === state.winnerId
          return (
            <div
              key={userId}
              className="card eg-recap-row flex items-center gap-3 p-3"
              data-testid={`summary-row-${displayName(names, userId)}`}
              style={
                {
                  '--i': index,
                  ...(isWinner ? { borderColor: 'var(--bronze)' } : {}),
                } as CSSProperties
              }
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

      <div className="stat-row relative">
        <span className="eg-tile flex flex-1" style={{ '--i': 0 } as CSSProperties}>
          <StatTile
            icon="timer"
            label="Durée"
            value={durationSec !== null ? formatChrono(durationSec) : '—'}
          />
        </span>
        <span className="eg-tile flex flex-1" style={{ '--i': 1 } as CSSProperties}>
          <StatTile icon="sword" label="Dégommages" value={shownDegommages} />
        </span>
        <span className="eg-tile flex flex-1" style={{ '--i': 2 } as CSSProperties}>
          <StatTile icon="flag" label="Format" value={FORMAT_LABELS[state.format]} />
        </span>
      </div>

      <div className="live-actions relative mt-auto flex flex-col gap-2">
        <RematchPrompt currentGameId={gameId} initialInvites={initialInvites} />
        {variant === 'loser' ? (
          <>
            <span className="eg-action" style={{ '--i': 0 } as CSSProperties}>
              <RematchButton finishedGameId={gameId} variant="primary" />
            </span>
            <span className="eg-action" style={{ '--i': 1 } as CSSProperties}>
              <Button variant="ghost" onClick={() => router.push('/classement')}>
                Voir les lauriers
              </Button>
            </span>
          </>
        ) : (
          <>
            <span className="eg-action" style={{ '--i': 0 } as CSSProperties}>
              <Button onClick={() => router.push('/classement')}>Voir les lauriers</Button>
            </span>
            <span className="eg-action" style={{ '--i': 1 } as CSSProperties}>
              <RematchButton finishedGameId={gameId} variant="ghost" />
            </span>
          </>
        )}
      </div>
    </main>
  )
}
