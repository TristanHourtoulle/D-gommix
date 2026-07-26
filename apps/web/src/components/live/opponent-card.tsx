'use client'

import Image from 'next/image'
import type { CSSProperties } from 'react'
import type { PlayerState } from '@degommix/game-core'
import { Icon } from '@/components/icons'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { CHARACTER_META } from '@/lib/characters'
import { HitBurst } from './hit-burst'
import { hitPhase, type TargetHit } from './hit-fx'

interface OpponentCardProps {
  player: PlayerState
  username: string
  /** Profile avatar of that opponent — `null` falls back to the initial. */
  avatarId: string | null
  isHost: boolean
  /** Degommages suffered by that opponent. */
  taken: number
  /** Last dégommage aimed at that opponent — plays the hit combo on the card. */
  hit?: TargetHit
  /** Whether the viewer can still act (in game). Gates every tap. */
  canAct: boolean
  /** Card locked by the anti double-tap lock (`tap-lock.ts`). */
  isLocked: boolean
  /** Degommage still awaiting the server ack. */
  isPending: boolean
  onTap: (targetId: string) => void
}

/** Star exit vectors, sized for the full-width arcade card. */
const STARS = [
  { x: '-72px', y: '-34px', ink: false },
  { x: '64px', y: '-40px', ink: true },
  { x: '84px', y: '18px', ink: false },
  { x: '-84px', y: '14px', ink: true },
] as const

/**
 * « Tape le portrait » — one giant arcade key per opponent, merging the roster
 * card and the tap target (post-playtest round 1, direction A). The whole card
 * is the button: camp-tinted face on the ink lip, profile avatar, Cinzel name,
 * character watermark behind, giant sword tally (moves on server ack only) and
 * the « +1 » affordance. A tap presses the key and starts the 1.2 s lock —
 * shown as the key staying pressed under a linear sweep. A player who left
 * stays grayed out IN PLACE (`data-state="out"`) so positions never reflow.
 *
 * The hit combo (shake, stars, stamp, tally pop) plays on the outer slot — the
 * same `.player-card` hooks as before the redesign — so the press translation
 * of the button and the shake of the card never fight over one transform.
 */
export function OpponentCard({
  player,
  username,
  avatarId,
  isHost,
  taken,
  hit,
  canAct,
  isLocked,
  isPending,
  onTap,
}: OpponentCardProps) {
  const meta = CHARACTER_META[player.character]
  const phase = hitPhase(hit)
  const out = !player.inGame
  const state = out ? 'out' : isPending ? 'confirming' : isLocked ? 'locked' : 'idle'

  return (
    <div
      className="player-card opp-slot"
      data-testid={`player-card-${username}`}
      data-hit={phase}
      style={{ '--camp': meta.colorVar } as CSSProperties}
    >
      <button
        type="button"
        className="opp-card"
        disabled={out || !canAct || isLocked}
        aria-busy={isPending}
        data-state={state}
        onClick={() => {
          onTap(player.userId)
        }}
      >
        <span className="opp-art" aria-hidden="true">
          <Image src={meta.portraitSrc} alt="" width={240} height={240} />
        </span>
        <PlayerAvatar username={username} size={64} avatarId={avatarId} />
        <span className="min-w-0">
          <span className="opp-name">
            <span className="truncate">{username}</span>
            {isHost ? (
              <Icon name="crown" size={16} className="shrink-0" title="Chef de camp" />
            ) : null}
          </span>
          <span className="opp-meta">
            {meta.label}
            {out ? ' · a quitté la partie' : ` · ${taken} subi${taken > 1 ? 's' : ''}`}
          </span>
        </span>
        <span className="opp-count">
          <span className="opp-count-n">
            <Icon name="sword" size={22} title="Pions dégommés" />
            <span className="hit-tally" data-testid="degommage-count">
              {player.degommages}
            </span>
          </span>
          <span className="opp-plus" aria-hidden="true">
            +1
          </span>
        </span>
        {isLocked ? (
          <>
            <span className="opp-sweep" aria-hidden="true" />
            <span className="opp-lock" aria-hidden="true">
              verrou 1,2&nbsp;s
            </span>
          </>
        ) : null}
      </button>
      {hit ? <HitBurst word={hit.word} stars={STARS} /> : null}
    </div>
  )
}
