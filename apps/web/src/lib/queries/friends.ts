import type { CharacterId, Presence } from '@degommix/game-core'
import {
  and,
  canonicalPair,
  eq,
  or,
  sql,
  friendRequests,
  friendships,
  gamePlayers,
  games,
  user,
} from '@degommix/db'
import { db } from '@/lib/db'
import { gameStarted } from './game-filters'

export interface ReceivedRequest {
  requestId: string
  senderId: string
  senderUsername: string
  senderAvatarId?: string | null
}

export interface SentRequest {
  requestId: string
  receiverId: string
  receiverUsername: string
  receiverAvatarId?: string | null
}

export interface FriendEntry {
  id: string
  username: string
  avatarId?: string | null
  /** SSR seed: 'in_game' when an active game exists in db, 'offline' otherwise. */
  initialPresence: Presence
}

export interface FriendsPageData {
  received: ReceivedRequest[]
  sent: SentRequest[]
  friends: FriendEntry[]
  /** Current user's open lobby, required to send `lobby:invite`. */
  myLobbyId: string | null
}

export interface PlayerStats {
  wins: number
  /** 0..1 ratio, null when the player has no `village_reached` game yet. */
  winrate: number | null
  degommages: number
  gamesPlayed: number
  favoriteCharacter: CharacterId | null
}

/** True when a friendship row exists for the canonical (low, high) pair. */
export async function areFriends(a: string, b: string): Promise<boolean> {
  const [low, high] = canonicalPair(a, b)
  const rows = await db
    .select({ userLow: friendships.userLow })
    .from(friendships)
    .where(and(eq(friendships.userLow, low), eq(friendships.userHigh, high)))
    .limit(1)
  return rows.length > 0
}

/** Public identity of any user, null when the id is unknown. */
export async function getPublicUser(
  userId: string
): Promise<{ id: string; username: string; avatarId: string | null } | null> {
  const [row] = await db
    .select({ id: user.id, username: user.username, avatarId: user.avatarId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  if (!row) return null
  return { id: row.id, username: row.username ?? '', avatarId: row.avatarId }
}

/** Everything the Amis screen needs, in one SSR pass. */
export async function getFriendsPageData(userId: string): Promise<FriendsPageData> {
  const [receivedRows, sentRows, friendRows, lobbyRows] = await Promise.all([
    db
      .select({
        requestId: friendRequests.id,
        senderId: user.id,
        senderUsername: user.username,
        senderAvatarId: user.avatarId,
      })
      .from(friendRequests)
      .innerJoin(user, eq(user.id, friendRequests.senderId))
      .where(and(eq(friendRequests.receiverId, userId), eq(friendRequests.status, 'pending')))
      .orderBy(sql`${friendRequests.createdAt} desc`),
    db
      .select({
        requestId: friendRequests.id,
        receiverId: user.id,
        receiverUsername: user.username,
        receiverAvatarId: user.avatarId,
      })
      .from(friendRequests)
      .innerJoin(user, eq(user.id, friendRequests.receiverId))
      .where(and(eq(friendRequests.senderId, userId), eq(friendRequests.status, 'pending')))
      .orderBy(sql`${friendRequests.createdAt} desc`),
    db
      .select({ id: user.id, username: user.username, avatarId: user.avatarId })
      .from(friendships)
      .innerJoin(
        user,
        or(
          and(eq(friendships.userLow, userId), eq(user.id, friendships.userHigh)),
          and(eq(friendships.userHigh, userId), eq(user.id, friendships.userLow))
        )
      )
      .where(or(eq(friendships.userLow, userId), eq(friendships.userHigh, userId)))
      .orderBy(sql`lower(${user.username}) asc`),
    db
      .select({ gameId: games.id })
      .from(gamePlayers)
      .innerJoin(games, eq(games.id, gamePlayers.gameId))
      .where(
        and(
          eq(gamePlayers.userId, userId),
          eq(gamePlayers.status, 'joined'),
          eq(games.status, 'lobby')
        )
      )
      .limit(1),
  ])

  const friendIds = friendRows.map((row) => row.id)
  const inGameIds = new Set<string>()
  if (friendIds.length > 0) {
    const activeRows = await db
      .select({ userId: gamePlayers.userId })
      .from(gamePlayers)
      .innerJoin(games, eq(games.id, gamePlayers.gameId))
      .where(
        and(
          eq(games.status, 'active'),
          eq(gamePlayers.status, 'joined'),
          or(...friendIds.map((id) => eq(gamePlayers.userId, id)))
        )
      )
    for (const row of activeRows) inGameIds.add(row.userId)
  }

  return {
    received: receivedRows.map((row) => ({
      requestId: row.requestId,
      senderId: row.senderId,
      senderUsername: row.senderUsername ?? '',
      senderAvatarId: row.senderAvatarId,
    })),
    sent: sentRows.map((row) => ({
      requestId: row.requestId,
      receiverId: row.receiverId,
      receiverUsername: row.receiverUsername ?? '',
      receiverAvatarId: row.receiverAvatarId,
    })),
    friends: friendRows.map((row) => ({
      id: row.id,
      username: row.username ?? '',
      avatarId: row.avatarId,
      initialPresence: inGameIds.has(row.id) ? ('in_game' as const) : ('offline' as const),
    })),
    myLobbyId: lobbyRows[0]?.gameId ?? null,
  }
}

/**
 * Aggregate stats of design §5.3, computed in SQL over the finished games the
 * player actually played — lobbies dissolved before the start are excluded so
 * they never inflate « parties jouées » (see ./game-filters).
 */
export async function getPlayerStats(userId: string): Promise<PlayerStats> {
  const participated = and(
    eq(gamePlayers.userId, userId),
    or(eq(gamePlayers.status, 'joined'), eq(gamePlayers.status, 'left'))
  )

  const [winsRows, villageRows, totalsRows, favoriteRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(games)
      .where(and(eq(games.winnerId, userId), eq(games.status, 'finished'), gameStarted)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(gamePlayers)
      .innerJoin(games, eq(games.id, gamePlayers.gameId))
      .where(
        and(
          participated,
          eq(games.status, 'finished'),
          eq(games.outcome, 'village_reached'),
          gameStarted
        )
      ),
    db
      .select({
        degommages: sql<number>`coalesce(sum(${gamePlayers.degommages}), 0)::int`,
        gamesPlayed: sql<number>`count(*)::int`,
      })
      .from(gamePlayers)
      .innerJoin(games, eq(games.id, gamePlayers.gameId))
      .where(and(participated, eq(games.status, 'finished'), gameStarted)),
    db
      .select({ character: gamePlayers.character })
      .from(gamePlayers)
      .innerJoin(games, eq(games.id, gamePlayers.gameId))
      .where(
        and(
          participated,
          eq(games.status, 'finished'),
          gameStarted,
          sql`${gamePlayers.character} is not null`
        )
      )
      .groupBy(gamePlayers.character)
      .orderBy(sql`count(*) desc`, sql`max(${games.startedAt}) desc`)
      .limit(1),
  ])

  const wins = winsRows[0]?.count ?? 0
  const villageGames = villageRows[0]?.count ?? 0

  return {
    wins,
    winrate: villageGames > 0 ? wins / villageGames : null,
    degommages: totalsRows[0]?.degommages ?? 0,
    gamesPlayed: totalsRows[0]?.gamesPlayed ?? 0,
    favoriteCharacter: favoriteRows[0]?.character ?? null,
  }
}
