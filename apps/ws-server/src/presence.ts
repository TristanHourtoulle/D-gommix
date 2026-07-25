import { eq, or } from 'drizzle-orm'
import { friendships, type Db } from '@degommix/db'
import type { Presence } from '@degommix/game-core'
import type { AppServer, AppSocket } from './socket-types'

/** Presence as it was frozen at one instant; see `PresenceTracker.capture`. */
export type PresenceSnapshot = (userId: string) => Presence

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

  /**
   * Freezes who is online right now. Call it synchronously at handshake: it is
   * what lets `sendSnapshot` tell a friend who was *already* online (whose
   * transition the connecting socket missed) apart from one who flips while the
   * snapshot query is in flight (the room broadcast already covers that one).
   */
  capture(): PresenceSnapshot {
    const online = new Set(this.socketCounts.keys())
    const inGame = new Set(this.inGameUsers)
    return (userId: string): Presence => {
      if (!online.has(userId)) return 'offline'
      return inGame.has(userId) ? 'in_game' : 'online'
    }
  }

  /**
   * Sends the current presence of the user's friends to ONE socket. Presence is
   * otherwise only emitted on transitions, so a client that connects after its
   * friends sees everyone as « hors ligne » until the next flip. Offline friends
   * are skipped: `offline` is already the client-side default.
   */
  async sendSnapshot(
    userId: string,
    socket: AppSocket,
    atHandshake: PresenceSnapshot
  ): Promise<void> {
    const rows = await this.db
      .select()
      .from(friendships)
      .where(or(eq(friendships.userLow, userId), eq(friendships.userHigh, userId)))
    for (const row of rows) {
      const friendId = row.userLow === userId ? row.userHigh : row.userLow
      // Skipped unless the friend was already online when we connected: anything
      // that flipped since is delivered by `broadcast` to the room this socket
      // joined at handshake, and restating it here would duplicate the event.
      if (atHandshake(friendId) === 'offline') continue
      // Read live, never from the frozen copy: a friend who disconnected while
      // the query ran must not be re-announced as online after their broadcast.
      const presence = this.getPresence(friendId)
      if (presence === 'offline') continue
      socket.emit('presence:update', { userId: friendId, presence })
    }
  }
}
