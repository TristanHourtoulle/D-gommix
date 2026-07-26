import type { CharacterId } from '@degommix/game-core'
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
  /** Camp of the HITTER — selects the signature decor (plan 042). */
  camp: CharacterId
}

/** Lane offset + launch delay of each pilum of Caïus's volley. */
const PILA = [
  { lane: '-26px', delay: '0ms' },
  { lane: '2px', delay: '70ms' },
  { lane: '24px', delay: '140ms' },
] as const

/**
 * Camp-specific decor drawn on top of the shared stars + stamp. Pure CSS
 * shapes: no image, no SVG file, nothing traced from published artwork.
 * Astérix has none on purpose — his signature IS the bare star burst of plan
 * 011, which must keep rendering exactly as it ships.
 */
function HitDecor({ camp }: { camp: CharacterId }) {
  if (camp === 'obelix') return <i className="hit-menhir" />
  if (camp === 'caligula_minus') return <i className="hit-toge" />
  if (camp === 'caius_bonus') {
    return (
      <>
        {PILA.map((pilum) => (
          <i
            key={pilum.delay}
            className="hit-pilum"
            style={{ '--lane': pilum.lane, '--d': pilum.delay } as CSSProperties}
          />
        ))}
      </>
    )
  }
  return null
}

/**
 * Overlay markup of the dégommage hit — the hitter's signature decor, four
 * flying stars and the Cinzel stamp. Purely decorative: the animations live in
 * `globals.css` and are driven by the `data-hit` / `data-hit-camp` pair on the
 * enclosing `.player-card`. Shared by the self strip and the opponent cards,
 * which only differ by their star vectors and by `--hit-scale`.
 *
 * The decor is rendered BEFORE the stars so the menhir, the pila and the toge
 * sit under the sparks rather than over them.
 */
export function HitBurst({ word, stars, camp }: HitBurstProps) {
  return (
    <span className="hit-fx" aria-hidden="true">
      <HitDecor camp={camp} />
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
