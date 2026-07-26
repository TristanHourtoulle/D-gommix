/**
 * « Duel » framing of a lobby: presentational only, derived client-side from
 * data the client already holds. Nothing is persisted — there is no duel flag
 * on a game, and the lobby payload (apps/web/src/lib/realtime-types.ts) knows
 * nothing about rivalries. Pure and dependency-free so it can be unit-tested
 * in the node vitest environment.
 */

/** Minimal seat shape — `LobbyPlayer` is assignable to it. */
export interface DuelSeat {
  userId: string
  username: string
}

/** Minimal lobby shape — `LobbyState` is assignable to it. */
export interface DuelLobby {
  format: number
  players: readonly DuelSeat[]
}

/** Minimal rivalry-pair shape — a `rivalryPairs` entry is assignable to it. */
export interface DuelPair {
  userId: string
  dealt: number
  taken: number
}

export interface DuelRival {
  userId: string
  username: string
  /** Non-undone dégommages the viewer dealt to this rival. */
  dealt: number
  /** Non-undone dégommages this rival dealt to the viewer. */
  taken: number
}

/**
 * The rival this lobby is a duel against, or null when it is not a duel.
 * A duel is a 2-seat lobby with exactly one other player (invited or joined —
 * the framing is about who is being called out, not who already answered)
 * whose feud with the viewer has at least one dégommage on either side.
 * `pairs` is undefined on a cold cache: no framing, never an error.
 */
export function findDuelRival(
  lobby: DuelLobby | null,
  meId: string,
  pairs: readonly DuelPair[] | undefined
): DuelRival | null {
  if (lobby === null || lobby.format !== 2 || pairs === undefined) return null

  const others = lobby.players.filter((player) => player.userId !== meId)
  const other = others.length === 1 ? others[0] : undefined
  if (other === undefined) return null

  const pair = pairs.find((entry) => entry.userId === other.userId)
  if (pair === undefined || pair.dealt + pair.taken === 0) return null

  return { userId: other.userId, username: other.username, dealt: pair.dealt, taken: pair.taken }
}
