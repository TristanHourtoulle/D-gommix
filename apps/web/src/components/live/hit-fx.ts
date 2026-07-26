import type { CharacterId, DegommageEntry } from '@degommix/game-core'
import { hashGameSeq } from '@/lib/seq-hash'

/**
 * Comic-book words, one set per camp: the dégommage takes the HITTER's flavor
 * (plan 042). Stored capitalised and rendered uppercase by `.hit-stamp` in
 * `globals.css`.
 *
 * The four sets are pairwise DISJOINT and that is load-bearing, not cosmetic:
 * the « never the same word twice in a row on one card » invariant is proven
 * inside a set by the rotation step below, and ACROSS sets by disjointness —
 * a Gaul hitting right after a Roman cannot repeat because no word is shared.
 * Adding a word to two camps would silently break the invariant for exactly
 * one pair of consecutive hits. A unit test guards it.
 *
 * This table is data: retuning a camp's words is a one-line edit and the picker
 * is size-agnostic. Recorded decisions — « Paf ! » is Astérix-only (it is the
 * sound of a fist, and the fist is his signature), and Astérix's shipped set of
 * six lost « Ouch ! » to the fleeing legionary and « Boum ! » to the menhir.
 */
export const HIT_ONOMATOPEES_BY_CAMP: Record<CharacterId, readonly string[]> = {
  asterix: ['Paf !', 'Bam !', 'Tchac !', 'Vlan !'],
  obelix: ['Boum !', 'Bong !', 'Craac !', 'Badaboum !'],
  caius_bonus: ['Zing !', 'Tac !', 'Ratatac !', 'Frrrt !'],
  caligula_minus: ['Ouch !', 'Ouille !', 'Frouuu !', 'Floof !'],
}

/** Every word of every camp, flattened — the disjointness guard reads this. */
export const HIT_ONOMATOPEES: readonly string[] = Object.values(HIT_ONOMATOPEES_BY_CAMP).flat()

/**
 * Camp used when the actor of a hit cannot be resolved — a truncated resync, a
 * log entry whose actor left before this client ever saw them. Astérix is the
 * combo that shipped in plan 011, so degrading lands on known-good behaviour
 * rather than on nothing.
 */
export const HIT_CAMP_FALLBACK: CharacterId = 'asterix'

/** Minimal shape `hitByTarget` needs from a seat — `PlayerState` satisfies it. */
export interface HitActor {
  readonly character: CharacterId
}

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
  /**
   * Camp of the player who landed that hit — the variant selector. Read by
   * `data-hit-camp` on the card root; the keyframes live in `globals.css`.
   * The HITTER's camp, never the target's: the card being struck is tinted by
   * its own `--camp`, and the two must not be confused.
   */
  readonly camp: CharacterId
}

/**
 * Picks the onomatopée for a hit, inside the hitter's own set. Seeded by the
 * game id and the event's `seq` so every phone stamps the same word on the same
 * card at the same moment while two games do not open on the same stamp (see
 * `seq-hash.ts`), and rotated by a non-zero step away from the card's previous
 * word so a repeat is impossible by construction rather than by luck.
 *
 * The previous *word* is the input, not the previous `seq`: the word shown for
 * a hit depends on the whole chain before it, so no function of two seqs alone
 * can tell whether it is about to repeat.
 */
export function pickOnomatopee(
  gameId: string,
  seq: number,
  previousWord: string | null,
  camp: CharacterId
): string {
  const words = HIT_ONOMATOPEES_BY_CAMP[camp]
  const hash = hashGameSeq(gameId, seq)
  const previousIndex =
    previousWord === null ? -1 : words.findIndex((word) => word === previousWord)
  // Unknown previous word: it belongs to another camp, so no rotation is
  // needed — disjointness already makes a repeat impossible.
  if (previousIndex < 0) return words[hash % words.length] ?? words[0] ?? ''
  const step = 1 + (hash % (words.length - 1))
  return words[(previousIndex + step) % words.length] ?? words[0] ?? ''
}

/**
 * Folds the game's dégommage log into a `targetId → TargetHit` lookup. Pure and
 * cheap: a live game holds a few dozen entries at most. The onomatopée and the
 * camp are resolved here, during the fold, because the word is a function of the
 * card's whole hit chain — the same log and the same seats yield the same words
 * and the same variants on every phone and after a reload.
 *
 * `actors` is the game's `players` map: `entry.actorId` is resolved against it
 * so the hit carries the HITTER's camp. Nothing new is transmitted or
 * persisted — every client already holds both halves.
 */
export function hitByTarget(
  gameId: string,
  log: readonly DegommageEntry[],
  actors: Readonly<Record<string, HitActor | undefined>>
): Record<string, TargetHit> {
  const hits: Record<string, TargetHit> = {}
  for (const entry of log) {
    const current = hits[entry.targetId]
    const camp = actors[entry.actorId]?.character ?? HIT_CAMP_FALLBACK
    hits[entry.targetId] = {
      count: current ? current.count + 1 : 1,
      seq: entry.seq,
      word: pickOnomatopee(gameId, entry.seq, current ? current.word : null, camp),
      camp,
    }
  }
  return hits
}

/** `"a"` or `"b"`, flipped by every new hit so the CSS animations restart. */
export function hitPhase(hit: TargetHit | undefined): 'a' | 'b' | undefined {
  if (!hit) return undefined
  return hit.count % 2 === 0 ? 'a' : 'b'
}
