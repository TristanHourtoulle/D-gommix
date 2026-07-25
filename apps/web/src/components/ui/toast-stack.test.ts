import { describe, expect, it } from 'vitest'
import {
  addToast,
  MAX_VISIBLE_TOASTS,
  nextToastDeadline,
  sweepToasts,
  TOAST_DURATION_MS,
  TOAST_EXIT_MS,
  type ToastItem,
  type ToastVariant,
} from './toast-stack'

let nextId = 0

const push = (
  stack: readonly ToastItem[],
  message: string,
  now: number,
  variant: ToastVariant = 'info',
): ToastItem[] => addToast(stack, { id: nextId++, message, variant }, now)

const messagesOf = (stack: readonly ToastItem[]): string[] => stack.map((item) => item.message)
const liveOf = (stack: readonly ToastItem[]): string[] =>
  stack.filter((item) => item.leavingAt === null).map((item) => item.message)

describe('addToast', () => {
  it('puts the newest toast first', () => {
    let stack = push([], 'un', 0)
    stack = push(stack, 'deux', 10)
    stack = push(stack, 'trois', 20)

    expect(messagesOf(stack)).toEqual(['trois', 'deux', 'un'])
  })

  it('gives each toast a full duration from its own push', () => {
    const stack = push(push([], 'un', 0), 'deux', 1000)

    expect(stack.map((item) => item.expiresAt)).toEqual([
      1000 + TOAST_DURATION_MS,
      TOAST_DURATION_MS,
    ])
  })

  it('renews the newest toast instead of stacking an identical message', () => {
    const stack = push(push([], 'Profil sauvegardé', 0), 'Profil sauvegardé', 1500)

    expect(messagesOf(stack)).toEqual(['Profil sauvegardé'])
    expect(stack[0]?.expiresAt).toBe(1500 + TOAST_DURATION_MS)
  })

  it('stacks the same message twice when it is not the newest one', () => {
    let stack = push([], 'Profil sauvegardé', 0)
    stack = push(stack, 'Avatar mis à jour', 10)
    stack = push(stack, 'Profil sauvegardé', 20)

    expect(messagesOf(stack)).toEqual([
      'Profil sauvegardé',
      'Avatar mis à jour',
      'Profil sauvegardé',
    ])
  })

  it('does not confuse an error with an info carrying the same message', () => {
    const stack = push(push([], 'Oups', 0), 'Oups', 10, 'error')

    expect(stack).toHaveLength(2)
    expect(stack[0]?.variant).toBe('error')
  })

  it('never renews a toast that is already leaving', () => {
    const leaving = sweepToasts(push([], 'Profil sauvegardé', 0), TOAST_DURATION_MS)
    const stack = push(leaving, 'Profil sauvegardé', TOAST_DURATION_MS)

    expect(stack).toHaveLength(2)
    expect(liveOf(stack)).toEqual(['Profil sauvegardé'])
  })
})

describe('addToast cap', () => {
  it('keeps at most MAX_VISIBLE_TOASTS live cards', () => {
    let stack: readonly ToastItem[] = []
    for (let index = 0; index < MAX_VISIBLE_TOASTS + 2; index += 1) {
      stack = push(stack, `toast ${index}`, index)
    }

    expect(liveOf(stack)).toEqual(['toast 4', 'toast 3', 'toast 2'])
  })

  it('sends the evicted toast through the exit animation rather than dropping it', () => {
    let stack: readonly ToastItem[] = []
    for (let index = 0; index < MAX_VISIBLE_TOASTS; index += 1) {
      stack = push(stack, `toast ${index}`, index)
    }
    stack = push(stack, 'de trop', 100)

    const evicted = stack.find((item) => item.message === 'toast 0')
    expect(evicted?.leavingAt).toBe(100)
    expect(sweepToasts(stack, 100 + TOAST_EXIT_MS).map((item) => item.message)).not.toContain(
      'toast 0',
    )
  })
})

describe('sweepToasts', () => {
  it('returns the same reference when nothing changed', () => {
    const stack = push([], 'un', 0)

    expect(sweepToasts(stack, 1)).toBe(stack)
  })

  it('is a no-op on an empty pile', () => {
    const empty: readonly ToastItem[] = []

    expect(sweepToasts(empty, 10_000)).toBe(empty)
  })

  it('starts the exit animation at expiry without removing the toast', () => {
    const swept = sweepToasts(push([], 'un', 0), TOAST_DURATION_MS)

    expect(swept).toHaveLength(1)
    expect(swept[0]?.leavingAt).toBe(TOAST_DURATION_MS)
  })

  it('removes the toast once the exit animation is over', () => {
    const leaving = sweepToasts(push([], 'un', 0), TOAST_DURATION_MS)

    expect(sweepToasts(leaving, TOAST_DURATION_MS + TOAST_EXIT_MS - 1)).toHaveLength(1)
    expect(sweepToasts(leaving, TOAST_DURATION_MS + TOAST_EXIT_MS)).toHaveLength(0)
  })

  it('expires the oldest toasts first and keeps the pile ordered', () => {
    let stack: readonly ToastItem[] = push([], 'un', 0)
    stack = push(stack, 'deux', 500)
    stack = sweepToasts(stack, TOAST_DURATION_MS)
    stack = sweepToasts(stack, TOAST_DURATION_MS + TOAST_EXIT_MS)

    expect(messagesOf(stack)).toEqual(['deux'])
  })

  it('collapses a whole idle pile in one late sweep', () => {
    let stack: readonly ToastItem[] = push([], 'un', 0)
    stack = push(stack, 'deux', 10)
    stack = sweepToasts(stack, 60_000)

    expect(stack.every((item) => item.leavingAt === 60_000)).toBe(true)
    expect(sweepToasts(stack, 60_000 + TOAST_EXIT_MS)).toHaveLength(0)
  })
})

describe('nextToastDeadline', () => {
  it('is null on an empty pile', () => {
    expect(nextToastDeadline([])).toBeNull()
  })

  it('is the earliest expiry of the pile', () => {
    let stack: readonly ToastItem[] = push([], 'un', 0)
    stack = push(stack, 'deux', 700)

    expect(nextToastDeadline(stack)).toBe(TOAST_DURATION_MS)
  })

  it('switches to the end of the exit animation once a toast is leaving', () => {
    const leaving = sweepToasts(push([], 'un', 0), TOAST_DURATION_MS)

    expect(nextToastDeadline(leaving)).toBe(TOAST_DURATION_MS + TOAST_EXIT_MS)
  })

  it('follows the renewed lifetime after a duplicate message', () => {
    const stack = push(push([], 'un', 0), 'un', 1200)

    expect(nextToastDeadline(stack)).toBe(1200 + TOAST_DURATION_MS)
  })
})
