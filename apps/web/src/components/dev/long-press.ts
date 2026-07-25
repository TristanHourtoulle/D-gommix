/**
 * Long-press recognizer behind the hidden dev menu. Framework-agnostic on
 * purpose: the timing rules are the only thing worth testing, and this repo's
 * vitest runs in the `node` environment with no DOM (`apps/web/vitest.config.ts`).
 *
 * Touch rules: a press that drifts more than `tolerancePx` from its origin is a
 * scroll, not a hold, and cancels. So does lifting the finger early.
 */

/** Hold duration before the menu opens — long enough that no normal tap reaches it. */
export const LONG_PRESS_MS = 1500

/** Finger drift allowed during the hold, in CSS pixels. */
export const LONG_PRESS_MOVE_TOLERANCE_PX = 12

export interface LongPressPoint {
  readonly x: number
  readonly y: number
}

/** Framework-agnostic recognizer behind `useLongPress` — see the module doc. */
export class LongPress {
  private readonly onFire: () => void
  private readonly holdMs: number
  private readonly tolerancePx: number
  private timer: ReturnType<typeof setTimeout> | null = null
  private origin: LongPressPoint | null = null

  constructor(
    onFire: () => void,
    holdMs: number = LONG_PRESS_MS,
    tolerancePx: number = LONG_PRESS_MOVE_TOLERANCE_PX
  ) {
    this.onFire = onFire
    this.holdMs = holdMs
    this.tolerancePx = tolerancePx
  }

  /** True while a hold is armed (started, not yet fired or cancelled). */
  readonly isPressing = (): boolean => this.timer !== null

  /** Arms a hold at `point`. A second `start` re-arms from the new origin. */
  readonly start = (point: LongPressPoint): void => {
    this.cancel()
    this.origin = point
    this.timer = setTimeout(() => {
      // Clear the state before firing so the recognizer is idle by the time the
      // navigation happens.
      this.timer = null
      this.origin = null
      this.onFire()
    }, this.holdMs)
  }

  /** Feeds a move; cancels the hold once the drift exceeds the tolerance. */
  readonly move = (point: LongPressPoint): void => {
    const origin = this.origin
    if (origin === null) return
    if (Math.hypot(point.x - origin.x, point.y - origin.y) > this.tolerancePx) this.cancel()
  }

  /** Cancels an armed hold — finger lifted, pointer cancelled, page scrolled, unmount. */
  readonly cancel = (): void => {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.origin = null
  }
}
