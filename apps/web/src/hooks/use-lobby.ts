'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Ack, CharacterId, GameEvent, GameFormat } from '@degommix/game-core'
import { useSocket } from '@/components/socket-provider'
import { attachLobbyCache, getCachedLobbyState } from '@/lib/lobby-cache'
import { emitWithAck, timeoutAck } from '@/lib/socket'
import type { CommandMap, CommandName, LobbyState } from '@/lib/realtime-types'

type EmptyAck = Ack<Record<never, never>>

export interface UseLobbyResult {
  lobby: LobbyState | null
  connected: boolean
  pickCharacter: (character: CharacterId) => Promise<EmptyAck>
  invite: (friendId: string) => Promise<EmptyAck>
  cancelInvite: (userId: string) => Promise<EmptyAck>
  kick: (userId: string) => Promise<EmptyAck>
  setFormat: (format: GameFormat) => Promise<EmptyAck>
  /** « L'Oracle du village » (plan 040): optional, secret, locked at start. */
  setOraclePick: (
    predictedWinnerId: string,
    predictedSouffreDouleurId: string | null
  ) => Promise<EmptyAck>
  start: () => Promise<Ack<{ firstEvents: GameEvent[] }>>
  leave: () => Promise<EmptyAck>
}

/**
 * Lobby state subscription + typed lobby commands for `/lobby/[gameId]`.
 * The server pushes `lobby:state` at handshake for seated players and
 * rebroadcasts the full state on every change.
 */
export function useLobby(gameId: string): UseLobbyResult {
  const { socket, connected } = useSocket()
  const [lobby, setLobby] = useState<LobbyState | null>(null)

  useEffect(() => {
    if (!socket) return
    attachLobbyCache(socket)
    setLobby(getCachedLobbyState(gameId))
    const onLobbyState = (state: LobbyState): void => {
      if (state.gameId === gameId) setLobby(state)
    }
    socket.on('lobby:state', onLobbyState)
    return () => {
      socket.off('lobby:state', onLobbyState)
    }
  }, [socket, gameId])

  const run = useCallback(
    <K extends CommandName>(
      event: K,
      payload: CommandMap[K]['payload']
    ): Promise<Ack<CommandMap[K]['result']>> => {
      if (!socket) return Promise.resolve(timeoutAck())
      return emitWithAck(socket, event, payload)
    },
    [socket]
  )

  const pickCharacter = useCallback(
    (character: CharacterId) => run('lobby:pick_character', { gameId, character }),
    [run, gameId]
  )
  const invite = useCallback(
    (friendId: string) => run('lobby:invite', { gameId, friendId }),
    [run, gameId]
  )
  const cancelInvite = useCallback(
    (userId: string) => run('lobby:cancel_invite', { gameId, userId }),
    [run, gameId]
  )
  const kick = useCallback((userId: string) => run('lobby:kick', { gameId, userId }), [run, gameId])
  const setFormat = useCallback(
    (format: GameFormat) => run('lobby:set_format', { gameId, format }),
    [run, gameId]
  )
  const setOraclePick = useCallback(
    (predictedWinnerId: string, predictedSouffreDouleurId: string | null) =>
      run('lobby:oracle_pick', { gameId, predictedWinnerId, predictedSouffreDouleurId }),
    [run, gameId]
  )
  const start = useCallback(() => run('lobby:start', { gameId }), [run, gameId])
  const leave = useCallback(() => run('lobby:leave', { gameId }), [run, gameId])

  return {
    lobby,
    connected,
    pickCharacter,
    invite,
    cancelInvite,
    kick,
    setFormat,
    setOraclePick,
    start,
    leave,
  }
}
