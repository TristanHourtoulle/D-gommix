import { and, eq, or, sql, friendships, gameEvents, gamePlayers, games, user } from '@degommix/db'
import type { CharacterId, GameFormat, GameOutcome } from '@degommix/game-core'
import { db } from '@/lib/db'

export interface LeaderboardRow {
  rank: number
  userId: string
  username: string
  wins: number
  /** Percentage 0-100, over village_reached games only (aborted excluded) */
  winrate: number
  villageGames: number
  degommages: number
  favoriteCharacter: CharacterId | null
}

export interface TopDegommeur {
  userId: string
  username: string
  degommages: number
}

export interface CharacterWinrate {
  character: CharacterId
  /** Percentage 0-100 */
  winrate: number
  games: number
}

export interface Leaderboard {
  rows: LeaderboardRow[]
  friendCount: number
  topDegommeur: TopDegommeur | null
  characterWinrates: CharacterWinrate[]
}

/** Parameterized `column IN (...)` for a non-empty string list. */
function inList<T>(column: T, values: string[]) {
  return sql`${column} in (${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  )})`
}

async function getCircleMemberIds(userId: string): Promise<string[]> {
  const pairs = await db
    .select({ low: friendships.userLow, high: friendships.userHigh })
    .from(friendships)
    .where(or(eq(friendships.userLow, userId), eq(friendships.userHigh, userId)))

  const ids = new Set<string>([userId])
  for (const pair of pairs) ids.add(pair.low === userId ? pair.high : pair.low)
  return [...ids]
}

/** Friends-circle leaderboard (me + my friends), stats per design §5.3. */
export async function getLeaderboard(userId: string): Promise<Leaderboard> {
  const memberIds = await getCircleMemberIds(userId)

  const finishedStarted = and(
    inList(gamePlayers.userId, memberIds),
    eq(games.status, 'finished'),
    sql`${games.startedAt} is not null`,
    sql`${gamePlayers.status} in ('joined', 'left')`
  )

  const [members, statRows, characterRows, seatRows] = await Promise.all([
    db.select({ id: user.id, username: user.username }).from(user).where(inList(user.id, memberIds)),
    db
      .select({
        userId: gamePlayers.userId,
        wins: sql`count(*) filter (where ${games.winnerId} = ${gamePlayers.userId})`.mapWith(Number),
        villageGames: sql`count(*) filter (where ${games.outcome} = 'village_reached')`.mapWith(
          Number
        ),
        degommages: sql`coalesce(sum(${gamePlayers.degommages}), 0)`.mapWith(Number),
      })
      .from(gamePlayers)
      .innerJoin(games, eq(games.id, gamePlayers.gameId))
      .where(finishedStarted)
      .groupBy(gamePlayers.userId),
    db
      .select({
        userId: gamePlayers.userId,
        character: gamePlayers.character,
        played: sql`count(*)`.mapWith(Number),
        lastPlayed: sql`extract(epoch from max(${games.startedAt}))`.mapWith(Number),
      })
      .from(gamePlayers)
      .innerJoin(games, eq(games.id, gamePlayers.gameId))
      .where(and(finishedStarted, sql`${gamePlayers.character} is not null`))
      .groupBy(gamePlayers.userId, gamePlayers.character),
    db
      .select({
        character: gamePlayers.character,
        games: sql`count(*)`.mapWith(Number),
        wins: sql`count(*) filter (where ${games.winnerId} = ${gamePlayers.userId})`.mapWith(
          Number
        ),
      })
      .from(gamePlayers)
      .innerJoin(games, eq(games.id, gamePlayers.gameId))
      .where(
        and(
          inList(gamePlayers.userId, memberIds),
          eq(games.status, 'finished'),
          eq(games.outcome, 'village_reached'),
          sql`${gamePlayers.status} in ('joined', 'left')`,
          sql`${gamePlayers.character} is not null`
        )
      )
      .groupBy(gamePlayers.character),
  ])

  // Favorite character: most played, tie broken by most recently played
  const favorites = new Map<string, { character: CharacterId; played: number; lastPlayed: number }>()
  for (const row of characterRows) {
    if (row.character === null) continue
    const current = favorites.get(row.userId)
    const beats =
      !current ||
      row.played > current.played ||
      (row.played === current.played && row.lastPlayed > current.lastPlayed)
    if (beats) {
      favorites.set(row.userId, {
        character: row.character,
        played: row.played,
        lastPlayed: row.lastPlayed,
      })
    }
  }

  const statsById = new Map(statRows.map((row) => [row.userId, row]))
  const unranked = members.map((member) => {
    const stats = statsById.get(member.id)
    const wins = stats?.wins ?? 0
    const villageGames = stats?.villageGames ?? 0
    return {
      userId: member.id,
      username: member.username ?? 'Inconnu',
      wins,
      villageGames,
      winrate: villageGames > 0 ? Math.round((wins / villageGames) * 100) : 0,
      degommages: stats?.degommages ?? 0,
      favoriteCharacter: favorites.get(member.id)?.character ?? null,
    }
  })

  unranked.sort(
    (a, b) =>
      b.wins - a.wins ||
      b.winrate - a.winrate ||
      b.degommages - a.degommages ||
      a.username.localeCompare(b.username, 'fr')
  )
  const rows: LeaderboardRow[] = unranked.map((row, index) => ({ ...row, rank: index + 1 }))

  const best = [...rows].sort((a, b) => b.degommages - a.degommages)[0]
  const topDegommeur =
    best && best.degommages > 0
      ? { userId: best.userId, username: best.username, degommages: best.degommages }
      : null

  const characterWinrates: CharacterWinrate[] = seatRows
    .flatMap((row) =>
      row.character === null
        ? []
        : [
            {
              character: row.character,
              games: row.games,
              winrate: row.games > 0 ? Math.round((row.wins / row.games) * 100) : 0,
            },
          ]
    )
    .sort((a, b) => b.winrate - a.winrate || b.games - a.games)

  return { rows, friendCount: memberIds.length - 1, topDegommeur, characterWinrates }
}

