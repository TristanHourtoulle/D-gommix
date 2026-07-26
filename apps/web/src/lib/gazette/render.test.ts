import { describe, expect, it } from 'vitest'
import type { RawEvent } from '@/lib/queries/game-detail-journal'
import { FACT_MARKERS, type GazetteFactKey } from './catalog'
import { deriveGazetteFacts, GAZETTE_FAMILIES, type GazetteFacts, type GazetteFamily } from './facts'
import { buildGazette, MASTHEAD, renderGazetteTemplate } from './render'

const GAME = '9f1b7c2e-0000-4000-8000-000000000001'
const OTHER_GAME = '9f1b7c2e-0000-4000-8000-000000000003'
const AT = new Date('2026-07-26T18:00:00Z')
const STARTED = new Date('2026-07-26T18:00:00Z')
const ENDED = new Date('2026-07-26T18:12:40Z') // 760 s

function ev(partial: Partial<RawEvent> & { seq: number; type: string }): RawEvent {
  return { actorId: null, targetId: null, payload: null, createdAt: AT, ...partial }
}

function hit(seq: number, actor: string, target: string): RawEvent {
  return ev({ seq, type: 'DEGOMMAGE', actorId: actor, targetId: target })
}

/**
 * The reference game: a 4-player village win in 12 min 40 s, 9 net dégommages,
 * two annulations by the same player, a run of 3, a clear souffre-douleur, a
 * chef de camp validation and a title holder. Rich enough that every brief
 * family but « quitters » and « stamps » has something to say.
 */
const RICH_FACTS: GazetteFacts = deriveGazetteFacts({
  gameCode: '4F2K9B',
  outcome: 'village_reached',
  abortReason: null,
  startedAt: STARTED,
  endedAt: ENDED,
  winnerId: 'o',
  players: [
    { userId: 'a', username: 'Astérix', hasLeft: false },
    { userId: 'o', username: 'Obélix', hasLeft: false },
    { userId: 'b', username: 'Bonemine', hasLeft: false },
    { userId: 'p', username: 'Panoramix', hasLeft: false },
  ],
  events: [
    hit(1, 'o', 'a'),
    hit(2, 'o', 'a'),
    hit(3, 'o', 'a'),
    hit(4, 'b', 'a'),
    hit(5, 'a', 'b'),
    hit(6, 'p', 'a'),
    hit(7, 'o', 'p'),
    hit(8, 'b', 'p'),
    hit(9, 'a', 'p'),
    hit(10, 'p', 'b'),
    hit(11, 'o', 'b'),
    ev({ seq: 12, type: 'UNDO', actorId: 'b', payload: { targetSeq: 5 } }),
    ev({ seq: 13, type: 'UNDO', actorId: 'b', payload: { targetSeq: 10 } }),
    ev({ seq: 14, type: 'END_REQUESTED', actorId: 'a', targetId: 'o', payload: { kind: 'village' } }),
    ev({ seq: 15, type: 'END_VALIDATED', actorId: 'a', payload: { requestSeq: 14 } }),
  ],
  titleHolder: { userId: 'a', username: 'Astérix', count: 42 },
})

describe('the reference game derives the facts the golden relies on', () => {
  it('reads the log the way the fixture describes it', () => {
    expect(RICH_FACTS.family).toBe('village')
    expect(RICH_FACTS.totalDegommages).toBe(9)
    expect(RICH_FACTS.durationSeconds).toBe(760)
    expect(RICH_FACTS.winner).toEqual({ userId: 'o', username: 'Obélix' })
    expect(RICH_FACTS.biggestHitter).toMatchObject({ username: 'Obélix', count: 5 })
    expect(RICH_FACTS.souffreDouleur).toMatchObject({ username: 'Astérix', count: 5 })
    expect(RICH_FACTS.bestRun).toMatchObject({ username: 'Obélix', count: 3 })
    expect(RICH_FACTS.undoers).toEqual([{ userId: 'b', username: 'Bonemine', count: 2 }])
    expect(RICH_FACTS.validatedBy).toEqual({ userId: 'a', username: 'Astérix' })
    expect(RICH_FACTS.cleanSheet).toEqual({ userId: 'o', username: 'Obélix' })
    expect(RICH_FACTS.quitters).toEqual([])
    expect(RICH_FACTS.stamps).toEqual([])
  })
})

