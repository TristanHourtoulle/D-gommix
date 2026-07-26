'use client'

import { useMemo } from 'react'
import type { Presence } from '@degommix/game-core'
import { Button } from '@/components/ui/button'
import { PresenceDot } from '@/components/ui/presence-dot'
import { useInviteFriend } from '@/hooks/use-invite-friend'
import { usePresence } from '@/hooks/use-presence'
import { useFriendsSnapshot } from '@/hooks/use-tab-data'

interface FriendProfileActionsProps {
  friendId: string
}

/**
 * Client island of the friend profile header: live presence dot and one-tap
 * « Inviter », reusing the friends payload (myLobbyId + presence seed) via
 * the shared `friends` query cache and the socket-lifetime presence store.
 * Renders nothing until the payload is cached — an invite needs `myLobbyId`
 * from it anyway, and guessing presence before that would flash a wrong
 * « hors ligne ». Mirrors the FriendRow rules: invite only while the friend
 * is not in game (see friend-row.tsx).
 */
export function FriendProfileActions({ friendId }: FriendProfileActionsProps) {
  const data = useFriendsSnapshot()
  const friend = data?.friends.find((entry) => entry.id === friendId)

  const seed = useMemo(
    (): Record<string, Presence> | undefined =>
      friend ? { [friend.id]: friend.initialPresence } : undefined,
    [friend]
  )
  const { presenceOf } = usePresence(seed)
  const { inviteFriend, busyFriendId } = useInviteFriend(data?.myLobbyId ?? null)

  if (!friend) return null

  const presence = presenceOf(friendId)
  const isFree = presence !== 'in_game'

  return (
    <span className="ml-auto flex shrink-0 flex-col items-end gap-1.5">
      <PresenceDot presence={presence} />
      {isFree ? (
        <Button
          size="sm"
          fullWidth={false}
          disabled={busyFriendId === friendId}
          onClick={() => void inviteFriend(friendId)}
        >
          Inviter
        </Button>
      ) : null}
    </span>
  )
}
