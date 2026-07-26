import type { DegommageEntry } from '@degommix/game-core'
import { hashGameSeq } from '@/lib/seq-hash'

/**
 * The six comic-book words that stamp over a struck card. Stored capitalised
 * and rendered uppercase by `.hit-stamp` in `globals.css`.
 */
export const HIT_ONOMATOPEES = ['Paf !', 'Bam !', 'Tchac !', 'Vlan !', 'Ouch !', 'Boum !'] as const

/** What a player's card needs to know about the last hit it took. */
export interface TargetHit {
  /**
   * Monotonic number of dégommages aimed at this player. Counts undone ones on
   * purpose: `degommageLog` is append-only (an UNDO only adds the seq to
   * `undoneSeqs`), so this value never goes down — which is exactly what makes
   * "the parity changed" mean "a new hit landed" and never "somebody undid".
   */
  readonly count: number
  /** `seq` of the most recent hit — the seed of the onomatopée. */
  readonly seq: number
  /** Onomatopée stamped for that hit, never the same as the card's previous one. */
  readonly word: string
}

/**
 * Picks the onomatopée for a hit. Seeded by the game id and the event's `seq`
 * so every phone stamps the same word on the same card at the same moment
 * while two games do not open on the same stamp (see `seq-hash.ts`), and
 * rotated by a non-zero step away from the card's previous word so a repeat is
 * impossible by construction rather than by luck.
 *
 * The previous *word* is the input, not the previous `seq`: the word shown for
 * a hit depends on the whole chain before it, so no function of two seqs alone
 * can tell whether it is about to repeat.
 */
export function pickOnomatopee(gameId: string, seq: number, previousWord: string | null): string {
  const hash = hashGameSeq(gameId, seq)
  const previousIndex =
    previousWord === null ? -1 : HIT_ONOMATOPEES.findIndex((word) => word === previousWord)
  if (previousIndex < 0) return HIT_ONOMATOPEES[hash % HIT_ONOMATOPEES.length] ?? HIT_ONOMATOPEES[0]
  const step = 1 + (hash % (HIT_ONOMATOPEES.length - 1))
  return HIT_ONOMATOPEES[(previousIndex + step) % HIT_ONOMATOPEES.length] ?? HIT_ONOMATOPEES[0]
}

/**
 * Folds the game's dégommage log into a `targetId → TargetHit` lookup. Pure and
 * cheap: a live game holds a few dozen entries at most. The onomatopée is
 * resolved here, during the fold, because it is a function of the card's whole
 * hit chain — the same log yields the same words on every phone and after a
 * reload.
 */
export function hitByTarget(
  gameId: string,
  log: readonly DegommageEntry[]
): Record<string, TargetHit> {
  const hits: Record<string, TargetHit> = {}
  for (const entry of log) {
    const current = hits[entry.targetId]
    hits[entry.targetId] = {
      count: current ? current.count + 1 : 1,
      seq: entry.seq,
      word: pickOnomatopee(gameId, entry.seq, current ? current.word : null),
    }
  }
  return hits
}

/** `"a"` or `"b"`, flipped by every new hit so the CSS animations restart. */
export function hitPhase(hit: TargetHit | undefined): 'a' | 'b' | undefined {
  if (!hit) return undefined
  return hit.count % 2 === 0 ? 'a' : 'b'
}
