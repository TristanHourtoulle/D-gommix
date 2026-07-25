import { describe, expect, it } from 'vitest'
import { isPhantomLobbyGame } from './game-filters'

describe('isPhantomLobbyGame', () => {
  it('flags a finished game that never started (dissolved lobby)', () => {
    expect(isPhantomLobbyGame({ status: 'finished', startedAt: null })).toBe(true)
  })

  it('keeps a game aborted after the start', () => {
    expect(isPhantomLobbyGame({ status: 'finished', startedAt: new Date() })).toBe(false)
  })

  it('keeps a live lobby, whose startedAt is null too', () => {
    expect(isPhantomLobbyGame({ status: 'lobby', startedAt: null })).toBe(false)
  })

  it('keeps a running game', () => {
    expect(isPhantomLobbyGame({ status: 'active', startedAt: new Date() })).toBe(false)
  })
})
