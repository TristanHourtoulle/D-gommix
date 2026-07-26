'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSocket } from '@/components/socket-provider'
import type { InvitesPayload } from '@/lib/api-payloads'
import { queryKeys } from '@/lib/query-keys'
import type { InviteReceivedPayload } from '@/lib/realtime-types'

/**
 * Mount-once bridge between the invitation socket events and the `invites`
 * query cache. It lives in the tabs layout so `invite:received` /
 * `invite:canceled` land no matter which tab is on screen — the banners
 * (`useInvites` on Accueil and Jouer) only read the patched cache.
 */
export function InviteEventsBridge() {
  const { socket } = useSocket()
  const queryClient = useQueryClient()

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
      queryClient.setQueryData<InvitesPayload>(queryKeys.invites, (current) => ({
        invites: (current?.invites ?? []).filter((invite) => invite.gameId !== gameId),
      }))
      void queryClient.invalidateQueries({ queryKey: queryKeys.invites })
    }
    socket.on('invite:received', onReceived)
    socket.on('invite:canceled', onCanceled)
    return () => {
      socket.off('invite:received', onReceived)
      socket.off('invite:canceled', onCanceled)
    }
  }, [socket, queryClient])

  return null
}
