import { and, eq, sql, gamePlayers, games, user } from '@degommix/db'
import type { CharacterId, GameFormat } from '@degommix/game-core'
import { db } from '@/lib/db'
import { gameStarted } from './game-filters'

export type HomeGameResult = 'won' | 'lost' | 'aborted'

export interface HomeGameParticipant {
  username: string
  avatarId?: string | null
  character: CharacterId | null
}

export interface HomeGame {
  id: string
  myResult: HomeGameResult
  winnerUsername: string | null
  winnerAvatarId?: string | null
  format: GameFormat
  durationSec: number | null
  endedAt: Date | null
  participants: HomeGameParticipant[]
}

export interface HomeStats {
  wins: number
  degommages: number
  favoriteCharacter: CharacterId | null
}

export interface ActiveGame {
  gameId: string
  status: 'lobby' | 'active'
  format: GameFormat
  characters: CharacterId[]
}

export function toGameFormat(value: number): GameFormat {
  if (value === 2 || value === 3 || value === 4) return value
  throw new Error(`Invalid game format: ${value}`)
}

/**
 * Home stat tiles, design §5.3: wins = finished games won; degommages =
 * non-undone total across ALL finished games (aborted included, via the
 * denormalized game_players counter); favorite = most played character in
 * started finished games, ties broken by the most recent one.
 * Lobbies dissolved before the start never count anywhere (see ./game-filters).
 */
export async function getHomeStats(userId: string): Promise<HomeStats> {
  const [winRows, degommageRows, favoriteRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(games)
      .where(and(eq(games.winnerId, userId), eq(games.status, 'finished'), gameStarted)),
    db
      .select({ total: sql<number>`coalesce(sum(${gamePlayers.degommages}), 0)::int` })
      .from(gamePlayers)
      .innerJoin(games, eq(games.id, gamePlayers.gameId))
      .where(and(eq(gamePlayers.userId, userId), eq(games.status, 'finished'), gameStarted)),
    db
      .select({ character: gamePlayers.character })
      .from(gamePlayers)
      .innerJoin(games, eq(games.id, gamePlayers.gameId))
      .where(
        and(
          eq(gamePlayers.userId, userId),
          eq(games.status, 'finished'),
          gameStarted,
          sql`${gamePlayers.character} is not null`,
        ),
      )
      .groupBy(gamePlayers.character)
      .orderBy(sql`count(*) desc, max(${games.startedAt}) desc`)
      .limit(1),
  ])

  return {
    wins: winRows[0]?.count ?? 0,
    degommages: degommageRows[0]?.total ?? 0,
    favoriteCharacter: favoriteRows[0]?.character ?? null,
  }
}

/** Current lobby/active game the user is joined in, for the resume banner. */
export async function getActiveGame(userId: string): Promise<ActiveGame | null> {
  const rows = await db
    .select({ id: games.id, status: games.status, format: games.format })
    .from(games)
    .innerJoin(gamePlayers, eq(gamePlayers.gameId, games.id))
    .where(
      and(
        eq(gamePlayers.userId, userId),
        eq(gamePlayers.status, 'joined'),
        sql`${games.status} in ('lobby', 'active')`,
      ),
    )
    .orderBy(sql`${games.lastActivityAt} desc`)
    .limit(1)

  const row = rows[0]
  if (!row || row.status === 'finished') return null

  const seats = await db
    .select({ character: gamePlayers.character })
    .from(gamePlayers)
    .where(
      and(eq(gamePlayers.gameId, row.id), sql`${gamePlayers.status} in ('invited', 'joined')`),
    )

  return {
    gameId: row.id,
    status: row.status,
    format: toGameFormat(row.format),
    characters: seats
      .map((seat) => seat.character)
      .filter((character): character is CharacterId => character !== null),
  }
}

/**
 * My most recent *played* games, newest first — the home payload keeps the
 * default cap of 20, the full-history page (/parties) asks for more.
 * Lobbies dissolved before the start are finished/aborted rows too, but they
 * are never games: `gameStarted` keeps them out (see ./game-filters).
 */
export async function getLastGames(userId: string, limit = 20): Promise<HomeGame[]> {
  const gameRows = await db
    .select({
      id: games.id,
      outcome: games.outcome,
      winnerId: games.winnerId,
      winnerUsername: user.username,
      winnerAvatarId: user.avatarId,
      format: games.format,
      startedAt: games.startedAt,
      endedAt: games.endedAt,
    })
    .from(games)
    .innerJoin(gamePlayers, eq(gamePlayers.gameId, games.id))
    .leftJoin(user, eq(user.id, games.winnerId))
    .where(
      and(
        eq(gamePlayers.userId, userId),
        sql`${gamePlayers.status} in ('joined', 'left')`,
        eq(games.status, 'finished'),
        gameStarted,
      ),
    )
    .orderBy(sql`${games.endedAt} desc nulls last`)
    .limit(limit)

  if (gameRows.length === 0) return []

  const gameIdList = sql.join(
    gameRows.map((row) => sql`${row.id}`),
    sql`, `,
  )
  const participantRows = await db
    .select({
      gameId: gamePlayers.gameId,
      username: user.username,
      avatarId: user.avatarId,
      character: gamePlayers.character,
    })
    .from(gamePlayers)
    .innerJoin(user, eq(user.id, gamePlayers.userId))
    .where(
      and(
        sql`${gamePlayers.gameId} in (${gameIdList})`,
        sql`${gamePlayers.status} in ('joined', 'left')`,
      ),
    )
    .orderBy(sql`${gamePlayers.joinedAt} asc nulls last`)

  const participantsByGame = new Map<string, HomeGameParticipant[]>()
  for (const row of participantRows) {
    const list = participantsByGame.get(row.gameId) ?? []
    list.push({ username: row.username ?? '?', avatarId: row.avatarId, character: row.character })
    participantsByGame.set(row.gameId, list)
  }

  return gameRows.map((row) => {
    const durationSec =
      row.startedAt && row.endedAt
        ? Math.max(0, Math.round((row.endedAt.getTime() - row.startedAt.getTime()) / 1000))
        : null
    const wonOrLost: HomeGameResult = row.winnerId === userId ? 'won' : 'lost'

    return {
      id: row.id,
      myResult: row.outcome === 'aborted' ? 'aborted' : wonOrLost,
      winnerUsername: row.winnerUsername,
      winnerAvatarId: row.winnerAvatarId,
      format: toGameFormat(row.format),
      durationSec,
      endedAt: row.endedAt,
      participants: participantsByGame.get(row.id) ?? [],
    }
  })
}