export interface GameDetailPlayer {
  userId: string
  username: string
  character: CharacterId | null
  degommages: number
  isWinner: boolean
  hasLeft: boolean
}

export interface JournalEntry {
  seq: number
  at: Date
  text: string
}

export interface GameDetail {
  id: string
  status: 'lobby' | 'active' | 'finished'
  outcome: GameOutcome | null
  format: GameFormat
  startedAt: Date | null
  endedAt: Date | null
  winner: GameDetailPlayer | null
  totalDegommages: number
  players: GameDetailPlayer[]
  journal: JournalEntry[]
}

function payloadNumber(payload: unknown, key: string): number | null {
  if (payload !== null && typeof payload === 'object' && key in payload) {
    const value = (payload as Record<string, unknown>)[key]
    if (typeof value === 'number') return value
  }
  return null
}

function payloadString(payload: unknown, key: string): string | null {
  if (payload !== null && typeof payload === 'object' && key in payload) {
    const value = (payload as Record<string, unknown>)[key]
    if (typeof value === 'string') return value
  }
  return null
}

interface RawEvent {
  seq: number
  type: string
  actorId: string | null
  targetId: string | null
  payload: unknown
  createdAt: Date
}

function journalText(event: RawEvent, events: RawEvent[], name: (id: string | null) => string): string {
  switch (event.type) {
    case 'GAME_STARTED':
      return `${name(event.actorId)} a lancé la partie`
    case 'DEGOMMAGE':
      return `${name(event.actorId)} a dégommé ${name(event.targetId)}`
    case 'UNDO': {
      const targetSeq = payloadNumber(event.payload, 'targetSeq')
      const target = events.find((candidate) => candidate.seq === targetSeq)
      if (!target) return `${name(event.actorId)} a annulé un dégommage`
      return `${name(event.actorId)} a annulé le dégommage de ${name(target.actorId)} sur ${name(target.targetId)}`
    }
    case 'PLAYER_QUIT':
      return `${name(event.actorId)} a quitté la partie`
    case 'END_REQUESTED': {
      const kind = payloadString(event.payload, 'kind')
      if (kind === 'village')
        return `${name(event.actorId)} demande la fin de partie — village atteint par ${name(event.targetId)}`
      if (kind === 'abandon_individual') return `${name(event.actorId)} demande à abandonner la partie`
      return `${name(event.actorId)} demande l'arrêt de la partie`
    }
    case 'END_REJECTED': {
      const requestSeq = payloadNumber(event.payload, 'requestSeq')
      const request = events.find((candidate) => candidate.seq === requestSeq)
      if (request && request.actorId === event.actorId)
        return `${name(event.actorId)} a retiré sa demande de fin`
      return `${name(event.actorId)} a rejeté la demande de fin`
    }
    case 'END_VALIDATED':
      return `${name(event.actorId)} a validé la fin de partie`
    case 'GAME_AUTO_CLOSED':
      return 'Partie clôturée automatiquement après 24 h d’inactivité'
    default:
      return `Événement ${event.type}`
  }
}

