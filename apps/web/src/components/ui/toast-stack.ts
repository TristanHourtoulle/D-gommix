export type ToastVariant = 'info' | 'error'

export interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
  /** Timestamp at which the toast should start leaving. */
  expiresAt: number
  /** Timestamp at which the exit animation started; `null` while fully visible. */
  leavingAt: number | null
}

export interface ToastRequest {
  id: number
  message: string
  variant: ToastVariant
}

/** How long a toast stays fully visible. Unchanged since the first toaster. */
export const TOAST_DURATION_MS = 4000

/** Exit animation budget — must match the `.toast-slot` transition in `globals.css`. */
export const TOAST_EXIT_MS = 200

/**
 * Cap of simultaneously visible toasts. Three is what fits above the tab bar on
 * the smallest supported viewport without the pile reaching the page content.
 */
export const MAX_VISIBLE_TOASTS = 3

/**
 * Marks every live toast past `MAX_VISIBLE_TOASTS` as leaving, so an overflowing
 * pile drops its oldest card through the same exit animation as a natural expiry
 * instead of making it disappear.
 */
function capStack(stack: readonly ToastItem[], now: number): ToastItem[] {
  let live = 0
  return stack.map((item) => {
    if (item.leavingAt !== null) return item
    live += 1
    return live > MAX_VISIBLE_TOASTS ? { ...item, leavingAt: now } : item
  })
}

/**
 * Pushes a toast on top of the pile (newest first).
 *
 * A message identical to the newest live one does not stack a second time: it
 * renews that card's lifetime instead. Spamming « Sauvegardé » therefore keeps
 * one card alive rather than filling the pile with copies, and the card still
 * lives a full `TOAST_DURATION_MS` after the last action.
 */
export function addToast(
  stack: readonly ToastItem[],
  request: ToastRequest,
  now: number,
): ToastItem[] {
  const newestLive = stack.find((item) => item.leavingAt === null)
  if (
    newestLive &&
    newestLive.message === request.message &&
    newestLive.variant === request.variant
  ) {
    return stack.map((item) =>
      item === newestLive ? { ...item, expiresAt: now + TOAST_DURATION_MS } : item,
    )
  }

  return capStack(
    [
      {
        id: request.id,
        message: request.message,
        variant: request.variant,
        expiresAt: now + TOAST_DURATION_MS,
        leavingAt: null,
      },
      ...stack,
    ],
    now,
  )
}

/**
 * Advances the pile to `now`: expired toasts start leaving, and toasts done
 * animating out are dropped. Returns the very same array when nothing moved, so
 * a `setState` with it is a no-op and the scheduling effect does not re-run.
 */
export function sweepToasts(stack: readonly ToastItem[], now: number): readonly ToastItem[] {
  let changed = false
  const next: ToastItem[] = []

  for (const item of stack) {
    if (item.leavingAt !== null) {
      if (item.leavingAt + TOAST_EXIT_MS <= now) changed = true
      else next.push(item)
      continue
    }
    if (item.expiresAt <= now) {
      next.push({ ...item, leavingAt: now })
      changed = true
    } else {
      next.push(item)
    }
  }

  return changed ? next : stack
}

/** Timestamp of the next state change, or `null` when the pile is idle. */
export function nextToastDeadline(stack: readonly ToastItem[]): number | null {
  let deadline: number | null = null
  for (const item of stack) {
    const at = item.leavingAt === null ? item.expiresAt : item.leavingAt + TOAST_EXIT_MS
    if (deadline === null || at < deadline) deadline = at
  }
  return deadline
}
