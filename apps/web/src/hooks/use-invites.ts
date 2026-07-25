'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Ack } from '@degommix/game-core'
import { useSocket } from '@/components/socket-provider'
import { emitWithAck, timeoutAck } from '@/lib/socket'
import type { InviteReceivedPayload, LobbyState } from '@/lib/realtime-types'

export interface UseInvitesResult {
  /** Invitations received while connected, newest last (deduped by gameId). */
  invites: InviteReceivedPayload[]
  /** Accepts an invitation (`lobby:respond_invite`) and removes the banner. */
  accept: (gameId: string) => Promise<Ack<{ lobbyState?: LobbyState | null }>>
  /** Declines an invitation and removes the banner. */
  decline: (gameId: string) => Promise<Ack<{ lobbyState?: LobbyState | null }>>
  /** Removes a banner locally without answering. */
  dismiss: (gameId: string) => void
}

/**
 * Realtime invitation banners (home screen + Jouer tab): collects
 * `invite:received` broadcasts and drops entries on `invite:canceled`.
 */
export function useInvites(): UseInvitesResult {
  const { socket } = useSocket()
  const [invites, setInvites] = useState<InviteReceivedPayload[]>([])

  useEffect(() => {
    if (!socket) return
    const onReceived = (payload: InviteReceivedPayload): void => {
      setInvites((current) => [
        ...current.filter((invite) => invite.gameId !== payload.gameId),
        payload,
      ])
    }
    const onCanceled = ({ gameId }: { gameId: string }): void => {
      setInvites((current) => current.filter((invite) => invite.gameId !== gameId))
    }
    socket.on('invite:received', onReceived)
    socket.on('invite:canceled', onCanceled)
    return () => {
      socket.off('invite:received', onReceived)
      socket.off('invite:canceled', onCanceled)
    }
  }, [socket])

  const dismiss = useCallback((gameId: string) => {
    setInvites((current) => current.filter((invite) => invite.gameId !== gameId))
  }, [])

  const respond = useCallback(
    async (gameId: string, accept: boolean) => {
      if (!socket) return timeoutAck<{ lobbyState?: LobbyState | null }>()
      const ack = await emitWithAck(socket, 'lobby:respond_invite', { gameId, accept })
      if (ack.ok) dismiss(gameId)
      return ack
    },
    [socket, dismiss]
  )

  const accept = useCallback((gameId: string) => respond(gameId, true), [respond])
  const decline = useCallback((gameId: string) => respond(gameId, false), [respond])

  return { invites, accept, decline, dismiss }
}
