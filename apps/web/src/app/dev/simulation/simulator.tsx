'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { buildGameState, type GameFormat } from '@degommix/game-core'
import { Icon } from '@/components/icons'
import { AuguresPanel } from '@/components/live/augures-panel'
import { GameClock } from '@/components/live/game-clock'
import { hitByTarget } from '@/components/live/hit-fx'
import { LiveJournal } from '@/components/live/live-journal'
import { OpponentCard } from '@/components/live/opponent-card'
import { PawnField } from '@/components/live/pawn-field'
import { SelfStrip } from '@/components/live/self-strip'
import { Summary } from '@/components/live/summary'
import { displayName, type AvatarMap, type NameMap } from '@/components/live/types'
import {
  decorateJournal,
  foldJournal,
  toStampEvents,
} from '@/components/live/use-live-journal'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { BARDE_FIVE_MINUTES_MS, detectBardeRows } from '@/lib/barde-milestones'
import { QueryProvider } from '@/lib/query-client'
import { takenByTarget } from '@/lib/rivalries'
import { generateTimeline, type SimScenario, type SimSpeed } from './timeline'
import { useTimelinePlayer } from './use-timeline-player'

/** Stable first seed: the very first render must be identical on server and client. */
const DEFAULT_SEED = 'menhir'

const PLAYER_COUNTS: readonly GameFormat[] = [2, 3, 4]

const SCENARIO_LABELS: readonly { readonly value: SimScenario; readonly label: string }[] = [
  { value: 'village', label: 'Village' },
  { value: 'abandon_total', label: 'Abandon' },
  { value: 'remontada', label: 'Remontada' },
]

const SPEED_LABELS: readonly { readonly value: SimSpeed; readonly label: string }[] = [
  { value: 1, label: '×1' },
  { value: 4, label: '×4' },
  { value: 'instant', label: 'Instantané' },
]

interface SegmentedProps<T> {
  label: string
  options: readonly { readonly value: T; readonly label: string }[]
  value: T
  numeric?: boolean
  onChange: (value: T) => void
}

/** Arcade `.segmented` control, same markup as the lobby's format picker. */
function Segmented<T extends string | number>({
  label,
  options,
  value,
  numeric = false,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              if (!selected) onChange(option.value)
            }}
            className={numeric ? 'segment num' : 'segment'}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Fake-game simulator. A seeded generator produces a plausible `GameEvent[]`,
 * and this screen folds it through the **real** `buildGameState` reducer one
 * event at a time, feeding the **real** live components. What you watch is what
 * a table watches, minus the table.
 *
 * Nothing is persisted, by design: no realtime connection, no app mutation, no
 * database row (see `plans/038-simulateur-de-partie.md`). The react-query
 * provider is required because `Summary` mounts `RematchButton`, which calls
 * `useQueryClient()`. The realtime provider is deliberately absent — its context
 * has a non-throwing default and every emitter short-circuits on it, which is
 * what keeps the endgame screen inert.
 */
