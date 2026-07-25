import { describe, expect, it } from 'vitest'
import { shouldInvalidateOnFinish } from './finish-guard'

describe('shouldInvalidateOnFinish', () => {
  it('stays false while the state is still syncing', () => {
    expect(shouldInvalidateOnFinish(undefined, 'g1', null)).toBe(false)
  })

  it('stays false while the game is running', () => {
    expect(shouldInvalidateOnFinish('active', 'g1', null)).toBe(false)
  })

  it('fires the first time the game is seen finished', () => {
    expect(shouldInvalidateOnFinish('finished', 'g1', null)).toBe(true)
  })

  it('does not fire again for the same game', () => {
    expect(shouldInvalidateOnFinish('finished', 'g1', 'g1')).toBe(false)
  })

  it('fires for a replay, which is a different game id', () => {
    expect(shouldInvalidateOnFinish('finished', 'g2', 'g1')).toBe(true)
  })

  it('stays false when a new game is still active after a finished one', () => {
    expect(shouldInvalidateOnFinish('active', 'g2', 'g1')).toBe(false)
  })
})
