'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Ack, CharacterId, GameEvent, GameFormat } from '@degommix/game-core'
import { useSocket } from '@/components/socket-provider'
import { emitWithAck, timeoutAck } from '@/lib/socket'
import type { AppSocket, CommandMap, CommandName, LobbyState } from '@/lib/realtime-types'

type EmptyAck = Ack<Record<never, never>>

export interface UseLobbyResult {
  lobby: LobbyState | null
  connected: boolean
  pickCharacter: (character: CharacterId) => Promise<EmptyAck>
  invite: (friendId: string) => Promise<EmptyAck>
  cancelInvite: (userId: string) => Promise<EmptyAck>
  kick: (userId: string) => Promise<EmptyAck>
  setFormat: (format: GameFormat) => Promise<EmptyAck>
  start: () => Promise<Ack<{ firstEvents: GameEvent[] }>>
  leave: () => Promise<EmptyAck>
}

/**
 * The `lobby:state` broadcast can arrive before the lobby screen mounts
 * (e.g. right after `lobby:create` acks, during navigation). A module-level
 * cache keeps the latest state per game so the hook can seed itself.
 */
const lobbyCache = new Map<string, LobbyState>()
let cacheAttachedTo: AppSocket | null = null

function ensureLobbyCache(socket: AppSocket): void {
  if (cacheAttachedTo === socket) return
  cacheAttachedTo = socket
  socket.on('lobby:state', (state) => {
    lobbyCache.set(state.gameId, state)
  })
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
    ensureLobbyCache(socket)
    setLobby(lobbyCache.get(gameId) ?? null)
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
  const start = useCallback(() => run('lobby:start', { gameId }), [run, gameId])
  const leave = useCallback(() => run('lobby:leave', { gameId }), [run, gameId])

  return { lobby, connected, pickCharacter, invite, cancelInvite, kick, setFormat, start, leave }
}
