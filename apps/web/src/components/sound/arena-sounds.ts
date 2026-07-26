/**
 * Pure policy of « Les sons de l’arène ». Nothing here touches a browser
 * global, so the whole decision layer is unit-tested in the node environment
 * while `sound-player.ts` keeps every Web Audio call.
 */

import { hashGameSeq } from '@/lib/seq-hash'

export const ARENA_SOUND_IDS = ['ouch-1', 'ouch-2', 'ouch-3', 'paf', 'fanfare'] as const

export type ArenaSoundId = (typeof ARENA_SOUND_IDS)[number]

export interface ArenaSound {
  /** Public path — the samples ship in `apps/web/public/sounds/`. */
  readonly url: string
  /** Per-sound level, multiplied by MASTER_GAIN. */
  readonly gain: number
  /** A cue arriving sooner than this after the last play is DROPPED, never queued. */
  readonly minIntervalMs: number
  /**
   * Sounds sharing a key share one minimum-interval clock. The three « ouch »
   * variants are one cue wearing three coats: throttling them separately would
   * let three yelps stack inside 200 ms just because the draw came out
   * different.
   */
  readonly throttleKey: string
}

/** Everything is played through this, so « modeste » is one number to change. */
export const MASTER_GAIN = 0.35

/**
 * The paf is fired 40 ms after the event, because `globals.css` starts the
 * `.hit-stamp` animation at `40ms` — the word and the sound must land together.
 * Retiming the stamp means retiming this.
 */
export const PAF_DELAY_MS = 40

/**
 * The three « ouch » variants, in draw order. They are RMS-matched to each
 * other on disk, so they share one `gain` and swapping between them changes the
 * yelp without changing the loudness.
 */
export const OUCH_IDS = ['ouch-1', 'ouch-2', 'ouch-3'] as const

export type OuchId = (typeof OUCH_IDS)[number]

const OUCH_GAIN = 1
const OUCH_MIN_INTERVAL_MS = 700

export const ARENA_SOUNDS: Readonly<Record<ArenaSoundId, ArenaSound>> = {
  'ouch-1': {
    url: '/sounds/ouch-1.m4a',
    gain: OUCH_GAIN,
    minIntervalMs: OUCH_MIN_INTERVAL_MS,
    throttleKey: 'ouch',
  },
  'ouch-2': {
    url: '/sounds/ouch-2.m4a',
    gain: OUCH_GAIN,
    minIntervalMs: OUCH_MIN_INTERVAL_MS,
    throttleKey: 'ouch',
  },
  'ouch-3': {
    url: '/sounds/ouch-3.m4a',
    gain: OUCH_GAIN,
    minIntervalMs: OUCH_MIN_INTERVAL_MS,
    throttleKey: 'ouch',
  },
  paf: { url: '/sounds/paf.m4a', gain: 1, minIntervalMs: 200, throttleKey: 'paf' },
  fanfare: { url: '/sounds/fanfare.m4a', gain: 0.8, minIntervalMs: 5000, throttleKey: 'fanfare' },
}

/**
 * Which yelp a given dégommage gets. Seeded by `gameId` and the event's `seq`
 * through the same `hashGameSeq` idiom as the journal sentence and the hit
 * onomatopée (`components/live/hit-fx.ts`), for the same reason: the state is
 * replicated, so « aléatoire » must mean "varied from hit to hit", never
 * "different on each phone". `Math.random()` would make the four players around
 * the table hear four different yelps for the same dégommage.
 */
export function pickOuch(gameId: string, seq: number): OuchId {
  return OUCH_IDS[hashGameSeq(gameId, seq) % OUCH_IDS.length] ?? OUCH_IDS[0]
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
