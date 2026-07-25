'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Ack, Command, EndKind, GameState } from '@degommix/game-core'
import { useSocket } from '@/components/socket-provider'
import { GameEventStream } from '@/lib/game-stream'
import { emitWithAck, sendGameCommand, timeoutAck } from '@/lib/socket'
import type { GameStateSnapshotPayload } from '@/lib/realtime-types'

type CommandAck = Ack<{ seq: number }>

export interface UseGameResult {
  /** Reduced game state built from confirmed `game:event` broadcasts. */
  state: GameState | null
  /** Current host (from the resync snapshot and `game:host_changed`). */
  hostId: string | null
  /** ISO timestamp of GAME_STARTED — anchor for the chrono. */
  startedAt: string | null
  /** `serverNow - Date.now()` measured at the last resync/snapshot. */
  serverOffset: number
  connected: boolean
  /** Sends a raw command with a fresh `clientEventId` and the retry policy. */
  sendCommand: (command: Command) => Promise<CommandAck>
  degommage: (targetId: string) => Promise<CommandAck>
  undo: () => Promise<CommandAck>
  requestEnd: (kind: EndKind, winnerId?: string) => Promise<CommandAck>
  respondEnd: (accept: boolean) => Promise<CommandAck>
  withdrawEnd: () => Promise<CommandAck>
}

/**
 * Live game state for `/partie/[gameId]`: applies confirmed events through
 * the shared reducer, resyncs on (re)connection and on seq gaps (design §4.5)
 * and exposes the typed command helpers.
 */
export function useGame(gameId: string): UseGameResult {
  const { socket, connected } = useSocket()
  const [state, setState] = useState<GameState | null>(null)
  const [hostId, setHostId] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const [serverOffset, setServerOffset] = useState(0)

  useEffect(() => {
    if (!socket) return
    let disposed = false
    let resyncing = false

    const stream = new GameEventStream({
      onChange: (next) => {
        if (disposed) return
        setState(next)
        setStartedAt(stream.startedAt)
      },
      onGapDetected: () => {
        void resync()
      },
    })

    const resync = async (): Promise<void> => {
      if (resyncing || disposed) return
      resyncing = true
      try {
        const ack = await emitWithAck(socket, 'game:resync', { gameId, lastSeq: stream.lastSeq })
        if (disposed || !ack.ok) return
        setServerOffset(ack.serverNow - Date.now())
        stream.ingestBatch(ack.events)
      } finally {
        resyncing = false
      }
    }

    const onGameEvent = stream.ingest.bind(stream)
    const onSnapshot = (payload: GameStateSnapshotPayload): void => {
      if (payload.gameId !== gameId) return
      setHostId(payload.hostId)
      setServerOffset(payload.serverNow - Date.now())
      stream.ingestBatch(payload.events)
    }
    const onHostChanged = ({ newHostId }: { newHostId: string }): void => {
      setHostId(newHostId)
    }
    const onConnect = (): void => {
      void resync()
    }

    socket.on('game:event', onGameEvent)
    socket.on('game:state_snapshot', onSnapshot)
    socket.on('game:host_changed', onHostChanged)
    socket.on('connect', onConnect)
    if (socket.connected) void resync()

    return () => {
      disposed = true
      socket.off('game:event', onGameEvent)
      socket.off('game:state_snapshot', onSnapshot)
      socket.off('game:host_changed', onHostChanged)
      socket.off('connect', onConnect)
    }
  }, [socket, gameId])

  const sendCommand = useCallback(
    (command: Command): Promise<CommandAck> => {
      if (!socket) return Promise.resolve(timeoutAck())
      return sendGameCommand(socket, gameId, crypto.randomUUID(), command)
    },
    [socket, gameId]
  )

  const degommage = useCallback(
    (targetId: string) => sendCommand({ type: 'degommage', targetId }),
    [sendCommand]
  )
  const undo = useCallback(() => sendCommand({ type: 'undo' }), [sendCommand])
  const requestEnd = useCallback(
    (kind: EndKind, winnerId?: string) => sendCommand({ type: 'request_end', kind, winnerId }),
    [sendCommand]
  )
  const respondEnd = useCallback(
    (accept: boolean) => sendCommand({ type: 'respond_end', accept }),
    [sendCommand]
  )
  const withdrawEnd = useCallback(() => sendCommand({ type: 'withdraw_end' }), [sendCommand])

  return {
    state,
    hostId,
    startedAt,
    serverOffset,
    connected,
    sendCommand,
    degommage,
    undo,
    requestEnd,
    respondEnd,
    withdrawEnd,
  }
}
