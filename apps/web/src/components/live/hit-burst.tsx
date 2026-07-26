import type { CSSProperties } from 'react'

/** One comic-book star of the burst: exit vector + ink/gold fill. */
export interface HitStar {
  x: string
  y: string
  ink: boolean
}

interface HitBurstProps {
  /** Onomatopée stamped over the struck card (see `hit-fx.ts`). */
  word: string
  stars: readonly HitStar[]
}

/**
 * Overlay markup of the dégommage hit — four flying stars and the Cinzel
 * stamp. Purely decorative: the animations live in `globals.css` and are
 * driven by `data-hit` on the enclosing `.player-card`. Shared by the self
 * strip and the opponent cards, which only differ by their star vectors.
 */
export function HitBurst({ word, stars }: HitBurstProps) {
  return (
    <span className="hit-fx" aria-hidden="true">
      {stars.map((star) => (
        <i
          key={`${star.x}${star.y}`}
          className={star.ink ? 'hit-star ink' : 'hit-star'}
          style={{ '--x': star.x, '--y': star.y } as CSSProperties}
        />
      ))}
      <span className="hit-stamp">{word}</span>
    </span>
  )
}
