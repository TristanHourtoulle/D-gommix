'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameEvent, GameState } from '@degommix/game-core'
import { useSocket } from '@/components/socket-provider'
import type { GameStateSnapshotPayload } from '@/lib/realtime-types'
import { displayName, type NameMap } from './types'

export interface JournalEntry {
  seq: number
  actorId: string | null
  label: string
}

export interface LiveJournal {
  /** The two most recent actions, most recent first. */
  entries: JournalEntry[]
  /** ISO timestamp of the last known event — closing anchor once finished. */
  lastEventAt: string | null
}

const JOURNAL_LENGTH = 2

function requesterOf(events: GameEvent[], requestSeq: number): string | null {
  const request = events.find((e) => e.seq === requestSeq && e.type === 'END_REQUESTED')
  return request?.actorId ?? null
}

function describeEvent(event: GameEvent, events: GameEvent[], names: NameMap): string | null {
  switch (event.type) {
    case 'DEGOMMAGE':
      return `${displayName(names, event.actorId)} a dégommé un pion de ${displayName(names, event.targetId)}`
    case 'UNDO': {
      const undone = events.find((e) => e.seq === event.payload.targetSeq && e.type === 'DEGOMMAGE')
      if (!undone || undone.type !== 'DEGOMMAGE') {
        return `${displayName(names, event.actorId)} a annulé la dernière action`
      }
      return `${displayName(names, event.actorId)} a annulé le dégommage de ${displayName(names, undone.actorId)} sur ${displayName(names, undone.targetId)}`
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
 * Collects the raw `game:event` broadcasts (plus the full history replayed by
 * `game:state_snapshot` on reconnection) to derive the two latest journal
 * lines with their French labels. When no raw event is available (edge case:
 * resync-only refresh), it falls back to the state's non-undone degommages —
 * the only actions the reduced `GameState` can still order.
 */
export function useLiveJournal(
  gameId: string,
  state: GameState | null,
  names: NameMap
): LiveJournal {
  const { socket } = useSocket()
  const eventsRef = useRef<Map<number, GameEvent>>(new Map())
  const [version, setVersion] = useState(0)

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
    const entries: JournalEntry[] = []
    for (const event of events) {
      const label = describeEvent(event, events, names)
      if (label) entries.push({ seq: event.seq, actorId: event.actorId, label })
    }
    if (entries.length === 0 && state) {
      for (const entry of state.degommageLog) {
        if (state.undoneSeqs.has(entry.seq)) continue
        entries.push({
          seq: entry.seq,
          actorId: entry.actorId,
          label: `${displayName(names, entry.actorId)} a dégommé un pion de ${displayName(names, entry.targetId)}`,
        })
      }
    }
    const last = events[events.length - 1]
    return {
      entries: entries.slice(-JOURNAL_LENGTH).reverse(),
      lastEventAt: last?.createdAt ?? null,
    }
  }, [version, state, names])
}
