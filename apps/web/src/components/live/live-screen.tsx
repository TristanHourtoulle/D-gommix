'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { activePlayers, validateCommand, type Ack, type EndKind } from '@degommix/game-core'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useGame } from '@/hooks/use-game'
import { useInvalidateTabData } from '@/hooks/use-tab-data'
import { useWakeLock } from '@/hooks/use-wake-lock'
import { ackErrorMessage } from '@/lib/ws-errors'
import { takenByTarget } from '@/lib/rivalries'
import { EndRequestSheet } from './end-request-sheet'
import { shouldInvalidateOnFinish } from './finish-guard'
import { GameClock } from './game-clock'
import { hitByTarget } from './hit-fx'
import { describeEndRequest, HostDecisionModal } from './host-decision-modal'
import { LiveJournal } from './live-journal'
import { PawnField } from './pawn-field'
import { PlayerCard } from './player-card'
import { Summary } from './summary'
import { TapZone } from './tap-zone'
import { displayName, type LivePlayer, type NameMap } from './types'
import { useLiveJournal } from './use-live-journal'
import { useTapLock } from './use-tap-lock'

interface LiveScreenProps {
  gameId: string
  viewerId: string
  /** Host from the DB — overridden live by `game:host_changed`. */
  initialHostId: string
  players: LivePlayer[]
  /** DB timestamps, fallback anchors when the event log is not replayed. */
  fallbackStartedAt: string | null
  fallbackEndedAt: string | null
}

/** Fullscreen live screen of `/partie/[gameId]` — design §5.2 Live + Résumé. */
export function LiveScreen({
  gameId,
  viewerId,
  initialHostId,
  players,
  fallbackStartedAt,
  fallbackEndedAt,
}: LiveScreenProps) {
  const game = useGame(gameId)
  const { state, startedAt, serverOffset, connected } = game
  const { toast } = useToast()
  const [endSheetOpen, setEndSheetOpen] = useState(false)
  const tapLock = useTapLock()
  useWakeLock()

  const names = useMemo<NameMap>(
    () => Object.fromEntries(players.map((p) => [p.userId, p.username])),
    [players]
  )
  const journal = useLiveJournal(gameId, state, names)
  const hostId = game.hostId ?? initialHostId
  const isHost = viewerId === hostId

  // A finished game rewrites the Accueil tiles (wins, dégommages, personnage
  // fétiche), drops the resume banner, adds a history row and reshuffles the
  // circle ranking. Invalidate both payloads once per game so the tabs are
  // exact the moment the player leaves the summary, instead of waiting for the
  // 30 s staleness window.
  const invalidate = useInvalidateTabData()
  const invalidatedGameIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!shouldInvalidateOnFinish(state?.status, gameId, invalidatedGameIdRef.current)) return
    invalidatedGameIdRef.current = gameId
    invalidate('home', 'leaderboard')
  }, [state?.status, gameId, invalidate])

  const run = async (command: Promise<Ack<{ seq: number }>>): Promise<void> => {
    const ack = await command
    if (!ack.ok) toast(ackErrorMessage(ack), 'error')
  }

  /** Anti double-tap: a tap locks that chip until its ack and cooldown. */
  const handleTap = async (targetId: string): Promise<void> => {
    if (!tapLock.begin(targetId)) return
    const ack = await game.degommage(targetId)
    tapLock.settle(targetId, ack.ok)
    if (!ack.ok) toast(ackErrorMessage(ack), 'error')
  }

  if (!state) {
    return (
      <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-4 pt-[env(safe-area-inset-top)]">
        <PawnField />
        <p className="relative z-10 m-0 text-sm font-semibold" style={{ color: 'var(--ink-soft)' }}>
          Synchronisation de la partie…
        </p>
      </main>
    )
  }

  if (state.status === 'finished') {
    return (
      <Summary
        gameId={gameId}
        state={state}
        names={names}
        viewerId={viewerId}
        startedAt={startedAt ?? fallbackStartedAt}
        endedAt={journal.lastEventAt ?? fallbackEndedAt}
      />
    )
  }

  const inGame = activePlayers(state)
  const opponents = inGame.filter((p) => p.userId !== viewerId)
  const me = state.players[viewerId]
  const canAct = me !== undefined && me.inGame
  const canUndo = canAct && validateCommand(state, viewerId, { type: 'undo' }, { isHost }).ok
  const pending = state.pendingEndRequest
  const taken = takenByTarget(state)
  // Append-only per-target hit count: what drives the card animation. Distinct
  // from `taken`, which excludes undone dégommages and would therefore replay
  // the whole animation every time somebody presses « Annuler ».
  const hits = hitByTarget(state.degommageLog)

  const submitEnd = (kind: EndKind, winnerId?: string): void => {
    setEndSheetOpen(false)
    void run(game.requestEnd(kind, winnerId))
  }

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-5 pt-[calc(1.25rem_+_env(safe-area-inset-top))]">
      <PawnField />
      <GameClock
        format={state.format}
        startedAt={startedAt}
        serverOffset={serverOffset}
        connected={connected}
      />

      <div className="relative z-10 grid grid-cols-2 gap-3">
        {state.seats.map((userId) => {
          const player = state.players[userId]
          if (!player) return null
          return (
            <PlayerCard
              key={userId}
              player={player}
              username={displayName(names, userId)}
              isHost={userId === hostId}
              taken={taken[userId] ?? 0}
              hit={hits[userId]}
            />
          )
        })}
      </div>

      {canAct ? (
        <TapZone
          opponents={opponents}
          names={names}
          lockedTargetIds={tapLock.lockedTargetIds}
          pendingTargetIds={tapLock.pendingTargetIds}
          onTap={(targetId) => {
            void handleTap(targetId)
          }}
        />
      ) : null}

      {pending ? (
        <section
          className="card relative z-10 flex flex-col gap-2 p-3"
          style={{ borderColor: 'var(--bronze)' }}
        >
          <p className="m-0 text-xs font-semibold">
            {describeEndRequest(pending, names)} — en attente de la décision de l’hôte.
          </p>
          {pending.requesterId === viewerId ? (
            <Button
              variant="ghost"
              onClick={() => {
                void run(game.withdrawEnd())
              }}
            >
              Retirer la demande
            </Button>
          ) : null}
        </section>
      ) : null}

      <LiveJournal entries={journal.entries} state={state} />

      <div className="live-actions relative z-10 mt-auto flex flex-col gap-2">
        <Button
          variant="ghost"
          disabled={!canUndo}
          onClick={() => {
            void run(game.undo())
          }}
        >
          <Icon name="undo" size={16} />
          Annuler la dernière action
        </Button>
        <Button disabled={!canAct || pending !== null} onClick={() => setEndSheetOpen(true)}>
          <Icon name="flag" size={16} />
          Fin de partie
        </Button>
      </div>

      {endSheetOpen && pending === null ? (
        <EndRequestSheet
          isHost={isHost}
          activePlayers={inGame}
          names={names}
          onSubmit={submitEnd}
          onClose={() => setEndSheetOpen(false)}
        />
      ) : null}

      {pending !== null && isHost && pending.requesterId !== viewerId ? (
        <HostDecisionModal
          request={pending}
          names={names}
          onRespond={(accept) => {
            void run(game.respondEnd(accept))
          }}
        />
      ) : null}
    </main>
  )
}
