'use client'

import { useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Ack } from '@degommix/game-core'
import { useSocket } from '@/components/socket-provider'
import { useInvitesData } from '@/hooks/use-tab-data'
import type { InvitesPayload } from '@/lib/api-payloads'
import { queryKeys } from '@/lib/query-keys'
import type { PendingInvite } from '@/lib/queries/invites'
import { emitWithAck, timeoutAck } from '@/lib/socket'
import type { InviteReceivedPayload, LobbyState } from '@/lib/realtime-types'

export interface UseInvitesResult {
  /** Pending invitations from server state, patched live by socket events. */
  invites: PendingInvite[]
  /** Accepts an invitation (`lobby:respond_invite`) and removes the banner. */
  accept: (gameId: string) => Promise<Ack<{ lobbyState?: LobbyState | null }>>
  /** Declines an invitation and removes the banner. */
  decline: (gameId: string) => Promise<Ack<{ lobbyState?: LobbyState | null }>>
  /** Removes a banner locally without answering (until the next refetch). */
  dismiss: (gameId: string) => void
}

/**
 * Invitation banners (home screen + Jouer tab). The list is server state from
 * the `invites` query — seeded by SSR, so it survives a reload or a socket drop
 * — and `invite:received` / `invite:canceled` only patch that cache.
 */
export function useInvites(initialData: InvitesPayload): UseInvitesResult {
  const { socket } = useSocket()
  const queryClient = useQueryClient()
  const { data } = useInvitesData(initialData)

  const remove = useCallback(
    (gameId: string) => {
      queryClient.setQueryData<InvitesPayload>(queryKeys.invites, (current) => ({
        invites: (current?.invites ?? []).filter((invite) => invite.gameId !== gameId),
      }))
    },
    [queryClient]
  )

  useEffect(() => {
    if (!socket) return
    // The broadcast patches the cache for an instant banner, then the
    // invalidation lets the server payload confirm it.
    const onReceived = (payload: InviteReceivedPayload): void => {
      queryClient.setQueryData<InvitesPayload>(queryKeys.invites, (current) => ({
        invites: [
          payload,
          ...(current?.invites ?? []).filter((invite) => invite.gameId !== payload.gameId),
        ],
      }))
      void queryClient.invalidateQueries({ queryKey: queryKeys.invites })
    }
    const onCanceled = ({ gameId }: { gameId: string }): void => {
      remove(gameId)
      void queryClient.invalidateQueries({ queryKey: queryKeys.invites })
    }
    socket.on('invite:received', onReceived)
    socket.on('invite:canceled', onCanceled)
    return () => {
      socket.off('invite:received', onReceived)
      socket.off('invite:canceled', onCanceled)
    }
  }, [socket, queryClient, remove])

  const respond = useCallback(
    async (gameId: string, accept: boolean) => {
      if (!socket) return timeoutAck<{ lobbyState?: LobbyState | null }>()
      const ack = await emitWithAck(socket, 'lobby:respond_invite', { gameId, accept })
      if (ack.ok) remove(gameId)
      return ack
    },
    [socket, remove]
  )

  const accept = useCallback((gameId: string) => respond(gameId, true), [respond])
  const decline = useCallback((gameId: string) => respond(gameId, false), [respond])

  return { invites: data.invites, accept, decline, dismiss: remove }
}
