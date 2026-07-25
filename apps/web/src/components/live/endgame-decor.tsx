import type { CSSProperties } from 'react'
import type { ConfettiPiece } from './endgame'

/** Rotating bronze rays behind the winner header. */
export function EndgameRays() {
  return <span className="eg-rays" data-eg-fx aria-hidden="true" />
}

/** Ink veil that settles over the loser's screen. */
export function EndgameVeil() {
  return <span className="eg-veil" data-eg-fx aria-hidden="true" />
}

/** 24 falling pieces in the four camp colours (winner variant only). */
export function EndgameConfetti({ pieces }: { pieces: readonly ConfettiPiece[] }) {
  return (
    <span className="eg-confetti" data-eg-fx aria-hidden="true">
      {pieces.map((piece, index) => (
        <i
          key={index}
          className={piece.round ? 'eg-conf round' : 'eg-conf'}
          style={
            {
              '--x': `${piece.leftPct}%`,
              '--dx': `${piece.driftPx}px`,
              '--rot': `${piece.rotateDeg}deg`,
              '--dur': `${piece.durationMs}ms`,
              '--del': `${piece.delayMs}ms`,
              background: piece.color,
            } as CSSProperties
          }
        />
      ))}
    </span>
  )
}

const LEAF_ANGLES = [168, 190, 212, 234, 256, 278] as const

/**
 * Laurel wreath: two arcs drawn with `stroke-dashoffset`, then twelve leaves
 * popping in pairs. `pathLength="1"` normalises the dash maths so the same
 * `stroke-dasharray: 1` works for both arcs.
 */
export function EndgameLaurel() {
  return (
    <svg
      className="eg-laurel"
      data-eg-fx
      aria-hidden="true"
      width="120"
      height="120"
      viewBox="0 0 160 160"
    >
      <path className="arc" pathLength="1" d="M94.8 149.4A71 71 0 0 1 9.7 70.1" />
      <path className="arc" pathLength="1" d="M65.2 149.4A71 71 0 0 0 150.3 70.1" />
      {LEAF_ANGLES.map((angle, index) => (
        <g key={`l${angle}`} transform={`rotate(${angle} 80 80)`}>
          <g className="leaf" style={{ '--i': index } as CSSProperties}>
            <ellipse cx="80" cy="9" rx="5.4" ry="11.5" transform="rotate(-30 80 9)" />
          </g>
        </g>
      ))}
      {LEAF_ANGLES.map((angle, index) => (
        <g key={`r${angle}`} transform={`rotate(${-angle} 80 80)`}>
          <g className="leaf" style={{ '--i': index } as CSSProperties}>
            <ellipse cx="80" cy="9" rx="5.4" ry="11.5" transform="rotate(30 80 9)" />
          </g>
        </g>
      ))}
    </svg>
  )
}

/** The loser's pawn, which tips over and lies down. */
export function EndgamePawn() {
  return (
    <svg className="eg-pawn" data-eg-fx aria-hidden="true" width="52" height="64" viewBox="0 0 50 62">
      <ellipse cx="25" cy="57" rx="15" ry="4.5" fill="var(--ink)" opacity="0.18" />
      <path
        d="M25 6c-6 0-10 4-10 9 0 3 1 5 3 7-4 3-6 8-6 14v8h26v-8c0-6-2-11-6-14 2-2 3-4 3-7 0-5-4-9-10-9Z"
        fill="var(--bronze)"
        stroke="var(--ink)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect
        x="10"
        y="44"
        width="30"
        height="8"
        rx="3"
        fill="var(--bronze)"
        stroke="var(--ink)"
        strokeWidth="2.5"
      />
    </svg>
  )
}
