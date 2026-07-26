/**
 * Whitelist of taunt ids the relay accepts. Ids only, on purpose: no French
 * copy ever crosses the wire, so a hostile client cannot push arbitrary text
 * onto the other players' phones — it can only name one of these eight lines,
 * whose wording lives in `apps/web/src/components/live/taunts.ts`.
 *
 * Deliberately duplicated with the web list rather than shared through
 * `@degommix/game-core`: taunts are ephemeral decoration and must stay out of
 * the game protocol (see `plans/029-live-taunts.md`). Keep both lists in sync.
 */
export const TAUNT_IDS = [
  'crazy_romans',
  'you_tremble',
  'is_that_all_rome',
  'menhir_faster',
  'drink_the_potion',
  'idefix_plays_better',
  'stable_awaits',
  'by_toutatis',
] as const

export type TauntId = (typeof TAUNT_IDS)[number]

/** One taunt per player per minute — a game rule, not a flood guard. */
export const TAUNT_COOLDOWN_MS = 60_000
