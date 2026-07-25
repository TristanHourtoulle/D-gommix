'use client'

import { Icon } from '@/components/icons'
import { CharacterBadge } from '@/components/ui/character-badge'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import type { LobbyPlayer } from '@/lib/realtime-types'

interface SeatCardProps {
  player: LobbyPlayer
  isMe: boolean
  isRowHost: boolean
  /** True when the viewer is the host: shows kick / cancel-invite actions. */
  viewerIsHost: boolean
  onKick: () => void
  onCancelInvite: () => void
}

const ACTION_STYLE = {
  border: '1.5px solid var(--parchment-line)',
  color: 'var(--ink-soft)',
  background: 'transparent',
} as const

/** One lobby seat row: avatar, name, invite status and chosen character. */
export function SeatCard({
  player,
  isMe,
  isRowHost,
  viewerIsHost,
  onKick,
  onCancelInvite,
}: SeatCardProps) {
  const pending = player.status === 'invited'

  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <span className="flex min-w-0 items-center gap-2 text-[0.85rem] font-semibold">
        <PlayerAvatar username={player.username} size={32} />
        <span className="truncate">
          {player.username}
          {isMe ? ' (toi)' : ''}
        </span>
        {isRowHost ? (
          <Icon name="crown" size={14} strokeWidth={1.8} title="Hôte" className="shrink-0" />
        ) : null}
      </span>

      <span className="flex shrink-0 items-center gap-2">
        {pending ? (
          <span className="text-[0.7rem]" style={{ color: 'var(--ink-faint)' }}>
            invitée…
          </span>
        ) : player.character ? (
          <CharacterBadge character={player.character} size="sm" />
        ) : (
          <span className="text-[0.7rem]" style={{ color: 'var(--ink-faint)' }}>
            choisit…
          </span>
        )}

        {viewerIsHost && !isMe ? (
          pending ? (
            <button
              type="button"
              className="rounded-full px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wide"
              style={ACTION_STYLE}
              onClick={onCancelInvite}
            >
              Annuler
            </button>
          ) : (
            <button
              type="button"
              className="rounded-full px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wide"
              style={{ ...ACTION_STYLE, color: 'var(--bad)' }}
              onClick={onKick}
            >
              Expulser
            </button>
          )
        ) : null}
      </span>
    </div>
  )
}
