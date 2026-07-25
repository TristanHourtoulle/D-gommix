import { eq, or } from 'drizzle-orm'
import { friendships, type Db } from '@degommix/db'
import type { Presence } from '@degommix/game-core'
import type { AppServer } from './socket-types'

/**
 * Tracks how many sockets each user has and broadcasts presence transitions
 * (`online` / `in_game` / `offline`) to the user's friends.
 */
export class PresenceTracker {
  private readonly socketCounts = new Map<string, number>()
  private readonly inGameUsers = new Set<string>()

  constructor(
    private readonly db: Db,
    private readonly io: AppServer
  ) {}

  isOnline(userId: string): boolean {
    return (this.socketCounts.get(userId) ?? 0) > 0
  }

  getPresence(userId: string): Presence {
    if (!this.isOnline(userId)) return 'offline'
    return this.inGameUsers.has(userId) ? 'in_game' : 'online'
  }

  /** Synchronous count bump (call in connection order). True on offline → online. */
  registerSocket(userId: string): boolean {
    const count = (this.socketCounts.get(userId) ?? 0) + 1
    this.socketCounts.set(userId, count)
    return count === 1
  }

  /** Synchronous count drop (call in disconnect order). True on online → offline. */
  unregisterSocket(userId: string): boolean {
    const count = Math.max(0, (this.socketCounts.get(userId) ?? 0) - 1)
    if (count === 0) {
      this.socketCounts.delete(userId)
      return true
    }
    this.socketCounts.set(userId, count)
    return false
  }

  /** Silently syncs the in-game flag (used at handshake, before the online broadcast). */
  syncInGameFlag(userId: string, inGame: boolean): void {
    if (inGame) this.inGameUsers.add(userId)
    else this.inGameUsers.delete(userId)
  }

  /** Flags a user as in game; broadcasts only when the flag actually flips while online. */
  async setInGame(userId: string, inGame: boolean): Promise<void> {
    const changed = inGame ? !this.inGameUsers.has(userId) : this.inGameUsers.has(userId)
    this.syncInGameFlag(userId, inGame)
    if (changed && this.isOnline(userId)) await this.broadcast(userId)
  }

  async broadcast(userId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(friendships)
      .where(or(eq(friendships.userLow, userId), eq(friendships.userHigh, userId)))
    const presence = this.getPresence(userId)
    for (const row of rows) {
      const friendId = row.userLow === userId ? row.userHigh : row.userLow
      this.io.to(`user:${friendId}`).emit('presence:update', { userId, presence })
    }
  }
}
