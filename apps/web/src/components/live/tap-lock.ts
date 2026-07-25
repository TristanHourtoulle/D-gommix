/**
 * Anti double-tap lock for the dégommage chips (post-playtest round 1):
 * accidental bounce taps were registering two dégommages. A tap locks the
 * tapped chip until the server ack resolved AND a minimum cooldown elapsed,
 * whichever is longer — a bounce tap lands on the same chip, so it is still
 * swallowed. The other opponents' chips stay tappable: two dégommages on two
 * different victims no longer have to be entered one at a time. A rejected ack
 * releases that chip immediately so the player can retry without waiting.
 *
 * Concurrent in-flight commands are safe: every tap carries its own
 * `clientEventId` (`apps/web/src/hooks/use-game.ts`) and the ws-server
 * serializes commands per game while de-duplicating on that id
 * (`apps/ws-server/src/game-manager.ts`).
 *
 * Known limitation, on purpose: two pawns of the SAME opponent still cost one
 * cooldown each, because that is indistinguishable from a bounce tap.
 */

/** Minimum lockout after a tap — long enough to swallow a bounce tap. */
export const TAP_LOCK_COOLDOWN_MS = 1200

export interface TapLockSnapshot {
  /** Targets whose chip is locked: ack pending, cooldown running, or both. */
  readonly lockedTargetIds: readonly string[]
  /** Targets whose dégommage is still awaiting its server ack. */
  readonly pendingTargetIds: readonly string[]
}

type Listener = () => void

const IDLE: TapLockSnapshot = { lockedTargetIds: [], pendingTargetIds: [] }

interface LockEntry {
  timer: ReturnType<typeof setTimeout> | null
  ackSettled: boolean
}

/** Framework-agnostic store behind `useTapLock` — see the module doc. */
export class TapLock {
  private readonly cooldownMs: number
  private readonly listeners = new Set<Listener>()
  private readonly entries = new Map<string, LockEntry>()
  private snapshot: TapLockSnapshot = IDLE

  constructor(cooldownMs: number = TAP_LOCK_COOLDOWN_MS) {
    this.cooldownMs = cooldownMs
  }

  readonly getSnapshot = (): TapLockSnapshot => this.snapshot

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Registers a tap on `targetId`. Returns `false` when that chip is already
   * locked — the caller must then swallow the event instead of sending a second
   * command for the same victim.
   */
  readonly begin = (targetId: string): boolean => {
    if (this.entries.has(targetId)) return false
    const entry: LockEntry = { timer: null, ackSettled: false }
    entry.timer = setTimeout(() => {
      this.onCooldownElapsed(targetId)
    }, this.cooldownMs)
    this.entries.set(targetId, entry)
    this.publish()
    return true
  }

  /**
   * Resolves the pending tap on `targetId` with the server ack: `ok: false`
   * unlocks that chip right away, `ok: true` waits for its remaining cooldown.
   * An ack for an already-released (or never-locked) chip is ignored.
   */
  readonly settle = (targetId: string, ok: boolean): void => {
    const entry = this.entries.get(targetId)
    if (!entry) return
    entry.ackSettled = true
    if (ok && entry.timer !== null) {
      this.publish()
      return
    }
    this.release(targetId)
  }

  /** Drops every pending timer and the subscribers — call on unmount. */
  readonly dispose = (): void => {
    for (const entry of this.entries.values()) {
      if (entry.timer !== null) clearTimeout(entry.timer)
    }
    this.entries.clear()
    this.snapshot = IDLE
    this.listeners.clear()
  }

  private onCooldownElapsed(targetId: string): void {
    const entry = this.entries.get(targetId)
    if (!entry) return
    entry.timer = null
    if (entry.ackSettled) this.release(targetId)
  }

  private release(targetId: string): void {
    const entry = this.entries.get(targetId)
    if (!entry) return
    if (entry.timer !== null) clearTimeout(entry.timer)
    this.entries.delete(targetId)
    this.publish()
  }

  private publish(): void {
    const lockedTargetIds: string[] = []
    const pendingTargetIds: string[] = []
    for (const [targetId, entry] of this.entries) {
      lockedTargetIds.push(targetId)
      if (!entry.ackSettled) pendingTargetIds.push(targetId)
    }
    this.snapshot = { lockedTargetIds, pendingTargetIds }
    for (const listener of this.listeners) listener()
  }
}
