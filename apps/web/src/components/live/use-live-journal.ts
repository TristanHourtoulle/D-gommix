'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameEvent, GameState } from '@degommix/game-core'
import { useSocket } from '@/components/socket-provider'
import {
  bardeTimeReached,
  bardeTimeRemainingMs,
  detectBardeRows,
  type BardeRow,
} from '@/lib/barde-milestones'
import { renderDegommageJournal, type DegommageRef } from '@/lib/degommage-messages'
import { deName } from '@/lib/elision'
import { detectLineStamps, type StampEvent, type StampId } from '@/lib/game-stamps'
import type { GameStateSnapshotPayload } from '@/lib/realtime-types'
import { displayName, type NameMap } from './types'

export interface JournalEntry {
  seq: number
  actorId: string | null
  label: string
  /** Highlight stamped on this line, `null` on an ordinary one. */
  stamp: StampId | null
}

export interface LiveJournal {
  /** The two most recent actions, most recent first. */
  entries: JournalEntry[]
  /** ISO timestamp of the last known event — closing anchor once finished. */
  lastEventAt: string | null
}

const JOURNAL_LENGTH = 2

/**
 * The `StampEvent` rows both detectors of this screen consume
 * (`lib/game-stamps.ts`, `lib/barde-milestones.ts`). Exported so the hook and
 * the dev simulator feed them the identical mapping instead of restating it.
 */
export function toStampEvents(events: readonly GameEvent[]): StampEvent[] {
  return events.map((event) => ({
    seq: event.seq,
    type: event.type,
    actorId: event.actorId,
    targetId: event.targetId,
    payload: event.payload,
    at: Date.parse(event.createdAt),
  }))
}

function requesterOf(events: GameEvent[], requestSeq: number): string | null {
  const request = events.find((e) => e.seq === requestSeq && e.type === 'END_REQUESTED')
  return request?.actorId ?? null
}

function describeEvent(
  event: GameEvent,
  events: GameEvent[],
  names: NameMap,
  degommageLabels: Map<number, string>
): string | null {
  switch (event.type) {
    case 'DEGOMMAGE':
      return (
        degommageLabels.get(event.seq) ??
        `${displayName(names, event.actorId)} a dégommé un pion ${deName(displayName(names, event.targetId))}`
      )
    case 'UNDO': {
      const undone = events.find((e) => e.seq === event.payload.targetSeq && e.type === 'DEGOMMAGE')
      if (!undone || undone.type !== 'DEGOMMAGE') {
        return `${displayName(names, event.actorId)} a annulé la dernière action`
      }
      return `${displayName(names, event.actorId)} a annulé le dégommage ${deName(displayName(names, undone.actorId))} sur ${displayName(names, undone.targetId)}`
    }
    case 'PLAYER_QUIT':
      return `${displayName(names, event.actorId)} a quitté la partie`
    case 'END_REQUESTED': {
      const requester = displayName(names, event.actorId)
      if (event.payload.kind === 'village') {
        const winner = event.targetId ? displayName(names, event.targetId) : '?'
        return `${requester} demande la fin (village : ${winner})`
      }
      if (event.payload.kind === 'abandon_individual') return `${requester} demande à abandonner`
      return `${requester} demande d’arrêter la partie`
    }
    case 'END_REJECTED': {
      const actor = displayName(names, event.actorId)
      const requesterId = requesterOf(events, event.payload.requestSeq)
      return requesterId === event.actorId
        ? `${actor} a retiré sa demande de fin`
        : `${actor} a rejeté la demande de fin`
    }
    case 'GAME_STARTED':
    case 'END_VALIDATED':
    case 'GAME_AUTO_CLOSED':
      return null
  }
}

/**
 * Pure fold behind {@link useLiveJournal}: the two latest journal lines of a
 * game, derived from its ordered raw events plus — as a fallback for the
 * resync-only case — the reduced state. Exported so a non-socket caller (the
 * dev simulator, `plans/038-simulateur-de-partie.md`) renders the exact same
 * French sentences as the live screen instead of restating `describeEvent`.
 *
 * `events` must be sorted by `seq`.
 */
export function foldJournal(
  gameId: string,
  events: GameEvent[],
  state: GameState | null,
  names: NameMap
): LiveJournal {
  const eventRefs: DegommageRef[] = []
  for (const event of events) {
    if (event.type === 'DEGOMMAGE') {
      eventRefs.push({ seq: event.seq, actorId: event.actorId, targetId: event.targetId })
    }
  }
  const fallbackRefs: DegommageRef[] = state ? state.degommageLog : []
  const degommageLabels = renderDegommageJournal(
    gameId,
    eventRefs.length > 0 ? eventRefs : fallbackRefs,
    (userId) => displayName(names, userId)
  )
  const stamps = detectLineStamps(toStampEvents(events))
  const entries: JournalEntry[] = []
  for (const event of events) {
    const label = describeEvent(event, events, names, degommageLabels)
    if (label)
      entries.push({
        seq: event.seq,
        actorId: event.actorId,
        label,
        stamp: stamps.get(event.seq) ?? null,
      })
  }
  if (entries.length === 0 && state) {
    for (const entry of state.degommageLog) {
      if (state.undoneSeqs.has(entry.seq)) continue
      entries.push({
        seq: entry.seq,
        actorId: entry.actorId,
        label:
          degommageLabels.get(entry.seq) ??
          `${displayName(names, entry.actorId)} a dégommé un pion ${deName(displayName(names, entry.targetId))}`,
        // No stamp on this path: `DegommageEntry` carries no timestamp and
        // the reduced state holds no UNDO rows, so nothing can be derived.
        stamp: null,
      })
    }
  }
  const last = events[events.length - 1]
  return {
    entries: entries.slice(-JOURNAL_LENGTH).reverse(),
    lastEventAt: last?.createdAt ?? null,
  }
}

