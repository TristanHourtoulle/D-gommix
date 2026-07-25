import type { Presence } from '@degommix/game-core'
import { describe, expect, it } from 'vitest'
import type { InvitableFriend } from '@/lib/queries/lobby'
import { sortByAvailability } from './invitable-order'

const friend = (id: string, username: string): InvitableFriend => ({ id, username })

/** Mirrors `usePresence().presenceOf`: unknown ids fall back to 'offline'. */
const presenceFrom =
  (map: Record<string, Presence>) =>
  (userId: string): Presence =>
    map[userId] ?? 'offline'

const namesOf = (friends: InvitableFriend[]): string[] => friends.map((f) => f.username)

describe('sortByAvailability', () => {
  it('puts online friends before offline ones and offline before in_game', () => {
    const friends = [
      friend('a', 'Abraracourcix'),
      friend('b', 'Bonemine'),
      friend('c', 'Cétautomatix'),
    ]
    const sorted = sortByAvailability(
      friends,
      presenceFrom({ a: 'in_game', b: 'offline', c: 'online' })
    )
    expect(namesOf(sorted)).toEqual(['Cétautomatix', 'Bonemine', 'Abraracourcix'])
  })

  it('keeps the alphabetical order inside one availability group', () => {
    const friends = [
      friend('a', 'Astérix'),
      friend('b', 'Bonemine'),
      friend('o', 'Obélix'),
      friend('p', 'Panoramix'),
    ]
    const sorted = sortByAvailability(
      friends,
      presenceFrom({ a: 'online', b: 'in_game', o: 'online', p: 'in_game' })
    )
    expect(namesOf(sorted)).toEqual(['Astérix', 'Obélix', 'Bonemine', 'Panoramix'])
  })

  it('orders a friend with no presence entry as offline instead of dropping them', () => {
    const friends = [friend('unknown', 'Idéfix'), friend('a', 'Astérix'), friend('b', 'Bonemine')]
    const sorted = sortByAvailability(friends, presenceFrom({ a: 'in_game', b: 'online' }))
    expect(namesOf(sorted)).toEqual(['Bonemine', 'Idéfix', 'Astérix'])
    expect(sorted).toHaveLength(3)
  })

  it('returns an empty list for an empty input', () => {
    expect(sortByAvailability([], presenceFrom({}))).toEqual([])
  })

  it('does not mutate the input array', () => {
    const friends = [friend('a', 'Astérix'), friend('b', 'Bonemine')]
    const sorted = sortByAvailability(friends, presenceFrom({ a: 'in_game', b: 'online' }))
    expect(namesOf(friends)).toEqual(['Astérix', 'Bonemine'])
    expect(sorted).not.toBe(friends)
  })
})
