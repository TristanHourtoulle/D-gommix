/**
 * « La Cote du guerrier » — an Elo rating in sesterces, recomputed at read
 * time from the circle's finished village games (plan 043). PURE and
 * RETROACTIVE BY CONSTRUCTION: no table, no migration, no cache. The day a
 * rule here changes, the whole history is re-scored coherently on the next
 * page load — there is no second code path (compare plan 033's seals, whose
 * retroactive replay needed the PR #75 cursor fix).
 *
 * Deliberately range-free: the windowed range type and month predicate of
 * queries/leaderboard-range.ts must never reach this file — the cote is
 * all-time by construction, like the Palmarès (plan 026) and the titles
 * (plan 032).
 */

/** Sesterces every warrior starts with — and the circle's permanent mean. */
export const COTE_BASE = 1000

/**
 * Maximum sesterces one pairwise duel can move. 32 is the classic chess-club
 * value and the right order of magnitude for a friends circle that plays tens
 * of games, not thousands: an even 1v1 moves ±16 (visible at the table) and
 * ~20 games still dominate any single evening. Because the rating is a
 * read-time fold, changing this constant is free and retroactive.
 */
export const COTE_K = 32

/** Elo scale: a 400-sesterce gap means 10:1 expected odds. Not a tunable. */
export const COTE_SCALE = 400

/** Below this many rated games the UI prints « — » instead of a figure. */
export const COTE_MIN_GAMES = 3

/**
 * One circle seat of one finished village game. Structurally satisfied by
 * `VillageResultRow` (queries/records.ts), so the fold consumes the shared
 * all-time scan with no mapping layer — same trick as `StreakGameResult`.
 */
export interface CoteGameResult {
  gameId: string
  userId: string
  won: boolean
}

export interface CoteEntry {
  userId: string
  /** Rounded sesterces — the figure the card prints. */
  cote: number
  /** Rated village games behind that figure (all-time, never windowed). */
  games: number
  /** Rounded change on this player's most recent rated game (0 when flat). */
  trend: number
}

/** Elo expectation of `ratingA` against `ratingB`. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / COTE_SCALE))
}

export interface CoteGame {
  /** Every rated participant of the game, deduped; includes the winner. */
  participantIds: readonly string[]
  winnerId: string
}

/**
 * One game's simultaneous pairwise update, returned as a NEW map (the input is
 * never mutated). Every expectation is read from the pre-game ratings, so the
 * order in which the duels are resolved cannot change the result. The exchange
 * is exactly zero-sum: the winner gains the sum of what the losers lose, and
 * losers exchange nothing with each other — nothing happened between them.
 */
export function applyGame(
  ratings: ReadonlyMap<string, number>,
  game: CoteGame
): Map<string, number> {
  const pre = (userId: string): number => ratings.get(userId) ?? COTE_BASE
  const next = new Map(ratings)
  for (const userId of game.participantIds) next.set(userId, pre(userId))

  const preWinner = pre(game.winnerId)
  let winnerGain = 0
  for (const opponentId of game.participantIds) {
    if (opponentId === game.winnerId) continue
    const preOpponent = pre(opponentId)
    const gain = COTE_K * (1 - expectedScore(preWinner, preOpponent))
    winnerGain += gain
    next.set(opponentId, preOpponent - gain)
  }
  next.set(game.winnerId, preWinner + winnerGain)
  return next
}

/**
 * Cotes of every rated player, folded over the circle's village history.
 *
 * INPUT ORDER IS THE CONTRACT: rows come newest-first in the
 * `(ended_at desc, id desc)` order of `queryVillageResults` — the exact
 * reverse of the `(ended_at asc, id asc)` replay order PR #75 established for
 * apps/ws-server/src/backfill-seals.ts. The fold reverses to oldest-first
 * before scoring, like `computeComebackWinners` does: unlike a run of wins, a
 * rating is direction-sensitive. `games.id` is not decoration — without it two
 * games sharing an `ended_at` could come back in either order and two page
 * loads could print two different cotes.
 *
 * A game whose winner is not among the returned seats was won by someone
 * outside the viewer's circle (design §4: stats are circle-scoped, never
 * app-global). It is SKIPPED, not counted as a loss: there is no rated winner
 * to transfer sesterces from.
 *
 * Aborted games never reach this function — the caller filters on
 * `outcome = 'village_reached'` (SPECS.md:126), so a 24 h zombie auto-close
 * costs nobody anything.
 */
export function computeCotes(resultsNewestFirst: readonly CoteGameResult[]): CoteEntry[] {
  // A Map preserves insertion order, so the groups come out in row order.
  const byGame = new Map<string, CoteGameResult[]>()
  for (const result of resultsNewestFirst) {
    const seats = byGame.get(result.gameId)
    if (seats === undefined) byGame.set(result.gameId, [result])
    else seats.push(result)
  }

  let ratings: ReadonlyMap<string, number> = new Map<string, number>()
  const gameCounts = new Map<string, number>()
  const trends = new Map<string, number>()

  // Oldest-first: a rating is direction-sensitive, unlike a run of wins.
  for (const seats of [...byGame.values()].reverse()) {
    const participantIds = [...new Set(seats.map((seat) => seat.userId))]
    const winnerId = seats.find((seat) => seat.won)?.userId
    // No rated winner (outsider win), or nobody to play against: not a verdict.
    if (winnerId === undefined || participantIds.length < 2) continue

    const post = applyGame(ratings, { participantIds, winnerId })
    for (const userId of participantIds) {
      gameCounts.set(userId, (gameCounts.get(userId) ?? 0) + 1)
      // The last game a player appears in wins — exactly « vs previous game ».
      trends.set(userId, (post.get(userId) ?? COTE_BASE) - (ratings.get(userId) ?? COTE_BASE))
    }
    ratings = post
  }

  // Round only here: rounding inside the fold would compound.
  return [...ratings.entries()]
    .map(([userId, rating]) => ({
      userId,
      cote: Math.round(rating),
      games: gameCounts.get(userId) ?? 0,
      trend: Math.round(trends.get(userId) ?? 0),
    }))
    .sort((a, b) => b.cote - a.cote || a.userId.localeCompare(b.userId))
}
