import { describe, expect, it } from 'vitest'
import {
  DEGOMMAGE_MESSAGES,
  DEGOMMAGE_TONES,
  TOTAL_WEIGHT,
  pickDegommageIndex,
  renderDegommageJournal,
  renderDegommageTemplate,
  type DegommageTone,
} from './degommage-messages'

const NAME = (userId: string): string => (userId === 'a' ? 'Astrid' : 'Marc')
const GAME = '9f1b7c2e-0000-4000-8000-000000000001'
const OTHER_GAME = '9f1b7c2e-0000-4000-8000-000000000002'
const LONG = 'Bartholome' // 10 characters, consonant-initial: the worst case

function toneSum(tone: DegommageTone): number {
  return DEGOMMAGE_MESSAGES.filter((m) => m.tone === tone).reduce((s, m) => s + m.weight, 0)
}

describe('catalog shape', () => {
  it('holds exactly 44 messages, 11 per tone', () => {
    expect(DEGOMMAGE_MESSAGES).toHaveLength(44)
    for (const tone of DEGOMMAGE_TONES) {
      expect(DEGOMMAGE_MESSAGES.filter((m) => m.tone === tone)).toHaveLength(11)
    }
  })

  it('holds exactly 10 « sans acteur » messages', () => {
    expect(DEGOMMAGE_MESSAGES.filter((m) => m.sansActeur)).toHaveLength(10)
  })

  it('flags sansActeur exactly when the template omits {acteur}', () => {
    for (const message of DEGOMMAGE_MESSAGES) {
      expect(message.sansActeur).toBe(!message.template.includes('{acteur}'))
    }
  })

  it('always names the target', () => {
    for (const message of DEGOMMAGE_MESSAGES) {
      expect(message.template).toContain('{cible}')
    }
  })

  it('has no duplicate template', () => {
    expect(new Set(DEGOMMAGE_MESSAGES.map((m) => m.template)).size).toBe(44)
  })

  it('gives « sans acteur » messages a strictly lower weight than their tone', () => {
    for (const tone of DEGOMMAGE_TONES) {
      const inTone = DEGOMMAGE_MESSAGES.filter((m) => m.tone === tone)
      const full = inTone.find((m) => !m.sansActeur)
      for (const message of inTone.filter((m) => m.sansActeur)) {
        expect(full).toBeDefined()
        expect(message.weight).toBeLessThan(full?.weight ?? 0)
      }
    }
  })

  it('uses the typographic apostrophe everywhere', () => {
    for (const message of DEGOMMAGE_MESSAGES) {
      expect(message.template).not.toContain("'")
    }
  })
})

describe('tone budget', () => {
  it('totals 484 weight units', () => {
    expect(TOTAL_WEIGHT).toBe(484)
    expect(DEGOMMAGE_MESSAGES.reduce((s, m) => s + m.weight, 0)).toBe(TOTAL_WEIGHT)
  })

  it('splits the budget 286 / 74 / 52 / 72', () => {
    expect(toneSum('baffes')).toBe(286)
    expect(toneSum('toutatis')).toBe(74)
    expect(toneSum('rome')).toBe(52)
    expect(toneSum('chambrage')).toBe(72)
  })

  it('lands within one point of the validated 60 / 15 / 10 / 15 mix', () => {
    const share = (tone: DegommageTone): number => (100 * toneSum(tone)) / TOTAL_WEIGHT
    expect(Math.abs(share('baffes') - 60)).toBeLessThan(1)
    expect(Math.abs(share('toutatis') - 15)).toBeLessThan(1)
    expect(Math.abs(share('rome') - 10)).toBeLessThan(1)
    expect(Math.abs(share('chambrage') - 15)).toBeLessThan(1)
  })
})

describe('length budget', () => {
  it('renders every template in 60 characters or less with two 10-char names', () => {
    const over = DEGOMMAGE_MESSAGES.map((m) => renderDegommageTemplate(m.template, LONG, LONG))
      .filter((text) => text.length > 60)
    expect(over).toEqual([])
  })

  it('keeps the longest worst case at 59 characters', () => {
    const longest = Math.max(
      ...DEGOMMAGE_MESSAGES.map((m) => renderDegommageTemplate(m.template, LONG, LONG).length)
    )
    expect(longest).toBe(59)
  })
})

describe('renderDegommageTemplate', () => {
  it('substitutes both placeholders', () => {
    expect(renderDegommageTemplate('{acteur} met un pion de {cible} au tapis', 'Marc', 'Zoé')).toBe(
      'Marc met un pion de Zoé au tapis'
    )
  })

  it('elides « de » before a vowel-initial target', () => {
    expect(
      renderDegommageTemplate('{acteur} met un pion de {cible} au tapis', 'Marc', 'Astrid')
    ).toBe('Marc met un pion d’Astrid au tapis')
  })

  it('elides « de » before a vowel-initial actor too', () => {
    expect(
      renderDegommageTemplate('La légion de {acteur} bouscule un pion de {cible}', 'Astrid', 'Marc')
    ).toBe('La légion d’Astrid bouscule un pion de Marc')
  })

  it('leaves a « de » that is not followed by a placeholder alone', () => {
    expect(renderDegommageTemplate('Un menhir de trop pour un pion de {cible}', 'Marc', 'Astrid')).toBe(
      'Un menhir de trop pour un pion d’Astrid'
    )
  })
})

