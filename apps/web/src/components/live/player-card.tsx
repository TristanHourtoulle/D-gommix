import type { PlayerState } from '@degommix/game-core'
import { Icon } from '@/components/icons'
import { CharacterBadge } from '@/components/ui/character-badge'
import { CHARACTER_META } from '@/lib/characters'

interface PlayerCardProps {
  player: PlayerState
  username: string
  isHost: boolean
  /** Degommages suffered so far, hidden while still at zero. */
  taken?: number
}

/**
 * Roster card of the live screen: portrait, pseudo (crown for the host) and
 * the sword tally. A player who left is grayed out with the quit note.
 */
export function PlayerCard({ player, username, isHost, taken }: PlayerCardProps) {
  return (
    <div
      className="card flex items-center gap-3 p-3"
      data-testid={`player-card-${username}`}
      style={player.inGame ? undefined : { opacity: 0.55, filter: 'grayscale(0.7)' }}
    >
      <CharacterBadge character={player.character} size="md" />
      <div className="min-w-0">
        <p className="m-0 flex items-center gap-1 truncate text-sm font-bold">
          <span className="truncate">{username}</span>
          {isHost ? (
            <Icon name="crown" size={13} className="shrink-0" title="Hôte de la partie" />
          ) : null}
        </p>
        <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
          {CHARACTER_META[player.character].label}
        </p>
        <p className="m-0 mt-1 flex items-center gap-1 text-sm font-bold">
          <Icon name="sword" size={14} title="Pions dégommés" />
          <span data-testid="degommage-count">{player.degommages}</span>
        </p>
        {taken !== undefined && taken > 0 ? (
          <p className="m-0 text-xs" style={{ color: 'var(--ink-faint)' }}>
            {taken} subi{taken > 1 ? 's' : ''}
          </p>
        ) : null}
        {player.inGame ? null : (
          <p className="m-0 text-xs italic" style={{ color: 'var(--ink-faint)' }}>
            a quitté la partie
          </p>
        )}
      </div>
    </div>
  )
}
