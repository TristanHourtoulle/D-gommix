'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Presence } from '@degommix/game-core'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { RoundIconButton } from './round-icon-button'

const PRESENCE_LABEL: Record<Presence, string> = {
  online: 'en ligne',
  in_game: 'en partie',
  offline: 'hors ligne',
}

const PRESENCE_COLOR: Record<Presence, string> = {
  online: 'var(--good)',
  in_game: 'var(--bronze-strong)',
  offline: 'var(--ink-faint)',
}

interface FriendRowProps {
  friendId: string
  username: string
  presence: Presence
  /** True when the current user has an open lobby to invite into. */
  canInvite: boolean
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
  presence,
  canInvite,
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
        <PlayerAvatar username={username} size={32} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold">{username}</span>
          <span
            className="flex items-center gap-1.5 text-xs"
            style={{ color: PRESENCE_COLOR[presence] }}
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{
                background: PRESENCE_COLOR[presence],
                opacity: presence === 'offline' ? 0.45 : 1,
              }}
            />
            {PRESENCE_LABEL[presence]}
          </span>
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
              label={
                canInvite
                  ? `Inviter ${username} dans ton salon`
                  : 'Crée d’abord un salon dans l’onglet Jouer'
              }
              tone="accent"
              disabled={busy || !canInvite}
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
