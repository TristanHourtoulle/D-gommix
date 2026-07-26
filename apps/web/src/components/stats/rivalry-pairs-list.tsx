'use client'

import { useMemo } from 'react'
import { RoundIconButton } from '@/components/friends/round-icon-button'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { useInviteFriend } from '@/hooks/use-invite-friend'
import { usePresence } from '@/hooks/use-presence'
import { useFriendsSnapshot } from '@/hooks/use-tab-data'
import type { RivalryPair } from '@/lib/queries/rivalries'
import { challengeState } from './challenge'

interface RivalryPairsListProps {
  pairs: RivalryPair[]
}

/** « 3 subis · 5 donnés » — dégommages taken, then dealt, both pluralized. */
function pairCountsLabel(pair: RivalryPair): string {
  const taken = `${pair.taken} subi${pair.taken > 1 ? 's' : ''}`
  const dealt = `${pair.dealt} donné${pair.dealt > 1 ? 's' : ''}`
  return `${taken} · ${dealt}`
}

/**
 * The « Rivalités » rows, each with a one-tap « Régler ses comptes » key that
 * opens (or reuses) a lobby and invites that rival — the same chain as the
 * Tribu list, `useInviteFriend`. The friends payload is what makes the key
 * honest: it carries `myLobbyId` AND the friendship the ws-server requires.
 * Presence comes from the socket-lifetime store with no seed — the ws-server
 * pushes a snapshot at connect (see the comment in lobby-screen.tsx).
 */
export function RivalryPairsList({ pairs }: RivalryPairsListProps) {
  const friends = useFriendsSnapshot()
  const friendIds = useMemo(
    () => (friends ? new Set(friends.friends.map((friend) => friend.id)) : undefined),
    [friends]
  )
  const { presenceOf } = usePresence()
  const { inviteFriend, busyFriendId } = useInviteFriend(friends?.myLobbyId ?? null)

  const rows = pairs.map((pair) => ({
    pair,
    state: challengeState({
      rivalId: pair.userId,
      friendIds,
      presence: presenceOf(pair.userId),
      busyRivalId: busyFriendId,
    }),
  }))
  const hasAction = rows.some((row) => row.state !== 'hidden')

  return (
    <div className="flex flex-col gap-2 border-t border-parchment-line pt-3">
      <p className="sec-label">Rivalités</p>
      {rows.map(({ pair, state }) => (
        <div
          key={pair.userId}
          className="flex items-center gap-2"
          data-testid={`rivalry-row-${pair.username}`}
        >
          <PlayerAvatar username={pair.username} size={32} avatarId={pair.avatarId} />
          <p className="m-0 min-w-0 flex-1 truncate text-sm font-bold">{pair.username}</p>
          <p className="m-0 shrink-0 text-xs text-ink-soft">{pairCountsLabel(pair)}</p>
          {state === 'hidden' ? null : (
            <RoundIconButton
              icon="sword"
              label={
                state === 'in_game'
                  ? `${pair.username} est en partie`
                  : `Régler ses comptes avec ${pair.username}`
              }
              tone="accent"
              disabled={state !== 'ready'}
              onClick={() => void inviteFriend(pair.userId)}
            />
          )}
        </div>
      ))}
      {hasAction ? <p className="helper-text">Touche l’épée pour régler tes comptes.</p> : null}
    </div>
  )
}
