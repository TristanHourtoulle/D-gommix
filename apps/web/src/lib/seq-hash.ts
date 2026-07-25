/**
 * 32-bit integer finalizer used to derive presentation choices from an event's
 * `seq` (the authoritative sequence number attributed by the ws-server).
 *
 * Why not `Math.random()`: game state is replicated, so two phones looking at
 * the same event must render the same thing. `seq` is the only value that is
 * unique, shared, and stable across reloads and late resyncs, so every
 * per-event random-looking choice in the app is a pure function of it.
 *
 * The mix is the well-known xor-shift/multiply finalizer; it is not a
 * cryptographic hash and must never be used as one.
 */
export function hashSeq(seq: number): number {
  let h = Math.trunc(seq) | 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return (h ^ (h >>> 16)) >>> 0
}
