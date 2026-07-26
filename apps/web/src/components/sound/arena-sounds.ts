/**
 * Pure policy of « Les sons de l’arène ». Nothing here touches a browser
 * global, so the whole decision layer is unit-tested in the node environment
 * while `sound-player.ts` keeps every Web Audio call.
 */

export const ARENA_SOUND_IDS = ['ouch', 'paf', 'fanfare'] as const

export type ArenaSoundId = (typeof ARENA_SOUND_IDS)[number]

export interface ArenaSound {
  /** Public path — the samples ship in `apps/web/public/sounds/`. */
  readonly url: string
  /** Per-sound level, multiplied by MASTER_GAIN. */
  readonly gain: number
  /** A cue arriving sooner than this after the last play is DROPPED, never queued. */
  readonly minIntervalMs: number
}

/** Everything is played through this, so « modeste » is one number to change. */
export const MASTER_GAIN = 0.35

/**
 * The paf is fired 40 ms after the event, because `globals.css` starts the
 * `.hit-stamp` animation at `40ms` — the word and the sound must land together.
 * Retiming the stamp means retiming this.
 */
export const PAF_DELAY_MS = 40

export const ARENA_SOUNDS: Readonly<Record<ArenaSoundId, ArenaSound>> = {
  // The dégommage yelp. `gain: 1` because it is a voice recording whose RMS
  // sits well under the synthesised samples even at the same peak level.
  ouch: { url: '/sounds/ouch.m4a', gain: 1, minIntervalMs: 700 },
  paf: { url: '/sounds/paf.m4a', gain: 1, minIntervalMs: 200 },
  fanfare: { url: '/sounds/fanfare.m4a', gain: 0.8, minIntervalMs: 5000 },
}

export function shouldPlay(
  id: ArenaSoundId,
  nowMs: number,
  lastPlayedAtMs: number | null
): boolean {
  if (lastPlayedAtMs === null) return true
  return nowMs - lastPlayedAtMs >= ARENA_SOUNDS[id].minIntervalMs
}

/** The only three facts about the game state that can make a noise. */
export interface ArenaSnapshot {
  /**
   * `state.degommageLog.length`. Append-only — an UNDO adds to `undoneSeqs` and
   * never removes an entry — so "it grew" means "a new dégommage landed" and
   * never "somebody pressed Annuler". Same reasoning as `hit-fx.ts`.
   */
  readonly hitCount: number
  readonly finished: boolean
  readonly winnerId: string | null
}

export type ArenaCue = 'hit' | 'endgame' | 'none'

/**
 * What to play, given the previous observed snapshot and the current one.
 *
 * `previous === null` means this is the first snapshot this mount has seen: it
 * is a BASELINE, never an event. That single rule is what keeps history silent
 * — joining a game in progress, reloading mid-game, a `game:state_snapshot`
 * replay after a reconnection, or opening a finished game from the history.
 *
 * The endgame wins when both changed in one batch: the village falling is the
 * bigger event, and the two sounds would clash.
 */
export function soundCue(previous: ArenaSnapshot | null, current: ArenaSnapshot): ArenaCue {
  if (previous === null) return 'none'
  if (!previous.finished && current.finished && current.winnerId !== null) return 'endgame'
  if (current.hitCount > previous.hitCount) return 'hit'
  return 'none'
}
