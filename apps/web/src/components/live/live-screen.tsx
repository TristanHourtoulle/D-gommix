'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { activePlayers, validateCommand, type Ack, type EndKind } from '@degommix/game-core'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useGame } from '@/hooks/use-game'
import { useInvalidateTabData } from '@/hooks/use-tab-data'
import { useWakeLock } from '@/hooks/use-wake-lock'
import type { InvitesPayload } from '@/lib/api-payloads'
import { ackErrorMessage } from '@/lib/ws-errors'
import { takenByTarget } from '@/lib/rivalries'
import { EndRequestSheet } from './end-request-sheet'
import { shouldInvalidateOnFinish } from './finish-guard'
import { GameClock } from './game-clock'
import { hitByTarget } from './hit-fx'
import { describeEndRequest, HostDecisionModal } from './host-decision-modal'
import { LiveJournal } from './live-journal'
import { OpponentCard } from './opponent-card'
import { PawnField } from './pawn-field'
import { SelfStrip } from './self-strip'
import { Summary } from './summary'
import { displayName, type AvatarMap, type LivePlayer, type NameMap } from './types'
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
  /** SSR payload of the `invites` query, consumed by the rematch prompt. */
  initialInvites: InvitesPayload
}

/** Fullscreen live screen of `/partie/[gameId]` — design §5.2 Live + Résumé. */
export function LiveScreen({
  gameId,
  viewerId,
  initialHostId,
  players,
  fallbackStartedAt,
  fallbackEndedAt,
  initialInvites,
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
  const avatars = useMemo<AvatarMap>(
    () => Object.fromEntries(players.map((p) => [p.userId, p.avatarId])),
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
    invalidate('home', 'leaderboard', 'invites')
  }, [state?.status, gameId, invalidate])

  // Route-scoped toast anchor: the app toaster is pinned above the tab bar,
  // but `/partie` has no tab bar — its bottom chrome is the undo/fin key row,
  // which the default anchor would cover. Tagging <body> while the live board
  // is on screen lets `.toast-zone` re-anchor above that row (globals.css)
  // without touching the `(tabs)` behavior.
  const liveBoardShown = state ? state.status !== 'finished' : false
  useEffect(() => {
    if (!liveBoardShown) return
    document.body.setAttribute('data-toast-anchor', 'live')
    return () => {
      document.body.removeAttribute('data-toast-anchor')
    }
  }, [liveBoardShown])

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
        initialInvites={initialInvites}
      />
    )
  }

  const inGame = activePlayers(state)
  // Seat order minus the viewer — includes players who left, whose card stays
  // grayed out IN PLACE so the remaining targets never reflow under a finger.
  const opponentSeats = state.seats.filter((userId) => userId !== viewerId)
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
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 px-4 py-5 pt-[calc(1.25rem_+_env(safe-area-inset-top))]">
      <PawnField />
      <GameClock
        format={state.format}
        startedAt={startedAt}
        serverOffset={serverOffset}
        connected={connected}
        viewerName={displayName(names, viewerId)}
      />

      {me ? (
        <SelfStrip
          player={me}
          username={displayName(names, viewerId)}
          avatarId={avatars[viewerId] ?? null}
          isHost={viewerId === hostId}
          taken={taken[viewerId] ?? 0}
          hit={hits[viewerId]}
        />
      ) : null}

      {canAct ? <p className="zone-label relative z-10">Tape le portrait pour dégommer</p> : null}

      <section
        className="tap-stack relative z-10 flex min-h-0 flex-1 flex-col gap-3"
        data-testid="tap-zone"
        data-count={opponentSeats.length}
      >
        {opponentSeats.map((userId) => {
          const player = state.players[userId]
          if (!player) return null
          return (
            <OpponentCard
              key={userId}
              player={player}
              username={displayName(names, userId)}
              avatarId={avatars[userId] ?? null}
              isHost={userId === hostId}
              taken={taken[userId] ?? 0}
              hit={hits[userId]}
              canAct={canAct}
              isLocked={tapLock.lockedTargetIds.includes(userId)}
              isPending={tapLock.pendingTargetIds.includes(userId)}
              onTap={(targetId) => {
                void handleTap(targetId)
              }}
            />
          )
        })}
      </section>

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

      <div className="live-actions relative z-10 mt-auto flex gap-2.5">
        <button
          type="button"
          className="cta ghost live-undo"
          aria-label="Annuler la dernière action"
          disabled={!canUndo}
          onClick={() => {
            void run(game.undo())
          }}
        >
          <Icon name="undo" size={20} />
        </button>
        <button
          type="button"
          className="cta ghost live-end"
          disabled={!canAct || pending !== null}
          onClick={() => setEndSheetOpen(true)}
        >
          <Icon name="flag" size={16} />
          Fin de partie
        </button>
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
