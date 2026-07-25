import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TAP_LOCK_COOLDOWN_MS, TapLock } from './tap-lock'

const IDLE = { lockedTargetIds: [], pendingTargetIds: [] }

describe('TapLock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts idle', () => {
    const lock = new TapLock()
    expect(lock.getSnapshot()).toEqual(IDLE)
  })

  it('locks only the tapped chip and swallows the bounce tap on that chip', () => {
    const lock = new TapLock()

    expect(lock.begin('u1')).toBe(true)
    expect(lock.getSnapshot()).toEqual({
      lockedTargetIds: ['u1'],
      pendingTargetIds: ['u1'],
    })
    // Accidental bounce tap: same chip, same finger — swallowed.
    expect(lock.begin('u1')).toBe(false)
    expect(lock.getSnapshot()).toEqual({
      lockedTargetIds: ['u1'],
      pendingTargetIds: ['u1'],
    })
  })

  it('lets another chip be tapped while the first one is on cooldown', () => {
    const lock = new TapLock()
    lock.begin('u1')
    lock.settle('u1', true)

    // Still within u1's cooldown.
    vi.advanceTimersByTime(TAP_LOCK_COOLDOWN_MS - 1)
    expect(lock.begin('u2')).toBe(true)
    expect(lock.getSnapshot()).toEqual({
      lockedTargetIds: ['u1', 'u2'],
      pendingTargetIds: ['u2'],
    })

    // u1 releases on its own schedule, u2 keeps its full window.
    vi.advanceTimersByTime(1)
    expect(lock.getSnapshot()).toEqual({
      lockedTargetIds: ['u2'],
      pendingTargetIds: ['u2'],
    })
  })

  it('holds the tapped chip for the full cooldown when the ack is fast', () => {
    const lock = new TapLock()
    lock.begin('u1')

    lock.settle('u1', true)
    expect(lock.getSnapshot().lockedTargetIds).toEqual(['u1'])

    vi.advanceTimersByTime(TAP_LOCK_COOLDOWN_MS - 1)
    expect(lock.getSnapshot().lockedTargetIds).toEqual(['u1'])

    vi.advanceTimersByTime(1)
    expect(lock.getSnapshot()).toEqual(IDLE)
    expect(lock.begin('u1')).toBe(true)
  })

  it('holds the tapped chip until the ack when the ack is slower than the cooldown', () => {
    const lock = new TapLock()
    lock.begin('u1')

    vi.advanceTimersByTime(TAP_LOCK_COOLDOWN_MS * 3)
    expect(lock.getSnapshot()).toEqual({
      lockedTargetIds: ['u1'],
      pendingTargetIds: ['u1'],
    })

    lock.settle('u1', true)
    expect(lock.getSnapshot()).toEqual(IDLE)
  })

  it('releases only the rejected chip, leaving the other one locked', () => {
    const lock = new TapLock()
    lock.begin('u1')
    lock.begin('u2')

    lock.settle('u1', false)
    expect(lock.getSnapshot()).toEqual({
      lockedTargetIds: ['u2'],
      pendingTargetIds: ['u2'],
    })
    // u1 is immediately tappable again, u2 is untouched.
    expect(lock.begin('u1')).toBe(true)
    expect(lock.getSnapshot().lockedTargetIds).toEqual(['u2', 'u1'])
  })

  it('keeps per-chip cooldowns independent when acks arrive out of order', () => {
    const lock = new TapLock()
    // u1 tapped at t=0 (cooldown ends at 1200), u2 at t=400 (ends at 1600).
    lock.begin('u1')
    vi.advanceTimersByTime(400)
    lock.begin('u2')

    // u2 acks first but its own cooldown is still running.
    lock.settle('u2', true)
    expect(lock.getSnapshot()).toEqual({
      lockedTargetIds: ['u1', 'u2'],
      pendingTargetIds: ['u1'],
    })

    // t=1200: u1's cooldown elapsed but its ack is still pending — stays locked.
    vi.advanceTimersByTime(800)
    expect(lock.getSnapshot()).toEqual({
      lockedTargetIds: ['u1', 'u2'],
      pendingTargetIds: ['u1'],
    })

    // t=1600: u2's cooldown elapses and releases u2 only.
    vi.advanceTimersByTime(400)
    expect(lock.getSnapshot()).toEqual({
      lockedTargetIds: ['u1'],
      pendingTargetIds: ['u1'],
    })

    // u1's late ack releases it immediately, its cooldown having elapsed.
    lock.settle('u1', true)
    expect(lock.getSnapshot()).toEqual(IDLE)
  })

  it('still refuses a second dégommage on the same victim during the cooldown', () => {
    // Deliberate limitation: two pawns of the SAME opponent are
    // indistinguishable from a bounce tap, so the 1.2s floor stays.
    const lock = new TapLock()
    lock.begin('u1')
    lock.settle('u1', true)

    vi.advanceTimersByTime(TAP_LOCK_COOLDOWN_MS - 1)
    expect(lock.begin('u1')).toBe(false)

    vi.advanceTimersByTime(1)
    expect(lock.begin('u1')).toBe(true)
  })

  it('honours a custom cooldown', () => {
    const lock = new TapLock(300)
    lock.begin('u1')
    lock.settle('u1', true)

    vi.advanceTimersByTime(299)
    expect(lock.getSnapshot().lockedTargetIds).toEqual(['u1'])
    vi.advanceTimersByTime(1)
    expect(lock.getSnapshot()).toEqual(IDLE)
  })

  it('ignores an ack that arrives after that chip was released', () => {
    const lock = new TapLock()
    lock.begin('u1')
    lock.settle('u1', false)

    lock.settle('u1', true)
    expect(lock.getSnapshot()).toEqual(IDLE)
    vi.advanceTimersByTime(TAP_LOCK_COOLDOWN_MS * 2)
    expect(lock.getSnapshot()).toEqual(IDLE)
  })

  it('ignores an ack for a chip that was never tapped', () => {
    const lock = new TapLock()
    lock.begin('u1')

    lock.settle('u2', true)
    expect(lock.getSnapshot()).toEqual({
      lockedTargetIds: ['u1'],
      pendingTargetIds: ['u1'],
    })
  })

  it('notifies subscribers on lock, ack and release, and stops after unsubscribe', () => {
    const lock = new TapLock()
    const listener = vi.fn()
    const unsubscribe = lock.subscribe(listener)

    lock.begin('u1')
    expect(listener).toHaveBeenCalledTimes(1)

    lock.settle('u1', true)
    expect(listener).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(TAP_LOCK_COOLDOWN_MS)
    expect(listener).toHaveBeenCalledTimes(3)

    unsubscribe()
    lock.begin('u2')
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('does not notify after dispose', () => {
    const lock = new TapLock()
    const listener = vi.fn()
    lock.subscribe(listener)

    lock.begin('u1')
    lock.begin('u2')
    lock.dispose()

    vi.advanceTimersByTime(TAP_LOCK_COOLDOWN_MS * 2)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
