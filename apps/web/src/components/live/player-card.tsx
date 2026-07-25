import type { CSSProperties } from 'react'
import type { PlayerState } from '@degommix/game-core'
import { Icon } from '@/components/icons'
import { CharacterBadge } from '@/components/ui/character-badge'
import { CHARACTER_META } from '@/lib/characters'
import { hitPhase, type TargetHit } from './hit-fx'

interface PlayerCardProps {
  player: PlayerState
  username: string
  isHost: boolean
  /** Degommages suffered so far, hidden while still at zero. */
  taken?: number
  /**
   * Last dégommage aimed at this player. Drives the hit animation: the card
   * shakes, stars fire, an onomatopée stamps and the tally pops — identically
   * on every phone, because the word is derived from the replicated log.
   */
  hit?: TargetHit
}

/** Star exit vectors, sized for a half-width roster card. */
const STARS = [
  { x: '-38px', y: '-22px', ink: false },
  { x: '34px', y: '-25px', ink: true },
  { x: '46px', y: '10px', ink: false },
  { x: '-46px', y: '8px', ink: true },
] as const

/**
 * Roster card of the live screen: portrait, pseudo (crown for the host) and
 * the sword tally. A player who left is grayed out with the quit note. When a
 * dégommage lands on this player the card plays the validated hit combo — see
 * `hit-fx.ts` for the trigger and `globals.css` for the keyframes.
 */
export function PlayerCard({ player, username, isHost, taken, hit }: PlayerCardProps) {
  const phase = hitPhase(hit)

  return (
    <div
      className="card player-card flex items-center gap-3 p-3"
      data-testid={`player-card-${username}`}
      data-hit={phase}
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
          <span className="hit-tally" data-testid="degommage-count">
            {player.degommages}
          </span>
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

      {hit ? (
        <span className="hit-fx" aria-hidden="true">
          {STARS.map((star) => (
            <i
              key={`${star.x}${star.y}`}
              className={star.ink ? 'hit-star ink' : 'hit-star'}
              style={{ '--x': star.x, '--y': star.y } as CSSProperties}
            />
          ))}
          <span className="hit-stamp">{hit.word}</span>
        </span>
      ) : null}
    </div>
  )
}
