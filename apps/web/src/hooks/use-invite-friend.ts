'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSocket } from '@/components/socket-provider'
import { useToast } from '@/components/ui/toast'
import { useInvalidateTabData } from '@/hooks/use-tab-data'
import { emitWithAck } from '@/lib/socket'
import { ackErrorMessage, DELIVERY_FAILED_MESSAGE } from '@/lib/ws-errors'

/**
 * Smallest format, so a one-tap invite never over-books seats. The host
 * raises it from the lobby screen (`lobby:set_format`).
 */
const DEFAULT_INVITE_FORMAT = 2 as const

export interface UseInviteFriendResult {
  /** One-tap invite of a friend into the caller's (possibly fresh) lobby. */
  inviteFriend: (friendId: string) => Promise<void>
  /** Friend id with an invite in flight, null when idle. */
  busyFriendId: string | null
}

/**
 * One-tap invite shared by the Amis screen and the Arène friends strip:
 * reuses the open lobby when there is one, otherwise creates a lobby on
 * demand and chains the invitation into it. The chain is not atomic — when
 * the invite fails right after the create, the fresh empty lobby is
 * abandoned (`lobby:leave` dissolves it) and the user stays put instead of
 * landing in a phantom lobby.
 */
export function useInviteFriend(myLobbyId: string | null): UseInviteFriendResult {
  const { socket } = useSocket()
  const router = useRouter()
  const { toast } = useToast()
  const invalidate = useInvalidateTabData()
  const [busyFriendId, setBusyFriendId] = useState<string | null>(null)

  const inviteFriend = useCallback(
    async (friendId: string): Promise<void> => {
      if (!socket) {
        toast(DELIVERY_FAILED_MESSAGE, 'error')
        return
      }
      setBusyFriendId(friendId)

      if (myLobbyId) {
        // Inviting into an existing lobby reshapes no tab payload of the
        // inviter: the invitee's screens are refreshed by their own events.
        const invited = await emitWithAck(socket, 'lobby:invite', {
          gameId: myLobbyId,
          friendId,
        })
        setBusyFriendId(null)
        if (invited.ok) toast('Invitation envoyée !')
        else toast(ackErrorMessage(invited), 'error')
        return
      }

      const created = await emitWithAck(socket, 'lobby:create', {
        format: DEFAULT_INVITE_FORMAT,
      })
      if (!created.ok) {
        setBusyFriendId(null)
        toast(ackErrorMessage(created), 'error')
        return
      }
      const invited = await emitWithAck(socket, 'lobby:invite', {
        gameId: created.gameId,
        friendId,
      })
      setBusyFriendId(null)
      if (!invited.ok) {
        // Fire-and-forget: the empty lobby dissolves server-side, and the
        // zombie sweep catches it anyway if this emit is lost.
        void emitWithAck(socket, 'lobby:leave', { gameId: created.gameId }).catch(() => undefined)
        invalidate('home', 'friends', 'invites')
        toast(ackErrorMessage(invited), 'error')
        return
      }
      // The fresh lobby is the Accueil resume banner and the `myLobbyId` the
      // friends payload invites into; creating it may also auto-decline the
      // user's own pending invitations, so all three payloads are stale now.
      invalidate('home', 'friends', 'invites')
      toast('Invitation envoyée !')
      router.push(`/lobby/${created.gameId}`)
    },
    [socket, myLobbyId, toast, invalidate, router]
  )

  return { inviteFriend, busyFriendId }
}
