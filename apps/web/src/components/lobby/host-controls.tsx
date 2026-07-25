'use client'

import type { GameFormat, Presence } from '@degommix/game-core'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { PresenceDot } from '@/components/ui/presence-dot'
import type { InvitableFriend } from '@/lib/queries/lobby'
import type { LobbyPlayer } from '@/lib/realtime-types'
import { FormatSegmented } from './format-segmented'
import { sortByAvailability } from './invitable-order'

interface HostControlsProps {
  format: GameFormat
  players: LobbyPlayer[]
  friends: InvitableFriend[]
  /** Live presence of a friend, socket-fed; unknown ids read as 'offline'. */
  presenceOf: (userId: string) => Presence
  canStart: boolean
  /** Explains why the start button is disabled; null when it is enabled. */
  startHelper: string | null
  busy: boolean
  onSetFormat: (format: GameFormat) => void
  onInvite: (friendId: string) => void
  onStart: () => void
}

/** Host-only lobby section: format switch, friend invitations and launch CTA. */
export function HostControls({
  format,
  players,
  friends,
  presenceOf,
  canStart,
  startHelper,
  busy,
  onSetFormat,
  onInvite,
  onStart,
}: HostControlsProps) {
  const seatedIds = new Set(players.map((player) => player.userId))
  const invitable = sortByAvailability(
    friends.filter((friend) => !seatedIds.has(friend.id)),
    presenceOf
  )
  const lobbyFull = players.length >= format

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="sec-label">Format</p>
        <FormatSegmented
          value={format}
          onChange={onSetFormat}
          minFormat={players.length}
          disabled={busy}
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="sec-label">Inviter des amis</p>
        {invitable.length === 0 ? (
          <p className="helper-text">Tous tes amis sont déjà là — partage le code sinon.</p>
        ) : (
          invitable.map((friend) => (
            <div
              key={friend.id}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2"
              style={{
                background: 'var(--surface-2)',
                border: '1.5px solid var(--parchment-line)',
                // An unreachable friend stays invitable (the invitation waits for
                // them), but reads as secondary against the ones who can answer.
                opacity: presenceOf(friend.id) === 'online' ? 1 : 0.62,
              }}
            >
              <PlayerAvatar username={friend.username} size={32} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[0.82rem] font-semibold">{friend.username}</span>
                <PresenceDot presence={presenceOf(friend.id)} />
              </span>
              <button
                type="button"
                className="cta"
                style={{ width: 'auto', padding: '0.4rem 0.6rem', fontSize: '0.65rem' }}
                disabled={lobbyFull || busy || presenceOf(friend.id) === 'in_game'}
                onClick={() => onInvite(friend.id)}
              >
                <Icon name="user-add" size={12} /> Inviter
              </button>
            </div>
          ))
        )}
        {lobbyFull && invitable.length > 0 ? (
          <p className="helper-text">Lobby complet — passe en format supérieur pour inviter.</p>
        ) : null}
      </div>

      <Button
        onClick={onStart}
        disabled={!canStart || busy}
        helper={startHelper ?? undefined}
      >
        Lancer la partie
      </Button>
    </section>
  )
}
