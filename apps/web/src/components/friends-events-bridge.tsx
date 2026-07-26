'use client'

import { useEffect } from 'react'
import { useSocket } from '@/components/socket-provider'
import { useToast } from '@/components/ui/toast'
import { useInvalidateTabData } from '@/hooks/use-tab-data'
import type { FriendsEventPayload } from '@/lib/realtime-types'

/**
 * Mount-once bridge between `friends:event` and the tab query cache. It
 * lives in the tabs layout so a friend request landing while the user sits
 * on Accueil or Classement still refreshes the Tribu badge and shows a
 * toast — mirroring what `InviteEventsBridge` does for invitations. The
 * Amis and Arène screens keep their own invalidation (duplicate
 * `invalidateQueries` on the same key coalesces into one refetch), but this
 * bridge is the ONLY `friends:event` subscriber allowed to toast.
 */
export function FriendsEventsBridge() {
  const { socket } = useSocket()
  const { toast } = useToast()
  const invalidate = useInvalidateTabData()

  useEffect(() => {
    if (!socket) return
    const onFriendsEvent = (payload: FriendsEventPayload): void => {
      // An acceptance reshapes the friends circle the Classement is built
      // from; the other kinds only touch the Amis lists and the badge.
      if (payload.kind === 'request_accepted') invalidate('friends', 'leaderboard')
      else invalidate('friends')
      if (payload.kind === 'request_received') {
        toast(`${payload.from.username} veut rejoindre ta tribu !`)
      }
    }
    socket.on('friends:event', onFriendsEvent)
    return () => {
      socket.off('friends:event', onFriendsEvent)
    }
  }, [socket, invalidate, toast])

  return null
}
