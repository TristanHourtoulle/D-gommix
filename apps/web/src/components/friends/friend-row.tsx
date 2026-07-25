'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Presence } from '@degommix/game-core'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { PresenceDot } from '@/components/ui/presence-dot'
import { RoundIconButton } from './round-icon-button'

interface FriendRowProps {
  friendId: string
  username: string
  avatarId: string | null
  presence: Presence
  busy: boolean
  onInvite: () => void
  onRemove: () => void
}

/**
 * One friend: profile link, live presence, invite (only while the friend is
 * free) and silent removal behind an inline confirmation.
 */
export function FriendRow({
  friendId,
  username,
  avatarId,
  presence,
  busy,
  onInvite,
  onRemove,
}: FriendRowProps) {
  const [confirming, setConfirming] = useState(false)
  const isFree = presence !== 'in_game'

  return (
    <div className="flex items-center gap-3 py-2">
      <Link
        href={`/amis/${friendId}`}
        className="flex min-w-0 flex-1 items-center gap-3 no-underline"
        style={{ color: 'inherit' }}
      >
        <PlayerAvatar username={username} size={32} avatarId={avatarId} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold">{username}</span>
          <PresenceDot presence={presence} />
        </span>
      </Link>

      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--ink-soft)' }}>
            Retirer ?
          </span>
          <RoundIconButton
            icon="check"
            label={`Confirmer le retrait de ${username}`}
            tone="bad"
            disabled={busy}
            onClick={() => {
              setConfirming(false)
              onRemove()
            }}
          />
          <RoundIconButton
            icon="close"
            label="Garder cet ami"
            tone="neutral"
            disabled={busy}
            onClick={() => setConfirming(false)}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {isFree ? (
            <RoundIconButton
              icon="user-add"
              label={`Inviter ${username}`}
              tone="accent"
              disabled={busy}
              onClick={onInvite}
            />
          ) : null}
          <RoundIconButton
            icon="close"
            label={`Retirer ${username} de tes amis`}
            tone="neutral"
            disabled={busy}
            onClick={() => setConfirming(true)}
          />
        </div>
      )}
    </div>
  )
}