describe('buildGazette — golden parchment', () => {
  // Pinned goldens. These strings are the exact parchment this fixture draws;
  // regenerating them is only legitimate when the owner retunes the catalog
  // (a weight or a phrasing edit) — never to make a failing test green.
  it('prints the reference game', () => {
    const gazette = buildGazette(GAME, RICH_FACTS)
    expect(gazette.masthead).toBe('La Gazette du Village')
    expect(gazette.edition).toBe('Édition du 26 juillet 2026 · partie n° 4F2K9B')
    expect(gazette.headline).toBe('Obélix terrasse la table en 12 min 40 s')
    expect(gazette.lede).toBe(
      'Astérix encaisse 5 dégommages et rentre au village par ses propres moyens.'
    )
    expect(gazette.briefs).toEqual([
      '3 dégommages coup sur coup : la série est signée Obélix.',
      'Annulations : 2. Le nom qui revient, c’est Bonemine.',
      'Obélix traverse la partie sans une égratignure. Idéfix approuve.',
    ])
    expect(gazette.briefs.length).toBe(3)
  })

  it('never repeats in a brief the fact the lede already told', () => {
    // The lede leads on the souffre-douleur here, so the souffre-douleur brief
    // family stands down and the column moves on to the next story.
    const gazette = buildGazette(GAME, RICH_FACTS)
    expect(gazette.lede).toMatch(/encaisse 5 dégommages/)
    expect(gazette.briefs.join(' ')).not.toMatch(/souffre-douleur/)
  })

  it('drops the date half of the edition line when the game has no end date', () => {
    const gazette = buildGazette(GAME, { ...RICH_FACTS, endedAt: null })
    expect(gazette.edition).toBe('Partie n° 4F2K9B')
  })
})

describe('buildGazette — determinism', () => {
  it('draws the same parchment twice for the same game', () => {
    expect(buildGazette(GAME, RICH_FACTS)).toEqual(buildGazette(GAME, RICH_FACTS))
  })

  it('draws a different headline for a different game', () => {
    expect(buildGazette(OTHER_GAME, RICH_FACTS).headline).not.toBe(
      buildGazette(GAME, RICH_FACTS).headline
    )
  })

  it('never reads the clock, so the same facts render identically minutes apart', () => {
    const first = buildGazette(GAME, RICH_FACTS)
    const second = buildGazette(GAME, { ...RICH_FACTS })
    expect(second).toEqual(first)
  })
})

/** A minimal fact set with only `present` proven — the degradation harness. */
function onlyFacts(present: readonly GazetteFactKey[], family: GazetteFamily = 'village'): GazetteFacts {
  const has = (key: GazetteFactKey): boolean => present.includes(key)
  return {
    family,
    gameCode: '4F2K9B',
    endedAt: ENDED,
    durationSeconds: has('duration') ? 760 : null,
    playerCount: 4,
    totalDegommages: 9,
    undoTotal: has('undoers') ? 2 : 0,
    // Not slot-backed: the stats box reads these, no template ever does.
    dealtCounts: [],
    takenCounts: [],
    winner: has('winner') ? { userId: 'o', username: 'Obélix' } : null,
    biggestHitter: has('biggestHitter')
      ? { userId: 'o', username: 'Obélix', count: 5 }
      : null,
    souffreDouleur: has('souffreDouleur')
      ? { userId: 'a', username: 'Astérix', count: 5 }
      : null,
    bestRun: has('bestRun') ? { userId: 'o', username: 'Obélix', count: 3 } : null,
    undoers: has('undoers') ? [{ userId: 'b', username: 'Bonemine', count: 2 }] : [],
    validatedBy: has('validatedBy') ? { userId: 'a', username: 'Astérix' } : null,
    quitters: has('quitters') ? [{ userId: 'p', username: 'Panoramix' }] : [],
    cleanSheet: has('cleanSheet') ? { userId: 'o', username: 'Obélix' } : null,
    titleHolder: has('titleHolder') ? { userId: 'a', username: 'Astérix', count: 42 } : null,
    oracle: has('oracle') ? { userId: 'b', username: 'Bonemine', count: 3 } : null,
    stamps: has('stamps') ? [{ id: 'triple', label: 'le Triplé', userId: 'o' }] : [],
  }
}

const ALL_FACT_KEYS: readonly GazetteFactKey[] = [
  'winner',
  'duration',
  'biggestHitter',
  'souffreDouleur',
  'bestRun',
  'undoers',
  'validatedBy',
  'quitters',
  'cleanSheet',
  'titleHolder',
  'oracle',
  'stamps',
]

