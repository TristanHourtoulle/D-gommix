/**
 * Pure inputs of the end-of-game sequence played on the summary screen.
 * Everything here is deterministic on purpose: the confetti and the teasing
 * line are derived from `gameId`, so React renders the same thing on the server
 * and on the client (no hydration mismatch) and on every re-render (no
 * reshuffle mid-animation).
 */

export type EndgameVariant = 'winner' | 'loser' | 'none'

/**
 * Which orchestration this phone plays. Every device holds the same finished
 * state and picks its own variant — « none » when nobody won (an abandoned game
 * gets neither a fanfare nor a defeat).
 */
export function endgameVariant(winnerId: string | null, viewerId: string): EndgameVariant {
  if (winnerId === null) return 'none'
  return winnerId === viewerId ? 'winner' : 'loser'
}

/** The validated phase clocks, in milliseconds. */
export const ENDGAME_TIMINGS = {
  winner: { total: 3300, counterAt: 2280 },
  loser: { total: 3050, counterAt: 2480 },
} as const

/** How long the dégommage counter takes to roll from 0 to its final value. */
export const COUNTER_ROLL_MS = 900

/**
 * Shown under « DÉFAITE… ». Teasing, never humiliating, never about the person:
 * the line always leaves the door open to a rematch. No vocabulary borrowed
 * from the albums — same rule as the journal catalog.
 */
export const ENDGAME_TEASES = [
  'Le village est tombé. On remet ça ?',
  'Belle bagarre. La revanche est juste là.',
  'Cette fois-ci pour eux. La prochaine, on verra.',
  'Rien de perdu : les pions se remettent debout.',
] as const

/** FNV-1a over a string — small, fast, and stable across engines. */
function hashText(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Same line for the whole game, a different one from one game to the next. */
export function pickTease(gameId: string): string {
  const index = hashText(gameId) % ENDGAME_TEASES.length
  return ENDGAME_TEASES[index] ?? ENDGAME_TEASES[0]
}

/** One falling confetti piece, in the winner variant only. */
export interface ConfettiPiece {
  /** Horizontal start, as a percentage of the screen width. */
  readonly leftPct: number
  /** Horizontal drift over the fall, in pixels. */
  readonly driftPx: number
  /** Total rotation over the fall, in degrees. */
  readonly rotateDeg: number
  readonly durationMs: number
  readonly delayMs: number
  /** One of the four camp colours, as a CSS custom-property reference. */
  readonly color: string
  /** True for the round pieces — a third of them, for variety. */
  readonly round: boolean
}

const CAMP_COLORS = [
  'var(--asterix)',
  'var(--obelix)',
  'var(--caius)',
  'var(--caligula)',
] as const

const CONFETTI_COUNT = 24

/**
 * 24 deterministic pieces seeded by `gameId`. A plain LCG keeps this pure and
 * dependency-free; the ranges mirror the validated reference
 * (4–96 % across, ±40 px drift, ±330° spin, 1000–1420 ms fall, 1450–1830 ms
 * stagger, which lines up with the 1450 ms confetti phase).
 */
export function confettiPieces(gameId: string): readonly ConfettiPiece[] {
  let seed = hashText(gameId) || 1
  const next = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0x100000000
  }

  const pieces: ConfettiPiece[] = []
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    pieces.push({
      leftPct: Math.round((4 + next() * 92) * 100) / 100,
      driftPx: Math.round(next() * 80 - 40),
      rotateDeg: Math.round(next() * 660 - 330),
      durationMs: Math.round(1000 + next() * 420),
      delayMs: Math.round(1450 + next() * 380),
      color: CAMP_COLORS[i % CAMP_COLORS.length] ?? CAMP_COLORS[0],
      round: i % 3 === 0,
    })
  }
  return pieces
}

/** « VICTOIRE », one span per letter — the tracking is a translate, never letter-spacing. */
export const VICTORY_LETTERS = 'VICTOIRE'.split('')
