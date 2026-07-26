import {
  and,
  canonicalPair,
  eq,
  or,
  sql,
  friendships,
  gameEvents,
  gamePlayers,
  games,
  user,
} from '@degommix/db'
import type { CharacterId, GameFormat, GameOutcome } from '@degommix/game-core'
import { db } from '@/lib/db'
import { buildPerCharacter, type CharacterStat } from '@/lib/character-stats'
import { deriveGazetteFacts, type GazetteFacts } from '@/lib/gazette/facts'
import {
  buildGameJournal,
  buildSummaryStamp,
  deriveAbortReason,
  type GameAbortReason,
  type JournalEntry,
  type RawEvent,
} from './game-detail-journal'
import type { StampId } from '@/lib/game-stamps'
import { gameStarted, inList, isPhantomLobbyGame } from './game-filters'
import { getCircleRecords, queryVillageResults, type CircleRecords } from './records'
import { computeCurrentStreaks } from './streaks'

export type { GameAbortReason, JournalEntry } from './game-detail-journal'

export interface LeaderboardRow {
  rank: number
  userId: string
  username: string
  avatarId?: string | null
  wins: number
  /** Percentage 0-100, over village_reached games only (aborted excluded) */
  winrate: number
  villageGames: number
  degommages: number
  /**
   * Consecutive village_reached wins, newest first by endedAt; aborted games
   * are neutral (design §5.3). Always all-time — never windowed. The server
   * always sets it; optional only so old PWA-cached wire payloads (which
   * predate the field, same convention as `avatarId`) stay assignable.
   */
  currentStreak?: number
  favoriteCharacter: CharacterId | null
  /**
   * Per-character record, most played first. The server always sets it;
   * optional only so old PWA-cached wire payloads stay assignable (same
   * convention as `currentStreak`).
   */
  perCharacter?: CharacterStat[]
}

export interface TopDegommeur {
  userId: string
  username: string
  avatarId?: string | null
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
  /** All-time « Palmarès » — never windowed by `range` (plan 026). */
  records: CircleRecords
}

export async function getCircleMemberIds(userId: string): Promise<string[]> {
  const pairs = await db
    .select({ low: friendships.userLow, high: friendships.userHigh })
    .from(friendships)
    .where(or(eq(friendships.userLow, userId), eq(friendships.userHigh, userId)))

  const ids = new Set<string>([userId])
  for (const pair of pairs) ids.add(pair.low === userId ? pair.high : pair.low)
  return [...ids]
}

export interface LeaderboardRange {
  /** Count only games with `ended_at >= from`. Omit for all-time. */
  from?: Date
  /** Exclusive upper bound: `ended_at < to`. Omit for month-to-date/all-time. */
  to?: Date
}

/** `ended_at` window filters for a leaderboard range (empty for all-time). */
function endedInWindow(range: LeaderboardRange) {
  return [
    ...(range.from === undefined ? [] : [sql`${games.endedAt} >= ${range.from}`]),
    ...(range.to === undefined ? [] : [sql`${games.endedAt} < ${range.to}`]),
  ]
}

/** One circle member's aggregate line, before ranks are assigned. */
export interface CircleStanding {
  userId: string
  username: string
  avatarId: string | null
  wins: number
  villageGames: number
  winrate: number
  degommages: number
}

/**
 * Ranking order of the village (design §5.3), shared by the full leaderboard
 * and the viewer's rank chip so the two can never disagree.
 */
export function compareStandings(a: CircleStanding, b: CircleStanding): number {
  return (
    b.wins - a.wins ||
    b.winrate - a.winrate ||
    b.degommages - a.degommages ||
    a.username.localeCompare(b.username, 'fr')
  )
}

/** Finished, actually-started games of the circle, phantom lobbies excluded. */
function circleFinishedStarted(memberIds: string[], range: LeaderboardRange = {}) {
  return and(
    inList(gamePlayers.userId, memberIds),
    eq(games.status, 'finished'),
    gameStarted,
    sql`${gamePlayers.status} in ('joined', 'left')`,
    ...endedInWindow(range)
  )
}

function queryCircleMembers(memberIds: string[]) {
  return db
    .select({ id: user.id, username: user.username, avatarId: user.avatarId })
    .from(user)
    .where(inList(user.id, memberIds))
}

function queryCircleStats(memberIds: string[], range: LeaderboardRange = {}) {
  return db
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
    .where(circleFinishedStarted(memberIds, range))
    .groupBy(gamePlayers.userId)
}

