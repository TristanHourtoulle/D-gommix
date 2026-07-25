import { describe, expect, it } from 'vitest'
import {
  SPLASH_FADE_MS,
  SPLASH_SEEN_VALUE,
  SPLASH_TOTAL_MS,
  shouldShowSplash,
} from './splash-gate'

describe('shouldShowSplash', () => {
  it('plays on a fresh session', () => {
    expect(shouldShowSplash({ seenFlag: null, prefersReducedMotion: false })).toBe(true)
  })

  it('stays quiet once the session has seen it', () => {
    expect(shouldShowSplash({ seenFlag: SPLASH_SEEN_VALUE, prefersReducedMotion: false })).toBe(
      false
    )
  })

  it('never mounts under reduced motion, even on a fresh session', () => {
    expect(shouldShowSplash({ seenFlag: null, prefersReducedMotion: true })).toBe(false)
  })

  it('never mounts under reduced motion with the flag already set', () => {
    expect(shouldShowSplash({ seenFlag: SPLASH_SEEN_VALUE, prefersReducedMotion: true })).toBe(
      false
    )
  })

  it('replays on a stale or unrelated flag value', () => {
    // Guards against a future value change silently suppressing the splash.
    for (const seenFlag of ['true', '', '0', 'seen']) {
      expect(shouldShowSplash({ seenFlag, prefersReducedMotion: false })).toBe(true)
    }
  })
})

describe('SPLASH_TOTAL_MS', () => {
  it('matches the owner-validated budget', () => {
    expect(SPLASH_TOTAL_MS).toBe(4600)
  })

  it('takes the fade-out inside the budget, never beyond it', () => {
    expect(SPLASH_FADE_MS).toBeLessThan(SPLASH_TOTAL_MS)
  })
})
