import { describe, expect, it } from 'vitest'
import { buildPerCharacter, type CharacterStatRow } from './character-stats'

const ME = 'me'

function row(overrides: Partial<CharacterStatRow> = {}): CharacterStatRow {
  return {
    userId: ME,
    character: 'asterix',
    played: 1,
    villageGames: 1,
    wins: 1,
    lastPlayed: 0,
    ...overrides,
  }
}

describe('buildPerCharacter', () => {
  it('groups rows per user and computes a rounded winrate', () => {
    const rows = [row({ character: 'obelix', played: 3, villageGames: 3, wins: 1 })]

    expect(buildPerCharacter(rows)).toEqual(
      new Map([
        [ME, [{ character: 'obelix', played: 3, villageGames: 3, wins: 1, winrate: 33 }]],
      ])
    )
  })

  it('returns a null winrate when villageGames is 0', () => {
    const rows = [row({ character: 'obelix', played: 2, villageGames: 0, wins: 0 })]

    expect(buildPerCharacter(rows).get(ME)?.[0]?.winrate).toBeNull()
  })

  it('sorts by played desc, then lastPlayed desc, then character asc', () => {
    const rows = [
      row({ character: 'caius_bonus', played: 1, lastPlayed: 10 }),
      row({ character: 'obelix', played: 5, lastPlayed: 1 }),
      // Same `played` as asterix, more recent → comes first of the two.
      row({ character: 'caligula_minus', played: 3, lastPlayed: 20 }),
      row({ character: 'asterix', played: 3, lastPlayed: 5 }),
    ]

    expect(buildPerCharacter(rows).get(ME)?.map((stat) => stat.character)).toEqual([
      'obelix',
      'caligula_minus',
      'asterix',
      'caius_bonus',
    ])
  })

  it('breaks a played + lastPlayed tie on the character id', () => {
    const rows = [
      row({ character: 'obelix', played: 2, lastPlayed: 7 }),
      row({ character: 'asterix', played: 2, lastPlayed: 7 }),
    ]

    expect(buildPerCharacter(rows).get(ME)?.map((stat) => stat.character)).toEqual([
      'asterix',
      'obelix',
    ])
  })

  it('skips rows with a null character', () => {
    const rows = [row({ character: null }), row({ character: 'obelix' })]

    expect(buildPerCharacter(rows).get(ME)?.map((stat) => stat.character)).toEqual(['obelix'])
  })

  it('keeps users independent', () => {
    const rows = [
      row({ userId: 'a', character: 'asterix', played: 4 }),
      row({ userId: 'b', character: 'obelix', played: 9 }),
    ]

    const byUser = buildPerCharacter(rows)

    expect(byUser.get('a')?.map((stat) => stat.character)).toEqual(['asterix'])
    expect(byUser.get('b')?.map((stat) => stat.character)).toEqual(['obelix'])
  })

  it('returns an empty map for no rows', () => {
    expect(buildPerCharacter([])).toEqual(new Map())
  })
})