export function Simulator() {
  const [seed, setSeed] = useState(DEFAULT_SEED)
  const [playerCount, setPlayerCount] = useState<GameFormat>(2)
  const [scenario, setScenario] = useState<SimScenario>('village')
  const [speed, setSpeed] = useState<SimSpeed>(1)
  const [viewerId, setViewerId] = useState('sim-1')
  const [runId, setRunId] = useState(0)

  const timeline = useMemo(
    () => generateTimeline({ seed, playerCount, scenario }),
    [seed, playerCount, scenario]
  )
  const player = useTimelinePlayer(timeline, speed)
  const applied = useMemo(
    () => timeline.events.slice(0, player.cursor),
    [timeline, player.cursor]
  )
  // The REAL reducer, re-folded from scratch on every tick. O(n²) over ≤ 30
  // events is free, and folding the prefix is exactly what a phone does when it
  // replays a state snapshot.
  const state = useMemo(() => buildGameState([...applied]), [applied])
  // Simulated table time: the gap between GAME_STARTED and the last applied
  // event. The panel takes elapsed seconds as a PROP precisely so this screen
  // can hand it the timeline's own clock instead of the wall clock (the gap
  // documented above `<GameClock>`).
  const simulatedElapsedSec = useMemo(() => {
    const last = applied[applied.length - 1]
    if (!last) return 0
    return Math.max(
      0,
      Math.round((Date.parse(last.createdAt) - Date.parse(timeline.startedAt)) / 1000)
    )
  }, [applied, timeline.startedAt])

  const names = useMemo<NameMap>(
    () => Object.fromEntries(timeline.players.map((p) => [p.userId, p.username])),
    [timeline]
  )
  const avatars = useMemo<AvatarMap>(
    () => Object.fromEntries(timeline.players.map((p) => [p.userId, p.avatarId])),
    [timeline]
  )
  const journal = useMemo(
    () => foldJournal(timeline.gameId, [...applied], state, names),
    [timeline.gameId, applied, state, names]
  )
  // How far the SIMULATED game has run: the last applied event's timestamp
  // minus the timeline's fixed base date. Never the wall clock — see below.
  const simulatedElapsedMs = useMemo(() => {
    if (applied.length < 2) return 0
    const last = applied[applied.length - 1]
    if (!last) return 0
    return Math.max(0, Date.parse(last.createdAt) - Date.parse(timeline.startedAt))
  }, [applied, timeline.startedAt])
  const bardeRows = useMemo(
    () =>
      detectBardeRows(
        timeline.gameId,
        toStampEvents([...applied]),
        Date.parse(timeline.startedAt),
        // Simulated elapsed time, NOT the wall clock: the simulator anchors on
        // a fixed past date with `serverOffset={0}` (SIM_BASE_AT), so a real
        // `Date.now()` would fire the five-minute line on the very first
        // event. A generated timeline spans roughly a minute of simulated
        // play, so `cinq_minutes` normally does NOT appear here — the four
        // event-derived milestones do, which is what the bench is for.
        simulatedElapsedMs >= BARDE_FIVE_MINUTES_MS
      ),
    [timeline.gameId, timeline.startedAt, applied, simulatedElapsedMs]
  )
  const rows = useMemo(() => decorateJournal(journal, bardeRows), [journal, bardeRows])

  const viewerOptions = useMemo(
    () => timeline.players.map((p) => ({ value: p.userId, label: p.username })),
    [timeline]
  )
  // A seat that vanished when the table shrank falls back to the host.
  const seatedViewerId = state.players[viewerId] ? viewerId : timeline.hostId

  const taken = takenByTarget(state)
  const hits = hitByTarget(timeline.gameId, state.degommageLog, state.players)
  const me = state.players[seatedViewerId]
  const opponentSeats = state.seats.filter((userId) => userId !== seatedViewerId)

  return (
    <QueryProvider>
      <div className="tab-page">
        <Link
          href="/dev/animations"
          className="sec-label flex items-center gap-1 no-underline"
          style={{ color: 'var(--ink-faint)' }}
        >
          <Icon name="chevron-right" size={12} className="rotate-180" />
          Retour au menu dev
        </Link>

        <header>
          <h1 className="s-title m-0">Simulation de partie</h1>
          <p className="s-sub">
            Une fausse partie jouée par le vrai moteur. Rien n’est enregistré.
          </p>
        </header>

        <Card className="flex flex-col gap-3 p-4">
          <Segmented
            label="Nombre de joueurs"
            options={PLAYER_COUNTS.map((count) => ({ value: count, label: String(count) }))}
            value={playerCount}
            numeric
            onChange={setPlayerCount}
          />
          <Segmented
            label="Scénario"
            options={SCENARIO_LABELS}
            value={scenario}
            onChange={setScenario}
          />
          <Segmented
            label="Point de vue"
            options={viewerOptions}
            value={seatedViewerId}
            onChange={setViewerId}
          />
          <Segmented label="Vitesse" options={SPEED_LABELS} value={speed} onChange={setSpeed} />

          <div className="flex items-center gap-2">
            <input
              className="field-input"
              aria-label="Graine"
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
            />
            <Button
              variant="ghost"
              fullWidth={false}
              size="sm"
              // The ONLY non-deterministic value of the whole feature, and it is
              // user-initiated: the drawn seed lands in the input above, so
              // retyping it replays the identical game. Never move this draw
              // inside the generator — determinism is the point, see
              // `timeline.ts`.
              onClick={() => setSeed(Date.now().toString(36))}
            >
              Nouvelle graine
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              fullWidth={false}
              size="sm"
              onClick={player.isPlaying ? player.pause : player.play}
            >
              {player.isPlaying ? 'Pause' : 'Lecture'}
            </Button>
            <Button variant="ghost" fullWidth={false} size="sm" onClick={player.step}>
              Événement suivant
            </Button>
            <Button variant="ghost" fullWidth={false} size="sm" onClick={player.restart}>
              Recommencer
            </Button>
          </div>

          <p className="helper-text m-0">
            Événement {player.cursor}/{timeline.events.length} · graine « {seed} »
          </p>
        </Card>

        <div className="relative mx-auto flex w-full max-w-md flex-col gap-3">
          <PawnField />
          {/*
            The chrono is anchored to `Date.now()` inside `useChrono`, so at ×1 it
            counts from the timeline's fixed base date instead of the simulated
            elapsed time. Known, accepted gap: making it overridable would mean
            adding a prop to a live hook for a dev tool. The Summary's « Durée »
            tile is correct — it is computed from the startedAt/endedAt props.
          */}
          <GameClock
            format={state.format}
            startedAt={timeline.startedAt}
            serverOffset={0}
            connected
            viewerName={displayName(names, seatedViewerId)}
          />
          {me ? (
            <SelfStrip
              player={me}
              username={displayName(names, seatedViewerId)}
              avatarId={avatars[seatedViewerId] ?? null}
              isHost={seatedViewerId === timeline.hostId}
              taken={taken[seatedViewerId] ?? 0}
              hit={hits[seatedViewerId]}
            />
          ) : null}
          <section
            className="tap-stack relative z-10 flex flex-col gap-3"
            data-count={opponentSeats.length}
          >
            {opponentSeats.map((userId) => {
              const opponent = state.players[userId]
              if (!opponent) return null
              return (
                <OpponentCard
                  key={userId}
                  player={opponent}
                  username={displayName(names, userId)}
                  avatarId={avatars[userId] ?? null}
                  isHost={userId === timeline.hostId}
                  taken={taken[userId] ?? 0}
                  hit={hits[userId]}
                  // The board is a replay: taps belong to the timeline, not to
                  // the finger.
                  canAct={false}
                  isLocked={false}
                  isPending={false}
                  onTap={() => undefined}
                  onLongPress={() => undefined}
                />
              )
            })}
          </section>
          <LiveJournal rows={rows} state={state} />
          <Card className="flex flex-col gap-2">
            <p className="sec-label">Tableau des augures</p>
            <AuguresPanel state={state} elapsedSec={simulatedElapsedSec} names={names} />
          </Card>
        </div>

        {state.status === 'finished' ? (
          <div className="dev-stage">
            <div className="dev-stage-close">
              <Button variant="ghost" fullWidth={false} onClick={() => setRunId((n) => n + 1)}>
                Rejouer la fin
              </Button>
              <Button variant="ghost" fullWidth={false} onClick={player.restart}>
                Recommencer
              </Button>
            </div>
            {/*
              `viewerId` IS the variant switch (`endgameVariant(winnerId, viewerId)`
              in `endgame.ts`), and the `key` is the replay: remounting restarts
              `phase` at 'playing'. Same mechanism as /dev/animations.
            */}
            <Summary
              key={`${timeline.gameId}-${runId}`}
              gameId={timeline.gameId}
              state={state}
              names={names}
              viewerId={seatedViewerId}
              startedAt={timeline.startedAt}
              endedAt={journal.lastEventAt}
              initialInvites={{ invites: [] }}
            />
          </div>
        ) : null}
      </div>
    </QueryProvider>
  )
}
