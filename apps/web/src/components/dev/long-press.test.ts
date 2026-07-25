import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LONG_PRESS_MOVE_TOLERANCE_PX, LONG_PRESS_MS, LongPress } from './long-press'

const ORIGIN = { x: 100, y: 100 }

describe('LongPress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts idle', () => {
    const press = new LongPress(vi.fn())
    expect(press.isPressing()).toBe(false)
  })

  it('does not fire before the hold has elapsed', () => {
    const onFire = vi.fn()
    const press = new LongPress(onFire)

    press.start(ORIGIN)
    vi.advanceTimersByTime(LONG_PRESS_MS - 1)

    expect(onFire).not.toHaveBeenCalled()
    expect(press.isPressing()).toBe(true)
  })

  it('fires exactly once when the hold elapses', () => {
    const onFire = vi.fn()
    const press = new LongPress(onFire)

    press.start(ORIGIN)
    vi.advanceTimersByTime(LONG_PRESS_MS)

    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('does not fire when cancelled before the deadline', () => {
    const onFire = vi.fn()
    const press = new LongPress(onFire)

    press.start(ORIGIN)
    vi.advanceTimersByTime(LONG_PRESS_MS - 1)
    press.cancel()
    expect(press.isPressing()).toBe(false)

    vi.advanceTimersByTime(LONG_PRESS_MS * 2)
    expect(onFire).not.toHaveBeenCalled()
  })

  it('keeps the hold armed when the finger drifts within tolerance', () => {
    const onFire = vi.fn()
    const press = new LongPress(onFire)

    press.start(ORIGIN)
    press.move({ x: ORIGIN.x + LONG_PRESS_MOVE_TOLERANCE_PX, y: ORIGIN.y })
    expect(press.isPressing()).toBe(true)

    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('cancels when the finger drifts beyond tolerance, including diagonally', () => {
    const onFire = vi.fn()
    const press = new LongPress(onFire)

    press.start(ORIGIN)
    // 9px + 9px is 12.7px of drift: a scroll, not a hold.
    press.move({ x: ORIGIN.x + 9, y: ORIGIN.y + 9 })
    expect(press.isPressing()).toBe(false)

    vi.advanceTimersByTime(LONG_PRESS_MS * 2)
    expect(onFire).not.toHaveBeenCalled()
  })

  it('re-arms from the new origin on a second start', () => {
    const onFire = vi.fn()
    const press = new LongPress(onFire)

    press.start(ORIGIN)
    vi.advanceTimersByTime(LONG_PRESS_MS - 1)

    const second = { x: ORIGIN.x + 200, y: ORIGIN.y + 200 }
    press.start(second)

    // The first timer was dropped: its deadline passes without firing.
    vi.advanceTimersByTime(1)
    expect(onFire).not.toHaveBeenCalled()

    // Drift is measured from the second origin, so this stays armed.
    press.move({ x: second.x + 4, y: second.y - 4 })
    expect(press.isPressing()).toBe(true)

    vi.advanceTimersByTime(LONG_PRESS_MS - 1)
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('never fires twice and is idle once it has fired', () => {
    const onFire = vi.fn()
    const press = new LongPress(onFire)

    press.start(ORIGIN)
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(onFire).toHaveBeenCalledTimes(1)
    expect(press.isPressing()).toBe(false)

    vi.advanceTimersByTime(LONG_PRESS_MS * 5)
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('treats move and cancel before any start as no-ops', () => {
    const onFire = vi.fn()
    const press = new LongPress(onFire)

    expect(() => press.move({ x: 0, y: 0 })).not.toThrow()
    expect(() => press.cancel()).not.toThrow()
    expect(press.isPressing()).toBe(false)

    vi.advanceTimersByTime(LONG_PRESS_MS * 2)
    expect(onFire).not.toHaveBeenCalled()
  })

  it('honours a custom hold duration and tolerance', () => {
    const onFire = vi.fn()
    const press = new LongPress(onFire, 400, 2)

    press.start(ORIGIN)
    press.move({ x: ORIGIN.x + 2, y: ORIGIN.y })
    vi.advanceTimersByTime(399)
    expect(onFire).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onFire).toHaveBeenCalledTimes(1)

    press.start(ORIGIN)
    press.move({ x: ORIGIN.x + 3, y: ORIGIN.y })
    vi.advanceTimersByTime(400)
    expect(onFire).toHaveBeenCalledTimes(1)
  })
})
