import type { PlayerState } from '@degommix/game-core'
import { Icon } from '@/components/icons'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { CHARACTER_META } from '@/lib/characters'
import { HitBurst } from './hit-burst'
import { hitPhase, type TargetHit } from './hit-fx'

interface SelfStripProps {
  player: PlayerState
  username: string
  /** Profile avatar of the viewer — `null` falls back to the initial. */
  avatarId: string | null
  isHost: boolean
  /** Degommages suffered so far. */
  taken: number
  /** Last dégommage aimed at the viewer — plays the hit combo on the strip. */
  hit?: TargetHit
}

/** Star exit vectors, sized for the compact self strip. */
const STARS = [
  { x: '-38px', y: '-22px', ink: false },
  { x: '34px', y: '-25px', ink: true },
  { x: '46px', y: '10px', ink: false },
  { x: '-46px', y: '8px', ink: true },
] as const

/**
 * The viewer's own row on the live screen — deliberately compact and never
 * tappable (no auto-targeting): profile avatar, pseudo (crown for the host),
 * « {personnage} · toi » and the given/suffered tallies. Still a hit target:
 * when an opponent dégomme the viewer, the strip plays the same hit combo as
 * the opponent cards (`data-hit` + `.player-card` keyframes in `globals.css`).
 */
export function SelfStrip({ player, username, avatarId, isHost, taken, hit }: SelfStripProps) {
  const phase = hitPhase(hit)

  return (
    <div
      className="player-card self-strip relative z-10"
      data-testid={`player-card-${username}`}
      data-hit={phase}
      style={player.inGame ? undefined : { opacity: 0.55, filter: 'grayscale(0.7)' }}
    >
      <PlayerAvatar username={username} size={32} avatarId={avatarId} />
      <div className="min-w-0">
        <p className="m-0 flex items-center gap-1 truncate text-sm font-bold">
          <span className="truncate">{username}</span>
          {isHost ? (
            <Icon name="crown" size={13} className="shrink-0" title="Hôte de la partie" />
          ) : null}
        </p>
        <p className="m-0 text-[0.68rem]" style={{ color: 'var(--ink-soft)' }}>
          {CHARACTER_META[player.character].label}
          {player.inGame ? ' · toi' : ' · a quitté la partie'}
        </p>
      </div>
      <p className="self-stats">
        <Icon name="sword" size={13} title="Pions dégommés" />
        <span className="hit-tally" data-testid="degommage-count">
          {player.degommages}
        </span>{' '}
        donné{player.degommages > 1 ? 's' : ''} · {taken} subi{taken > 1 ? 's' : ''}
      </p>
      {hit ? <HitBurst word={hit.word} stars={STARS} /> : null}
    </div>
  )
}