describe('pickDegommageIndex', () => {
  it('is deterministic for a given game and seq', () => {
    for (const seq of [1, 2, 17, 512, 99999]) {
      expect(pickDegommageIndex(GAME, seq, null)).toBe(pickDegommageIndex(GAME, seq, null))
    }
  })

  it('always returns an index inside the catalog', () => {
    for (let seq = 1; seq <= 500; seq++) {
      const index = pickDegommageIndex(GAME, seq, null)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(DEGOMMAGE_MESSAGES.length)
    }
  })

  it('shifts one slot when the pick equals the previous one', () => {
    const raw = pickDegommageIndex(GAME, 7, null)
    expect(pickDegommageIndex(GAME, 7, raw)).toBe((raw + 1) % DEGOMMAGE_MESSAGES.length)
  })

  it('does not shift when the previous pick differs', () => {
    const raw = pickDegommageIndex(GAME, 7, null)
    const other = (raw + 3) % DEGOMMAGE_MESSAGES.length
    expect(pickDegommageIndex(GAME, 7, other)).toBe(raw)
  })

  it('spreads the first dégommage of 500 games over most of the catalog', () => {
    // The point of seeding on the game id: seq 2 is where a table's first
    // dégommage lands, and it must not always draw the same sentence.
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) seen.add(pickDegommageIndex(`game-${i}`, 2, null))
    expect(seen.size).toBeGreaterThanOrEqual(30)
  })
})

describe('renderDegommageJournal', () => {
  const refs = Array.from({ length: 200 }, (_, i) => ({
    seq: i + 1,
    actorId: i % 2 === 0 ? 'a' : 'b',
    targetId: i % 2 === 0 ? 'b' : 'a',
  }))

  it('returns one label per seq', () => {
    const labels = renderDegommageJournal(GAME, refs, NAME)
    expect(labels.size).toBe(200)
    for (const ref of refs) expect(labels.get(ref.seq)).toBeTruthy()
  })

  it('is reproducible — the same game and refs give the same labels', () => {
    expect([...renderDegommageJournal(GAME, refs, NAME)]).toEqual([
      ...renderDegommageJournal(GAME, refs, NAME),
    ])
  })

  it('tells the same seqs with other words in another game', () => {
    // The owner-visible point of the change: a table no longer replays the
    // sentences of the previous table, because the seed carries the game id.
    const short = refs.slice(0, 12)
    const here = [...renderDegommageJournal(GAME, short, NAME).values()]
    const there = [...renderDegommageJournal(OTHER_GAME, short, NAME).values()]
    expect(there).not.toEqual(here)
    const differing = here.filter((label, i) => label !== there[i])
    expect(differing.length).toBeGreaterThanOrEqual(6)
  })

  it('never repeats the same sentence twice in a row', () => {
    const labels = [...renderDegommageJournal(GAME, refs, NAME).values()]
    for (let i = 1; i < labels.length; i++) expect(labels[i]).not.toBe(labels[i - 1])
  })

  it('uses all four tones within the first 40 dégommages', () => {
    const first40 = refs.slice(0, 40)
    const tones = new Set<DegommageTone>()
    let previous: number | null = null
    for (const ref of first40) {
      const index = pickDegommageIndex(GAME, ref.seq, previous)
      previous = index
      const message = DEGOMMAGE_MESSAGES[index]
      if (message) tones.add(message.tone)
    }
    expect(tones.size).toBe(4)
  })

  it('lets « baffes » dominate over a long run', () => {
    const long = Array.from({ length: 2000 }, (_, i) => ({ seq: i + 1, actorId: 'a', targetId: 'b' }))
    const counts: Record<string, number> = {}
    let previous: number | null = null
    for (const ref of long) {
      const index = pickDegommageIndex(GAME, ref.seq, previous)
      previous = index
      const message = DEGOMMAGE_MESSAGES[index]
      if (message) counts[message.tone] = (counts[message.tone] ?? 0) + 1
    }
    const baffes = counts.baffes ?? 0
    expect(baffes / long.length).toBeGreaterThan(0.5)
    expect(baffes / long.length).toBeLessThan(0.7)
    for (const tone of DEGOMMAGE_TONES) expect(counts[tone] ?? 0).toBeGreaterThan(0)
  })

  it('applies élision to the rendered labels', () => {
    const withVowel = renderDegommageJournal(
      GAME,
      [{ seq: 1, actorId: 'a', targetId: 'a' }],
      () => 'Astrid'
    )
    const label = withVowel.get(1) ?? ''
    expect(label).not.toContain('de Astrid')
  })
})
