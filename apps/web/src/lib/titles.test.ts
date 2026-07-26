import { describe, expect, it } from 'vitest'
import {
  buildTitleEntries,
  computeMiracleValues,
  computeTitleHolders,
  pickTitle,
  OMBRE_MIN_GAMES,
  TITLE_IDS,
  TITLE_META,
  TITLE_PRIORITY,
  type TitleId,
  type TitlePlayerFacts,
} from './titles'

function facts(overrides: Partial<TitlePlayerFacts> & { userId: string }): TitlePlayerFacts {
  return {
    gamesPlayed: 5,
    bestCarton: 0,
    quietestWin: null,
    bestMiracle: 0,
    taken: 10,
    hasComeback: false,
    ...overrides,
  }
}

function holdersOf(id: TitleId, list: readonly TitlePlayerFacts[]): string[] {
  return [...(computeTitleHolders(list).get(id) ?? [])].sort()
}

describe('computeTitleHolders', () => {
  it('gives no title to a player with no finished game', () => {
    const holders = computeTitleHolders([facts({ userId: 'newcomer', gamesPlayed: 0 })])
    expect(holders.size).toBe(0)
    expect(pickTitle('newcomer', holders)).toBeNull()
  })

  it('gives L’Increvable to the player with the most games played', () => {
    const list = [
      facts({ userId: 'asterix', gamesPlayed: 12 }),
      facts({ userId: 'obelix', gamesPlayed: 4 }),
    ]
    expect(holdersOf('increvable', list)).toEqual(['asterix'])
  })

  it('shares L’Increvable between players tied on games played', () => {
    const list = [
      facts({ userId: 'asterix', gamesPlayed: 7 }),
      facts({ userId: 'obelix', gamesPlayed: 7 }),
      facts({ userId: 'panoramix', gamesPlayed: 2 }),
    ]
    expect(holdersOf('increvable', list)).toEqual(['asterix', 'obelix'])
  })

  it('gives Le Berserker to the highest single-game dégommage count', () => {
    const list = [
      facts({ userId: 'asterix', bestCarton: 3 }),
      facts({ userId: 'obelix', bestCarton: 9 }),
    ]
    expect(holdersOf('berserker', list)).toEqual(['obelix'])
  })

  it('awards no Berserker when nobody ever dégommed', () => {
    const list = [
      facts({ userId: 'asterix', bestCarton: 0 }),
      facts({ userId: 'obelix', bestCarton: 0 }),
    ]
    expect(computeTitleHolders(list).has('berserker')).toBe(false)
  })

  it('gives Le Pacifiste to the lowest dégommage count in a won game', () => {
    const list = [
      facts({ userId: 'asterix', quietestWin: 4 }),
      facts({ userId: 'obelix', quietestWin: 1 }),
    ]
    expect(holdersOf('pacifiste', list)).toEqual(['obelix'])
  })

  it('ignores players who never won when awarding Le Pacifiste', () => {
    const list = [
      facts({ userId: 'asterix', quietestWin: 4 }),
      facts({ userId: 'obelix', quietestWin: null }),
    ]
    expect(holdersOf('pacifiste', list)).toEqual(['asterix'])
  })

  it('gives Le Revenant to every player flagged hasComeback', () => {
    const list = [
      facts({ userId: 'asterix', hasComeback: true }),
      facts({ userId: 'obelix', hasComeback: false }),
      facts({ userId: 'panoramix', hasComeback: true }),
    ]
    expect(holdersOf('revenant', list)).toEqual(['asterix', 'panoramix'])
  })

  it('requires OMBRE_MIN_GAMES finished games for L’Ombre', () => {
    const list = [
      facts({ userId: 'newcomer', gamesPlayed: OMBRE_MIN_GAMES - 1, taken: 0 }),
      facts({ userId: 'veteran', gamesPlayed: 10, taken: 4 }),
    ]
    expect(holdersOf('ombre', list)).toEqual(['veteran'])
  })

  it('drops a title held by every eligible member', () => {
    const list = [
      facts({ userId: 'asterix', gamesPlayed: 5, taken: 3, bestCarton: 2 }),
      facts({ userId: 'obelix', gamesPlayed: 5, taken: 3, bestCarton: 2 }),
    ]
    const holders = computeTitleHolders(list)
    expect(holders.has('increvable')).toBe(false)
    expect(holders.has('berserker')).toBe(false)
    expect(holders.has('ombre')).toBe(false)
  })
})

describe('computeMiracleValues', () => {
  it('gives Le Miraculé from computeMiracleValues, ties for most-dégommé included', () => {
    const takenByGame = new Map<string, Map<string, number>>([
      [
        'tie',
        new Map([
          ['asterix', 3],
          ['obelix', 3],
        ]),
      ],
      [
        'outgunned',
        new Map([
          ['asterix', 1],
          ['obelix', 4],
        ]),
      ],
      ['untouched', new Map([['obelix', 2]])],
    ])
    const values = computeMiracleValues(takenByGame, [
      { gameId: 'tie', winnerId: 'asterix' },
      { gameId: 'outgunned', winnerId: 'asterix' },
      { gameId: 'untouched', winnerId: 'asterix' },
    ])
    expect(values).toEqual(new Map([['asterix', 3]]))
  })

  it('keeps the best miracle across games', () => {
    const takenByGame = new Map<string, Map<string, number>>([
      ['g1', new Map([['asterix', 2]])],
      ['g2', new Map([['asterix', 5]])],
      ['g3', new Map([['asterix', 3]])],
    ])
    const values = computeMiracleValues(takenByGame, [
      { gameId: 'g1', winnerId: 'asterix' },
      { gameId: 'g2', winnerId: 'asterix' },
      { gameId: 'g3', winnerId: 'asterix' },
    ])
    expect(values.get('asterix')).toBe(5)
  })
})

describe('pickTitle', () => {
  it('returns the rarest applicable title', () => {
    const holders = new Map<TitleId, Set<string>>([
      ['increvable', new Set(['asterix', 'obelix', 'panoramix'])],
      ['ombre', new Set(['asterix'])],
    ])
    expect(pickTitle('asterix', holders)).toBe('ombre')
    expect(pickTitle('obelix', holders)).toBe('increvable')
  })

  it('breaks a rarity tie on TITLE_PRIORITY, and TITLE_META covers every id once', () => {
    const holders = new Map<TitleId, Set<string>>([
      ['increvable', new Set(['asterix'])],
      ['revenant', new Set(['asterix'])],
      ['ombre', new Set(['asterix'])],
    ])
    expect(pickTitle('asterix', holders)).toBe('revenant')

    for (const id of TITLE_IDS) {
      expect(TITLE_META[id].label.length).toBeGreaterThan(0)
      expect(TITLE_META[id].hint.length).toBeGreaterThan(0)
      expect(TITLE_PRIORITY.filter((candidate) => candidate === id)).toHaveLength(1)
    }
    expect(TITLE_PRIORITY).toHaveLength(TITLE_IDS.length)
  })
})

describe('buildTitleEntries', () => {
  it('sorts entries by userId and skips players without a title', () => {
    const list = [
      facts({ userId: 'obelix', gamesPlayed: 9, bestCarton: 7 }),
      facts({ userId: 'asterix', gamesPlayed: 2, hasComeback: true }),
      facts({ userId: 'idefix', gamesPlayed: 0 }),
    ]
    expect(buildTitleEntries(list)).toEqual([
      { userId: 'asterix', title: 'revenant' },
      { userId: 'obelix', title: 'berserker' },
    ])
  })
})