/** One row per `(member, character)` seat: played, village games and wins. */
function queryCharacterStats(memberIds: string[], range: LeaderboardRange = {}) {
  return db
    .select({
      userId: gamePlayers.userId,
      character: gamePlayers.character,
      played: sql`count(*)`.mapWith(Number),
      villageGames: sql`count(*) filter (where ${games.outcome} = 'village_reached')`.mapWith(
        Number
      ),
      wins: sql`count(*) filter (where ${games.winnerId} = ${gamePlayers.userId})`.mapWith(Number),
      lastPlayed: sql`extract(epoch from max(${games.startedAt}))`.mapWith(Number),
    })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(
      and(circleFinishedStarted(memberIds, range), sql`${gamePlayers.character} is not null`)
    )
    .groupBy(gamePlayers.userId, gamePlayers.character)
}

type CircleMemberRow = Awaited<ReturnType<typeof queryCircleMembers>>[number]
type CircleStatRow = Awaited<ReturnType<typeof queryCircleStats>>[number]

/** Merges members with their aggregates and sorts them into village order. */
function buildStandings(members: CircleMemberRow[], statRows: CircleStatRow[]): CircleStanding[] {
  const statsById = new Map(statRows.map((row) => [row.userId, row]))
  const standings = members.map((member) => {
    const stats = statsById.get(member.id)
    const wins = stats?.wins ?? 0
    const villageGames = stats?.villageGames ?? 0
    return {
      userId: member.id,
      username: member.username ?? 'Inconnu',
      avatarId: member.avatarId ?? null,
      wins,
      villageGames,
      winrate: villageGames > 0 ? Math.round((wins / villageGames) * 100) : 0,
      degommages: stats?.degommages ?? 0,
    }
  })
  standings.sort(compareStandings)
  return standings
}

export interface ViewerRank {
  /** 1-based position in the friends-circle leaderboard. */
  rank: number
  /** Percentage 0-100, over village_reached games only (aborted excluded) */
  winrate: number
}

/**
 * Viewer's standing chip on the Accueil hero header: rank within the friends
 * circle (exact `getLeaderboard` ordering) plus personal winrate. Null when
 * the viewer has no finished started game yet — the chips hide instead of
 * showing a meaningless « 0 % ».
 */
export async function getViewerRank(userId: string): Promise<ViewerRank | null> {
  const memberIds = await getCircleMemberIds(userId)
  const [members, statRows] = await Promise.all([
    queryCircleMembers(memberIds),
    queryCircleStats(memberIds),
  ])
  if (!statRows.some((row) => row.userId === userId)) return null

  const standings = buildStandings(members, statRows)
  const index = standings.findIndex((row) => row.userId === userId)
  const viewer = index === -1 ? undefined : standings[index]
  if (!viewer) return null
  return { rank: index + 1, winrate: viewer.winrate }
}

/** Friends-circle leaderboard (me + my friends), stats per design §5.3. */
export async function getLeaderboard(
  userId: string,
  range: LeaderboardRange = {}
): Promise<Leaderboard> {
  const memberIds = await getCircleMemberIds(userId)

  // Single all-time scan feeding both the current-streak chips and the
  // longest-streak record (plan 026). Never windowed by `range`. `.execute()`
  // is load-bearing: a drizzle query builder re-runs its SQL on every `await`
  // (QueryPromise.then calls execute each time), so only a real promise makes
  // the two consumers share one scan.
  const villageResults = queryVillageResults(memberIds).execute()

  const [members, statRows, characterRows, seatRows, streakRows, records] = await Promise.all([
    queryCircleMembers(memberIds),
    queryCircleStats(memberIds, range),
    queryCharacterStats(memberIds, range),
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
          gameStarted,
          sql`${gamePlayers.status} in ('joined', 'left')`,
          sql`${gamePlayers.character} is not null`,
          ...endedInWindow(range)
        )
      )
      .groupBy(gamePlayers.character),
    // Streak source: deliberately NOT windowed — the current streak is a
    // now-anchored, all-time property (plan 019, decision 3).
    villageResults,
    getCircleRecords(memberIds, villageResults),
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

  const streaks = computeCurrentStreaks(streakRows)
  const perCharacterByUser = buildPerCharacter(characterRows)

  const rows: LeaderboardRow[] = buildStandings(members, statRows).map((row, index) => ({
    ...row,
    currentStreak: streaks.get(row.userId) ?? 0,
    favoriteCharacter: favorites.get(row.userId)?.character ?? null,
    perCharacter: perCharacterByUser.get(row.userId) ?? [],
    rank: index + 1,
  }))

  const best = [...rows].sort((a, b) => b.degommages - a.degommages)[0]
  const topDegommeur =
    best && best.degommages > 0
      ? {
          userId: best.userId,
          username: best.username,
          avatarId: best.avatarId,
          degommages: best.degommages,
        }
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

  return { rows, friendCount: memberIds.length - 1, topDegommeur, characterWinrates, records }
}

