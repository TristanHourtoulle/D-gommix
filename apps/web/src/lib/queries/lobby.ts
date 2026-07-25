import { and, eq, or, friendships, gamePlayers, games, user } from '@degommix/db'
import { db } from '@/lib/db'

export interface LobbyAccess {
  status: 'lobby' | 'active' | 'finished'
  isMember: boolean
}

export interface InvitableFriend {
  id: string
  username: string
  avatarId?: string | null
}

/** SSR gate for /lobby/[gameId]: game status + seated membership of the viewer. */
export async function getLobbyAccess(gameId: string, userId: string): Promise<LobbyAccess | null> {
  const [game] = await db.select({ status: games.status }).from(games).where(eq(games.id, gameId))
  if (!game) return null
  const [seat] = await db
    .select({ status: gamePlayers.status })
    .from(gamePlayers)
    .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, userId)))
  return { status: game.status, isMember: seat?.status === 'joined' }
}

/** Friends of the viewer (id + username), for the host « inviter des amis » list. */
export async function getInvitableFriends(userId: string): Promise<InvitableFriend[]> {
  const rows = await db
    .select({ low: friendships.userLow, high: friendships.userHigh })
    .from(friendships)
    .where(or(eq(friendships.userLow, userId), eq(friendships.userHigh, userId)))
  const friendIds = rows.map((row) => (row.low === userId ? row.high : row.low))
  if (friendIds.length === 0) return []
  const users = await db
    .select({ id: user.id, username: user.username, avatarId: user.avatarId })
    .from(user)
    .where(or(...friendIds.map((id) => eq(user.id, id))))
  return users
    .flatMap((row) =>
      row.username ? [{ id: row.id, username: row.username, avatarId: row.avatarId }] : []
    )
    .sort((a, b) => a.username.localeCompare(b.username))
}