/**
 * Full detail of a finished game, full timestamped journal included.
 * Returns null when the game does not exist or the viewer is neither a
 * participant nor a friend of a participant.
 */
export async function getGameDetail(gameId: string, viewerId: string): Promise<GameDetail | null> {
  const gameRows = await db
    .select({
      id: games.id,
      status: games.status,
      outcome: games.outcome,
      format: games.format,
      winnerId: games.winnerId,
      startedAt: games.startedAt,
      endedAt: games.endedAt,
    })
    .from(games)
    .where(eq(games.id, gameId))
  const game = gameRows[0]
  if (!game) return null

  const playerRows = await db
    .select({
      userId: gamePlayers.userId,
      username: user.username,
      character: gamePlayers.character,
      degommages: gamePlayers.degommages,
      status: gamePlayers.status,
    })
    .from(gamePlayers)
    .innerJoin(user, eq(user.id, gamePlayers.userId))
    .where(and(eq(gamePlayers.gameId, gameId), sql`${gamePlayers.status} in ('joined', 'left')`))

  const isParticipant = playerRows.some((row) => row.userId === viewerId)
  if (!isParticipant) {
    const pairChecks = playerRows.map((row) => {
      const [low, high] = row.userId < viewerId ? [row.userId, viewerId] : [viewerId, row.userId]
      return and(eq(friendships.userLow, low), eq(friendships.userHigh, high))
    })
    if (pairChecks.length === 0) return null
    const friendRows = await db
      .select({ low: friendships.userLow })
      .from(friendships)
      .where(or(...pairChecks))
      .limit(1)
    if (friendRows.length === 0) return null
  }

  const eventRows: RawEvent[] = await db
    .select({
      seq: gameEvents.seq,
      type: gameEvents.type,
      actorId: gameEvents.actorId,
      targetId: gameEvents.targetId,
      payload: gameEvents.payload,
      createdAt: gameEvents.createdAt,
    })
    .from(gameEvents)
    .where(eq(gameEvents.gameId, gameId))
    .orderBy(gameEvents.seq)

  const usernames = new Map(playerRows.map((row) => [row.userId, row.username ?? 'Inconnu']))
  const name = (id: string | null): string =>
    id === null ? 'Quelqu’un' : (usernames.get(id) ?? 'Joueur inconnu')

  const players: GameDetailPlayer[] = playerRows.map((row) => ({
    userId: row.userId,
    username: row.username ?? 'Inconnu',
    character: row.character,
    degommages: row.degommages,
    isWinner: row.userId === game.winnerId,
    hasLeft: row.status === 'left',
  }))
  players.sort((a, b) => Number(b.isWinner) - Number(a.isWinner) || b.degommages - a.degommages)

  return {
    id: game.id,
    status: game.status,
    outcome: game.outcome,
    format: game.format as GameFormat,
    startedAt: game.startedAt,
    endedAt: game.endedAt,
    winner: players.find((player) => player.isWinner) ?? null,
    totalDegommages: players.reduce((sum, player) => sum + player.degommages, 0),
    players,
    journal: eventRows.map((event) => ({
      seq: event.seq,
      at: event.createdAt,
      text: journalText(event, eventRows, name),
    })),
  }
}