/** One player's all-time per-character record (profile pages). */
export async function getPlayerCharacterStats(userId: string): Promise<CharacterStat[]> {
  const rows = await queryCharacterStats([userId])
  return buildPerCharacter(rows).get(userId) ?? []
}

export interface GameDetailPlayer {
  userId: string
  username: string
  avatarId: string | null
  character: CharacterId | null
  degommages: number
  isWinner: boolean
  hasLeft: boolean
  /**
   * True when this player is the viewer or one of the viewer's friends —
   * the only profiles /amis/[userId] shows the viewer (it walls strangers
   * behind « Faits d'armes réservés aux amis »), so the only rows the detail page
   * links.
   */
  isCircleMember: boolean
}

export interface GameDetail {
  id: string
  /** Join code — the gazette masthead's « partie n° ». */
  code: string
  status: 'lobby' | 'active' | 'finished'
  outcome: GameOutcome | null
  /** Why an aborted game ended; null for village wins (and unknown logs). */
  abortReason: GameAbortReason | null
  /** End-of-game highlight (« Remontada »), null when the game earned none. */
  summaryStamp: StampId | null
  format: GameFormat
  startedAt: Date | null
  endedAt: Date | null
  winner: GameDetailPlayer | null
  totalDegommages: number
  players: GameDetailPlayer[]
  journal: JournalEntry[]
  /**
   * Everything the Gazette du Village is allowed to say about this game,
   * derived from the log the page already fetched (pure, no extra query).
   * `titleHolder` and `stamps` are filled by the gazette route, which is
   * the only surface that needs them.
   */
  gazetteFacts: GazetteFacts
}

/**
 * Full detail of a finished game, full timestamped journal included.
 * Returns null when the game does not exist, when it is a lobby dissolved
 * before the start (nothing to show, and no clean surface links to it), or
 * when the viewer is neither a participant nor a friend of a participant.
 */
export async function getGameDetail(gameId: string, viewerId: string): Promise<GameDetail | null> {
  const gameRows = await db
    .select({
      id: games.id,
      code: games.code,
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
  if (!game || isPhantomLobbyGame(game)) return null

  const [playerRows, circleMemberIds] = await Promise.all([
    db
      .select({
        userId: gamePlayers.userId,
        username: user.username,
        avatarId: user.avatarId,
        character: gamePlayers.character,
        degommages: gamePlayers.degommages,
        status: gamePlayers.status,
      })
      .from(gamePlayers)
      .innerJoin(user, eq(user.id, gamePlayers.userId))
      .where(and(eq(gamePlayers.gameId, gameId), sql`${gamePlayers.status} in ('joined', 'left')`)),
    getCircleMemberIds(viewerId),
  ])
  const circle = new Set(circleMemberIds)

  const isParticipant = playerRows.some((row) => row.userId === viewerId)
  if (!isParticipant) {
    const pairChecks = playerRows.map((row) => {
      const [low, high] = canonicalPair(row.userId, viewerId)
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
    avatarId: row.avatarId,
    character: row.character,
    degommages: row.degommages,
    isWinner: row.userId === game.winnerId,
    hasLeft: row.status === 'left',
    isCircleMember: circle.has(row.userId),
  }))
  players.sort((a, b) => Number(b.isWinner) - Number(a.isWinner) || b.degommages - a.degommages)

  const abortReason = game.outcome === 'aborted' ? deriveAbortReason(eventRows) : null

  return {
    id: game.id,
    code: game.code,
    status: game.status,
    outcome: game.outcome,
    abortReason,
    format: game.format as GameFormat,
    startedAt: game.startedAt,
    endedAt: game.endedAt,
    winner: players.find((player) => player.isWinner) ?? null,
    totalDegommages: players.reduce((sum, player) => sum + player.degommages, 0),
    players,
    journal: buildGameJournal(game.id, eventRows, name),
    summaryStamp: buildSummaryStamp(eventRows, game.winnerId),
    gazetteFacts: deriveGazetteFacts({
      gameCode: game.code,
      outcome: game.outcome,
      abortReason,
      startedAt: game.startedAt,
      endedAt: game.endedAt,
      winnerId: game.winnerId,
      players,
      events: eventRows,
    }),
  }
}
