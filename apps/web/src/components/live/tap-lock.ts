/**
 * Anti double-tap lock for the dégommage chips (post-playtest round 1):
 * accidental bounce taps were registering two dégommages. A tap locks every
 * chip until the server ack resolved AND a minimum cooldown elapsed, whichever
 * is longer. A rejected ack releases the lock immediately so the player can
 * retry without waiting. A legit double dégommage stays possible, one tap at a
 * time.
 */

/** Minimum lockout after a tap — long enough to swallow a bounce tap. */
export const TAP_LOCK_COOLDOWN_MS = 1200

export interface TapLockSnapshot {
  /** Chip currently being confirmed by the server, `null` when idle. */
  pendingTargetId: string | null
  /** True while every chip is locked. */
  isLocked: boolean
}

type Listener = () => void

const IDLE: TapLockSnapshot = { pendingTargetId: null, isLocked: false }

/** Framework-agnostic store behind `useTapLock` — see the module doc. */
export class TapLock {
  private readonly cooldownMs: number
  private readonly listeners = new Set<Listener>()
  private snapshot: TapLockSnapshot = IDLE
  private timer: ReturnType<typeof setTimeout> | null = null
  private ackSettled = true

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
   * Registers a tap. Returns `false` when one is already in flight — the caller
   * must then swallow the event instead of sending a second command.
   */
  readonly begin = (targetId: string): boolean => {
    if (this.snapshot.isLocked) return false
    this.ackSettled = false
    this.timer = setTimeout(this.onCooldownElapsed, this.cooldownMs)
    this.publish({ pendingTargetId: targetId, isLocked: true })
    return true
  }

  /**
   * Resolves the pending tap with the server ack: `ok: false` unlocks right
   * away, `ok: true` waits for the remaining cooldown.
   */
  readonly settle = (ok: boolean): void => {
    if (!this.snapshot.isLocked) return
    this.ackSettled = true
    if (ok && this.timer !== null) return
    this.release()
  }

  /** Drops the pending timer and subscribers — call on unmount. */
  readonly dispose = (): void => {
    this.clearTimer()
    this.listeners.clear()
  }

  private readonly onCooldownElapsed = (): void => {
    this.timer = null
    if (this.ackSettled) this.release()
  }

  private release(): void {
    this.clearTimer()
    this.ackSettled = true
    this.publish(IDLE)
  }

  private clearTimer(): void {
    if (this.timer === null) return
    clearTimeout(this.timer)
    this.timer = null
  }

  private publish(next: TapLockSnapshot): void {
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }
}
