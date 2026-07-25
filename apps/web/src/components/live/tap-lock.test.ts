import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TAP_LOCK_COOLDOWN_MS, TapLock } from './tap-lock'

describe('TapLock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts idle', () => {
    const lock = new TapLock()
    expect(lock.getSnapshot()).toEqual({ pendingTargetId: null, isLocked: false })
  })

  it('locks every chip on the first tap and swallows the bounce tap', () => {
    const lock = new TapLock()

    expect(lock.begin('u1')).toBe(true)
    expect(lock.getSnapshot()).toEqual({ pendingTargetId: 'u1', isLocked: true })
    // Accidental double tap, on the same chip or another one.
    expect(lock.begin('u1')).toBe(false)
    expect(lock.begin('u2')).toBe(false)
    expect(lock.getSnapshot().pendingTargetId).toBe('u1')
  })

  it('holds the lock for the full cooldown when the ack is fast', () => {
    const lock = new TapLock()
    lock.begin('u1')

    lock.settle(true)
    expect(lock.getSnapshot().isLocked).toBe(true)

    vi.advanceTimersByTime(TAP_LOCK_COOLDOWN_MS - 1)
    expect(lock.getSnapshot().isLocked).toBe(true)

    vi.advanceTimersByTime(1)
    expect(lock.getSnapshot()).toEqual({ pendingTargetId: null, isLocked: false })
    expect(lock.begin('u2')).toBe(true)
  })

  it('holds the lock until the ack when the ack is slower than the cooldown', () => {
    const lock = new TapLock()
    lock.begin('u1')

    vi.advanceTimersByTime(TAP_LOCK_COOLDOWN_MS * 3)
    expect(lock.getSnapshot()).toEqual({ pendingTargetId: 'u1', isLocked: true })

    lock.settle(true)
    expect(lock.getSnapshot()).toEqual({ pendingTargetId: null, isLocked: false })
  })

  it('releases immediately when the ack is rejected', () => {
    const lock = new TapLock()
    lock.begin('u1')

    lock.settle(false)
    expect(lock.getSnapshot()).toEqual({ pendingTargetId: null, isLocked: false })
    // The cooldown timer must not re-fire on the released lock.
    vi.advanceTimersByTime(TAP_LOCK_COOLDOWN_MS * 2)
    expect(lock.getSnapshot()).toEqual({ pendingTargetId: null, isLocked: false })
  })

  it('honours a custom cooldown', () => {
    const lock = new TapLock(300)
    lock.begin('u1')
    lock.settle(true)

    vi.advanceTimersByTime(299)
    expect(lock.getSnapshot().isLocked).toBe(true)
    vi.advanceTimersByTime(1)
    expect(lock.getSnapshot().isLocked).toBe(false)
  })

  it('ignores an ack that arrives after the lock was released', () => {
    const lock = new TapLock()
    lock.begin('u1')
    lock.settle(false)

    lock.settle(true)
    expect(lock.getSnapshot()).toEqual({ pendingTargetId: null, isLocked: false })
  })

  it('notifies subscribers on lock and release, and stops after unsubscribe', () => {
    const lock = new TapLock()
    const listener = vi.fn()
    const unsubscribe = lock.subscribe(listener)

    lock.begin('u1')
    expect(listener).toHaveBeenCalledTimes(1)

    lock.settle(true)
    vi.advanceTimersByTime(TAP_LOCK_COOLDOWN_MS)
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    lock.begin('u2')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('does not notify after dispose', () => {
    const lock = new TapLock()
    const listener = vi.fn()
    lock.subscribe(listener)

    lock.begin('u1')
    lock.dispose()

    vi.advanceTimersByTime(TAP_LOCK_COOLDOWN_MS * 2)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
