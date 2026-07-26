/**
 * 32-bit seed used to derive presentation choices (journal sentence, hit
 * onomatopée) from the game they belong to and the event's `seq` (the
 * authoritative sequence number attributed by the ws-server).
 *
 * Why not `Math.random()`: game state is replicated, so two phones looking at
 * the same event must render the same text. `gameId` and `seq` are the only
 * values that are shared, unique within their scope, and stable across reloads
 * and late resyncs, so every per-event random-looking choice in the app is a
 * pure function of that pair.
 *
 * Why `seq` alone is not enough: dégommages always land on the same handful of
 * low seqs, so seeding on `seq` only made every game replay the same sentences
 * in the same order — the rare tones of the catalog (weights 4–9 against 26)
 * were essentially never drawn. Folding the game id into the seed gives each
 * game its own sequence of picks, while keeping both determinism guarantees
 * intact: same game + same seq → same text, on every phone, forever.
 *
 * The mix is FNV-1a over the id folded into the well-known xor-shift/multiply
 * finalizer; it is not a cryptographic hash and must never be used as one.
 */

/** FNV-1a over the UTF-16 code units of `value`, as an unsigned 32-bit int. */
function fnv1a32(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Seed of the choice made for event `seq` of game `gameId`. */
export function hashGameSeq(gameId: string, seq: number): number {
  let h = (fnv1a32(gameId) ^ Math.imul(Math.trunc(seq) | 0, 0x27d4eb2d)) | 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return (h ^ (h >>> 16)) >>> 0
}
