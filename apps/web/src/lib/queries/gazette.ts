import { and, eq, sql, gamePlayers, games } from '@degommix/db'
import { db } from '@/lib/db'
import type { GazetteCount } from '@/lib/gazette/facts'
import { gameStarted, inList } from './game-filters'

/**
 * « Fléau des Gaules en titre » among a game's own participants: the highest
 * all-time dégommage total over games that ended strictly BEFORE `before`.
 *
 * Scoped to the participants and NOT to the viewer's circle on purpose — two
 * players opening the same gazette must read the same parchment, and the
 * leaderboard's own top-dégommeur is circle-scoped (see getLeaderboard). The
 * `before` bound is what stops a past game's gazette from changing every time
 * somebody plays a new one; turning it into an all-time query would be a
 * regression, not an optimisation.
 *
 * Returns null on a tie or when nobody has any prior finished game.
 */
export async function getTitleHolder(
  participants: readonly { userId: string; username: string }[],
  before: Date | null
): Promise<GazetteCount | null> {
  if (participants.length === 0 || before === null) return null
  const ids = participants.map((participant) => participant.userId)

  const rows = await db
    .select({
      userId: gamePlayers.userId,
      degommages: sql`coalesce(sum(${gamePlayers.degommages}), 0)`.mapWith(Number),
    })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(
      and(
        inList(gamePlayers.userId, ids),
        eq(games.status, 'finished'),
        gameStarted,
        sql`${games.endedAt} < ${before}`
      )
    )
    .groupBy(gamePlayers.userId)

  const named = rows.flatMap((row) => {
    const participant = participants.find((candidate) => candidate.userId === row.userId)
    return participant && row.degommages > 0
      ? [{ userId: row.userId, username: participant.username, count: row.degommages }]
      : []
  })
  // Same total, engine-independent order as facts.ts, then the same
  // strictly-ahead rule: a tie is not a title.
  named.sort(
    (a, b) =>
      b.count - a.count ||
      (a.username === b.username ? 0 : a.username < b.username ? -1 : 1) ||
      (a.userId === b.userId ? 0 : a.userId < b.userId ? -1 : 1)
  )
  const first = named[0]
  if (!first) return null
  const second = named[1]
  if (second && second.count >= first.count) return null
  return first
}