function wholeGazette(facts: GazetteFacts, gameId = GAME): string {
  const gazette = buildGazette(gameId, facts)
  return [gazette.edition, gazette.headline, gazette.lede, ...gazette.briefs].join(' \n ')
}

describe('buildGazette — fact degradation', () => {
  it('still prints a front page when the log proved nothing', () => {
    const gazette = buildGazette(GAME, onlyFacts([]))
    expect(gazette.masthead).toBe(MASTHEAD)
    expect(gazette.headline.length).toBeGreaterThan(0)
    expect(gazette.lede.length).toBeGreaterThan(0)
    expect(gazette.briefs.length).toBeGreaterThanOrEqual(2)
  })

  for (const [key, marker] of Object.entries(FACT_MARKERS)) {
    it(`never mentions ${key} when the fact is absent`, () => {
      expect(wholeGazette(onlyFacts([]))).not.toMatch(marker)
      expect(wholeGazette(onlyFacts(ALL_FACT_KEYS.filter((other) => other !== key)))).not.toMatch(
        marker
      )
    })
  }

  // Proof the absence assertions above are not vacuous: with only that fact
  // proven, SOME game draws a line that says it. It cannot be every game — the
  // draw picks one headline, one lede and up to three brèves out of banks that
  // deliberately include fact-free alternatives.
  const SAMPLE_IDS = Array.from(
    { length: 8 },
    (_unused, i) => `9f1b7c2e-0000-4000-8000-00000000000${i + 1}`
  )

  for (const [key, marker] of Object.entries(FACT_MARKERS)) {
    it(`does mention ${key} on at least one game when the fact is present`, () => {
      const facts = onlyFacts([key as GazetteFactKey])
      expect(SAMPLE_IDS.some((id) => marker.test(wholeGazette(facts, id)))).toBe(true)
    })
  }

  it('leaks no placeholder, undefined or null across a matrix of fact permutations', () => {
    let iterations = 0
    for (const family of GAZETTE_FAMILIES) {
      for (let step = 0; step < 24; step++) {
        // 89 is odd, so it is coprime with 2^11 and walks 24 distinct masks.
        const mask = (step * 89) % (1 << ALL_FACT_KEYS.length)
        const present = ALL_FACT_KEYS.filter((_key, index) => (mask & (1 << index)) !== 0)
        const gazette = buildGazette(GAME, onlyFacts(present, family))
        for (const line of [gazette.edition, gazette.headline, gazette.lede, ...gazette.briefs]) {
          expect(line, `${family} / ${present.join(',')}`).not.toMatch(/[{}]|undefined|null/)
          expect(line.length, `${family} / ${present.join(',')}`).toBeGreaterThan(0)
        }
        expect(gazette.briefs.length).toBeGreaterThanOrEqual(2)
        expect(gazette.briefs.length).toBeLessThanOrEqual(3)
        iterations += 1
      }
    }
    expect(iterations).toBe(192)
  })

  it('gives every family a headline and a lede even with empty facts', () => {
    for (const family of GAZETTE_FAMILIES) {
      const gazette = buildGazette(GAME, onlyFacts([], family))
      expect(gazette.headline.length, family).toBeGreaterThan(0)
      expect(gazette.lede.length, family).toBeGreaterThan(0)
    }
  })
})

describe('renderGazetteTemplate — élision', () => {
  it('elides « de » before a vowel-initial name', () => {
    expect(renderGazetteTemplate('Le stylet de {annuleur} gratte', { annuleur: 'Astrid' })).toBe(
      'Le stylet d’Astrid gratte'
    )
  })

  it('keeps « de » before a consonant-initial name', () => {
    expect(renderGazetteTemplate('Le stylet de {annuleur} gratte', { annuleur: 'Marc' })).toBe(
      'Le stylet de Marc gratte'
    )
  })

  it('leaves an unfilled slot alone rather than inventing a name', () => {
    expect(renderGazetteTemplate('Le stylet de {annuleur} gratte', {})).toBe(
      'Le stylet de {annuleur} gratte'
    )
  })

  it('never renders « de » before a vowel anywhere in a drawn gazette', () => {
    const vowelNamed = onlyFacts(['undoers', 'cleanSheet'])
    const facts: GazetteFacts = {
      ...vowelNamed,
      undoers: [{ userId: 'b', username: 'Astrid', count: 2 }],
      cleanSheet: { userId: 'o', username: 'Idéfix' },
    }
    for (const id of [GAME, OTHER_GAME]) {
      expect(wholeGazette(facts, id)).not.toMatch(/\bde (Astrid|Idéfix)\b/)
    }
  })
})