export type JournalRow =
  | { readonly kind: 'action'; readonly sortKey: number; readonly entry: JournalEntry }
  | { readonly kind: 'barde'; readonly sortKey: number; readonly row: BardeRow }

/**
 * The journal as rendered: the pure record of {@link foldJournal} with the
 * barde's ambient lines interleaved, most recent first, still exactly
 * `JOURNAL_LENGTH` rows.
 *
 * A barde row anchored on `seq` sorts at `seq + 0.5`, i.e. immediately after
 * the action it comments. Merging with the ALREADY-SLICED pair is exact, not
 * an approximation: the two highest-sorting actions of the whole game are A1
 * and A2, so any barde row sorting below A2 is outranked by both and could
 * never have made the top two of a full merge. Slicing first is therefore
 * equivalent to merging first — and it keeps this function independent of how
 * many entries `foldJournal` chose to keep.
 *
 * Decision 5 of plan 044: the journal does NOT grow a third row. It sits above
 * the tap zone (`live-screen.tsx`, `min-h-0 flex-1`), and a journal that grows
 * shrinks the opponent cards under a finger — the reflow class that plan 007
 * and the « Tape le portrait » redesign removed.
 */
export function decorateJournal(
  journal: LiveJournal,
  barde: readonly BardeRow[]
): JournalRow[] {
  const rows: JournalRow[] = journal.entries.map((entry) => ({
    kind: 'action',
    sortKey: entry.seq,
    entry,
  }))
  for (const row of barde) {
    rows.push({ kind: 'barde', sortKey: row.anchorSeq + 0.5, row })
  }
  return rows.sort((a, b) => b.sortKey - a.sortKey).slice(0, JOURNAL_LENGTH)
}

/** What the live screen renders: the record plus its decorated rows. */
export interface LiveJournalView extends LiveJournal {
  readonly rows: JournalRow[]
}

/** Server-anchored chrono inputs, straight from `useGame`. */
export interface JournalChrono {
  readonly startedAt: string | null
  readonly serverOffsetMs: number
}

/**
 * Collects the raw `game:event` broadcasts (plus the full history replayed by
 * `game:state_snapshot` on reconnection) to derive the two latest journal
 * lines with their French labels. When no raw event is available (edge case:
 * resync-only refresh), it falls back to the state's non-undone degommages —
 * the only actions the reduced `GameState` can still order.
 *
 * On top of that pure record it layers the barde's ambient lines
 * (`lib/barde-milestones.ts`) — ephemeral decoration, never persisted and
 * never sent. The state fallback path yields no barde row for the same reason
 * it yields no stamp: with no raw `StampEvent[]`, nothing can be derived.
 */
export function useLiveJournal(
  gameId: string,
  state: GameState | null,
  names: NameMap,
  chrono: JournalChrono
): LiveJournalView {
  const { socket } = useSocket()
  const eventsRef = useRef<Map<number, GameEvent>>(new Map())
  const [version, setVersion] = useState(0)
  const startedAtMs = chrono.startedAt === null ? null : Date.parse(chrono.startedAt)
  // Starts false on every render path, including the server's: the five-minute
  // line only ever appears through the effect below, so the first client render
  // always matches the markup React hydrated.
  const [timeReached, setTimeReached] = useState(false)

  useEffect(() => {
    if (startedAtMs === null || Number.isNaN(startedAtMs)) return
    if (bardeTimeReached(startedAtMs, chrono.serverOffsetMs)) {
      setTimeReached(true)
      return
    }
    // ONE timeout, never a poll: a 1 Hz interval would re-render the whole live
    // board every second for the length of the game to deliver a single line.
    // The effect re-runs on every resync (the offset changes), which re-aims
    // the timeout on the freshest offset.
    const id = setTimeout(
      () => setTimeReached(true),
      bardeTimeRemainingMs(startedAtMs, chrono.serverOffsetMs)
    )
    return () => {
      clearTimeout(id)
    }
  }, [startedAtMs, chrono.serverOffsetMs])

  useEffect(() => {
    if (!socket) return
    const record = (event: GameEvent): void => {
      if (eventsRef.current.has(event.seq)) return
      eventsRef.current.set(event.seq, event)
      setVersion((v) => v + 1)
    }
    const onSnapshot = (payload: GameStateSnapshotPayload): void => {
      if (payload.gameId !== gameId) return
      for (const event of payload.events) record(event)
    }
    socket.on('game:event', record)
    socket.on('game:state_snapshot', onSnapshot)
    return () => {
      socket.off('game:event', record)
      socket.off('game:state_snapshot', onSnapshot)
    }
  }, [socket, gameId])

  return useMemo(() => {
    void version
    const events = [...eventsRef.current.values()].sort((a, b) => a.seq - b.seq)
    const journal = foldJournal(gameId, events, state, names)
    const barde = detectBardeRows(gameId, toStampEvents(events), startedAtMs, timeReached)
    return { ...journal, rows: decorateJournal(journal, barde) }
  }, [version, state, names, gameId, startedAtMs, timeReached])
}
