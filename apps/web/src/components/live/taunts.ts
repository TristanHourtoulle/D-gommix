/**
 * The eight taunts of « Balance une vanne » — owner-validated copy, do not
 * reword. Purely decorative: a taunt is relayed over the socket, stamped for
 * 1.6 s on every phone of the table and forgotten. It is never persisted,
 * never journaled and never seen by the game reducer.
 *
 * Ids mirror `apps/ws-server/src/taunts.ts`, which whitelists them server-side.
 */
export interface Taunt {
  readonly id: TauntId
  readonly text: string
}

export type TauntId =
  | 'crazy_romans'
  | 'you_tremble'
  | 'is_that_all_rome'
  | 'menhir_faster'
  | 'drink_the_potion'
  | 'idefix_plays_better'
  | 'stable_awaits'
  | 'by_toutatis'

export const TAUNTS: readonly Taunt[] = [
  { id: 'crazy_romans', text: 'Ils sont fous ces Romains !' },
  { id: 'you_tremble', text: 'Tu trembles, Romain ?' },
  { id: 'is_that_all_rome', text: 'C’est tout ce que Rome envoie ?' },
  { id: 'menhir_faster', text: 'Mon menhir court plus vite que tes pions' },
  { id: 'drink_the_potion', text: 'Reviens quand tu auras bu la potion' },
  { id: 'idefix_plays_better', text: 'Même Idéfix joue mieux' },
  { id: 'stable_awaits', text: 'L’écurie t’attend, plein sabot' },
  { id: 'by_toutatis', text: 'Par Toutatis, quel carnage annoncé' },
]

/** One taunt per player per minute — mirrors the ws-server cooldown. */
export const TAUNT_COOLDOWN_MS = 60_000

/**
 * Hold before the picker opens. Shorter than the dev menu's 1500 ms (this is a
 * gameplay gesture, not a hidden door) but well above a deliberate tap, so the
 * dégommage taps of « Tape le portrait » never reach it.
 */
export const TAUNT_LONG_PRESS_MS = 600

/** How long the stamp stays on screen before it clears itself. */
export const TAUNT_DISPLAY_MS = 1600

const TAUNT_IDS: ReadonlySet<string> = new Set(TAUNTS.map((taunt) => taunt.id))

/** True when `value` is one of the eight known ids (an unknown id is ignored). */
export function isTauntId(value: string): value is TauntId {
  return TAUNT_IDS.has(value)
}

/** The French line of a taunt, or `null` for an id this client does not know. */
export function tauntText(id: string): string | null {
  return TAUNTS.find((taunt) => taunt.id === id)?.text ?? null
}

/**
 * Milliseconds left on the local cooldown. `lastSentAt` is `null` before the
 * first taunt of the game. Never negative.
 */
export function tauntCooldownRemaining(
  lastSentAt: number | null,
  now: number,
  cooldownMs: number = TAUNT_COOLDOWN_MS
): number {
  if (lastSentAt === null) return 0
  return Math.max(0, lastSentAt + cooldownMs - now)
}

/** Whole seconds left, rounded UP — what the « Encore N s » toast shows. */
export function cooldownSecondsLeft(remainingMs: number): number {
  return Math.ceil(Math.max(0, remainingMs) / 1000)
}
