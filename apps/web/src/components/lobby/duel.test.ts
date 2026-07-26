import { describe, expect, it } from 'vitest'
import { findDuelRival, type DuelLobby, type DuelPair } from './duel'

const ME = 'me'

const seat = (userId: string, username: string) => ({ userId, username })

const lobbyOf = (format: number, players: DuelLobby['players']): DuelLobby => ({ format, players })

const pair = (userId: string, dealt: number, taken: number): DuelPair => ({ userId, dealt, taken })

const duo = lobbyOf(2, [seat(ME, 'Astérix'), seat('o', 'Obélix')])
const feud = [pair('o', 3, 7)]

describe('findDuelRival', () => {
  it('returns null for a lobby that is not connected yet', () => {
    expect(findDuelRival(null, ME, feud)).toBeNull()
  })

  it('returns null on a cold Classement cache', () => {
    expect(findDuelRival(duo, ME, undefined)).toBeNull()
  })

  it('returns null for a 3-seat lobby even with a known rival seated', () => {
    const lobby = lobbyOf(3, [seat(ME, 'Astérix'), seat('o', 'Obélix')])
    expect(findDuelRival(lobby, ME, feud)).toBeNull()
  })

  it('returns null while the viewer is alone in the lobby', () => {
    expect(findDuelRival(lobbyOf(2, [seat(ME, 'Astérix')]), ME, feud)).toBeNull()
  })

  it('returns null when two other players are seated', () => {
    const lobby = lobbyOf(2, [seat(ME, 'Astérix'), seat('o', 'Obélix'), seat('p', 'Panoramix')])
    expect(findDuelRival(lobby, ME, feud)).toBeNull()
  })

  it('returns null when the seated opponent has no rivalry pair', () => {
    expect(findDuelRival(duo, ME, [pair('p', 2, 2)])).toBeNull()
  })

  it('returns null when the pair exists but nothing was ever exchanged', () => {
    expect(findDuelRival(duo, ME, [pair('o', 0, 0)])).toBeNull()
  })

  it('returns the rival with its dealt/taken counts for a 2-seat lobby', () => {
    expect(findDuelRival(duo, ME, feud)).toEqual({
      userId: 'o',
      username: 'Obélix',
      dealt: 3,
      taken: 7,
    })
  })

  it('still frames the duel while the rival has only been invited', () => {
    // Held in a variable so the extra `status` field survives the excess
    // property check — a real `LobbyPlayer` reaches the rule the same way.
    const invitedRival = { ...seat('o', 'Obélix'), status: 'invited' as const }
    const lobby = lobbyOf(2, [seat(ME, 'Astérix'), invitedRival])
    expect(findDuelRival(lobby, ME, feud)).toEqual({
      userId: 'o',
      username: 'Obélix',
      dealt: 3,
      taken: 7,
    })
  })

  it('picks the seated rival out of several pairs', () => {
    const pairs = [pair('p', 9, 9), pair('o', 1, 0), pair('b', 4, 4)]
    expect(findDuelRival(duo, ME, pairs)).toEqual({
      userId: 'o',
      username: 'Obélix',
      dealt: 1,
      taken: 0,
    })
  })
})
