import type { Presence } from '@degommix/game-core'
import type { AppSocket } from './realtime-types'

/**
 * Module-level store of the friends presence pushed by the ws-server, kept for
 * the whole lifetime of the socket singleton (`./socket.ts`).
 *
 * Presence is only emitted on transitions plus ONE snapshot per connect, so a
 * per-mount React state loses everything on a client-side navigation: landing
 * on `/lobby/[gameId]` through the app router (the /jouer → create → lobby
 * flow) mounted a fresh, empty map and showed every friend « hors ligne » until
 * their next transition, because the connect-time snapshot had already been
 * consumed by the previous screen. Accumulating here instead means any mount of
 * `usePresence` reads what the socket received since it connected.
 *
 * SSR seeds are deliberately NOT stored: `usePresence(initial)` merges them
 * under this map at read time, so a stale seed can never overwrite a newer
 * socket value and a seed stays scoped to the screen that owns it. On the
 * server the store is never written (no socket), so it stays empty and is
 * never shared between requests.
 */

/** Latest known presence per userId; a missing entry means « offline ». */
export type PresenceMap = Readonly<Record<string, Presence>>

/**
 * Latest `lastSeenAt` (ISO) per userId, delivered by the ws-server alongside
 * `offline` transitions only. Fresher than the SSR seed by construction, so
 * readers prefer an entry here over the query value when both exist.
 */
export type LastSeenMap = Readonly<Record<string, string>>

type Listener = () => void

const EMPTY: PresenceMap = Object.freeze({})
const EMPTY_SEEN: LastSeenMap = Object.freeze({})

/** Framework-agnostic store behind `usePresence` — see the module doc. */
export class PresenceStore {
  private readonly listeners = new Set<Listener>()
  private snapshot: PresenceMap = EMPTY
  private lastSeen: LastSeenMap = EMPTY_SEEN

  readonly getSnapshot = (): PresenceMap => this.snapshot

  readonly getLastSeen = (): LastSeenMap => this.lastSeen

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Records one `presence:update`. Re-stating known values changes nothing. */
  readonly set = (userId: string, presence: Presence, lastSeenAt?: string): void => {
    const presenceChanged = this.snapshot[userId] !== presence
    const seenChanged = lastSeenAt !== undefined && this.lastSeen[userId] !== lastSeenAt
    if (!presenceChanged && !seenChanged) return
    if (presenceChanged) this.snapshot = { ...this.snapshot, [userId]: presence }
    if (seenChanged) this.lastSeen = { ...this.lastSeen, [userId]: lastSeenAt }
    this.publish()
  }

  /**
   * Wipes every entry — bound to the socket `disconnect`. Entries belong to the
   * connection that delivered them: while offline we cannot see transitions, so
   * keeping them would display friends as online long after they left. The
   * server re-sends a full snapshot on the next connect, and it only lists
   * friends who are online, so dropping everything is also what makes a friend
   * who went offline during the outage fall back to the `offline` default.
   */
  readonly clear = (): void => {
    if (Object.keys(this.snapshot).length === 0 && Object.keys(this.lastSeen).length === 0) return
    this.snapshot = EMPTY
    this.lastSeen = EMPTY_SEEN
    this.publish()
  }

  private publish(): void {
    for (const listener of this.listeners) listener()
  }
}

/**
 * Merges a per-screen SSR/query seed UNDER the live map: whatever the order in
 * which they arrive, a presence received on the socket wins over the seed, and
 * the seed only covers the friends the socket has said nothing about (first
 * paint included). Returns the live map untouched when there is no seed, so
 * `useSyncExternalStore` consumers keep a stable reference.
 */
export function mergePresence(
  initial: Record<string, Presence> | undefined,
  live: PresenceMap
): PresenceMap {
  if (!initial) return live
  return { ...initial, ...live }
}

/** App-wide instance: one socket singleton, one presence map. */
export const presenceStore = new PresenceStore()

let attachedTo: AppSocket | null = null

/**
 * Wires the shared store to the socket. Called by the SocketProvider as soon as
 * the socket exists, so the connect-time snapshot is captured even when no
 * screen using presence is mounted yet.
 */
export function attachPresenceStore(socket: AppSocket): void {
  if (attachedTo === socket) return
  attachedTo = socket
  socket.on('presence:update', ({ userId, presence, lastSeenAt }) => {
    presenceStore.set(userId, presence, lastSeenAt)
  })
  socket.on('disconnect', () => {
    presenceStore.clear()
  })
}
