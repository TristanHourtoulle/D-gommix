import { describe, expect, it } from 'vitest'
import { GAZETTE_FAMILIES, type GazetteFamily } from './facts'
import {
  BRIEF_FAMILIES,
  FACT_MARKERS,
  FLAVOUR_BRIEFS,
  HEADLINES,
  LEDES,
  SLOT_FACT,
  type GazetteFactKey,
  type GazetteSlot,
  type GazetteTemplate,
} from './catalog'

const SLOT_PATTERN = /\{(\w+)\}/g

function slotsOf(text: string): string[] {
  return [...text.matchAll(SLOT_PATTERN)].map((match) => match[1] ?? '')
}

/** Every template of every catalog, labelled so a failure names the culprit. */
function allTemplates(): { where: string; template: GazetteTemplate }[] {
  const rows: { where: string; template: GazetteTemplate }[] = []
  for (const family of GAZETTE_FAMILIES) {
    for (const template of HEADLINES[family]) rows.push({ where: `HEADLINES.${family}`, template })
  }
  for (const template of LEDES) rows.push({ where: 'LEDES', template })
  for (const family of BRIEF_FAMILIES) {
    for (const template of family.templates) {
      rows.push({ where: `BRIEF_FAMILIES.${family.key}`, template })
    }
  }
  for (const template of FLAVOUR_BRIEFS) rows.push({ where: 'FLAVOUR_BRIEFS', template })
  return rows
}

describe('gazette catalog — slots and facts', () => {
  it('only uses slots declared in SLOT_FACT', () => {
    // Catches a typo like {vainqeur}, which would otherwise render verbatim.
    const known = Object.keys(SLOT_FACT)
    const unknown = allTemplates().flatMap(({ where, template }) =>
      slotsOf(template.text)
        .filter((slot) => !known.includes(slot))
        .map((slot) => `${where}: {${slot}}`)
    )
    expect(unknown).toEqual([])
  })

  it('declares in `requires` every fact its slots depend on', () => {
    for (const { where, template } of allTemplates()) {
      for (const slot of slotsOf(template.text)) {
        const needed = SLOT_FACT[slot as GazetteSlot]
        if (needed === null) continue
        expect(
          template.requires.includes(needed),
          `${where} « ${template.text} » uses {${slot}} but does not require '${needed}'`
        ).toBe(true)
      }
    }
  })

  it('never uses a fact marker word without requiring that fact', () => {
    // The guarantee behind the degradation tests: « annul » can only ever come
    // from an `undoers` template, so dropping `undoers` provably drops every
    // mention of an annulation from the whole parchment.
    for (const { where, template } of allTemplates()) {
      for (const [key, marker] of Object.entries(FACT_MARKERS)) {
        if (!marker.test(template.text)) continue
        expect(
          template.requires.includes(key as GazetteFactKey),
          `${where} « ${template.text} » says ${marker} but does not require '${key}'`
        ).toBe(true)
      }
    }
  })
})

describe('gazette catalog — French conventions', () => {
  it('uses the typographic apostrophe everywhere', () => {
    for (const { where, template } of allTemplates()) {
      expect(`${where}: ${template.text}`).not.toContain("'")
    }
  })

  it('carries no emoji and at most one exclamation mark per template', () => {
    for (const { where, template } of allTemplates()) {
      const bangs = template.text.split('!').length - 1
      expect(bangs, `${where} « ${template.text} »`).toBeLessThanOrEqual(1)
      expect(template.text, where).toMatch(/^[^\p{Extended_Pictographic}]*$/u)
    }
  })
})

describe('gazette catalog — weights and shape', () => {
  it('weights every template with a positive integer', () => {
    for (const { where, template } of allTemplates()) {
      expect(Number.isInteger(template.weight), `${where} « ${template.text} »`).toBe(true)
      expect(template.weight, `${where} « ${template.text} »`).toBeGreaterThan(0)
    }
  })

  it('leaves no catalog array empty', () => {
    for (const family of GAZETTE_FAMILIES) expect(HEADLINES[family].length).toBeGreaterThan(0)
    for (const family of BRIEF_FAMILIES) expect(family.templates.length).toBeGreaterThan(0)
    expect(LEDES.length).toBeGreaterThan(0)
    expect(FLAVOUR_BRIEFS.length).toBeGreaterThan(0)
  })

  it('never repeats a sentence across the four catalogs', () => {
    const texts = allTemplates().map(({ template }) => template.text)
    expect(new Set(texts).size).toBe(texts.length)
  })

  it('pins the catalog sizes, so a retune is a visible diff', () => {
    const headlineCounts: Record<GazetteFamily, number> = {
      remontada: 3,
      eclair: 3,
      marathon: 3,
      village: 3,
      abandon_total: 2,
      abandon_individual: 2,
      zombie: 2,
      inconnu: 2,
    }
    for (const family of GAZETTE_FAMILIES) {
      expect(HEADLINES[family].length, family).toBe(headlineCounts[family])
    }
    expect(LEDES.length).toBe(12)
    expect(BRIEF_FAMILIES.length).toBe(9)
    for (const family of BRIEF_FAMILIES) expect(family.templates.length, family.key).toBe(3)
    expect(FLAVOUR_BRIEFS.length).toBe(5)
  })

  it('orders the brief families by the fixed editorial priority', () => {
    // The index IS the draw slot: permuting this array reshuffles every gazette
    // ever rendered. Appending at the end is safe; reordering is not.
    expect(BRIEF_FAMILIES.map((family) => family.key)).toEqual([
      'stamps',
      'bestRun',
      'undoers',
      'souffreDouleur',
      'quitters',
      'cleanSheet',
      'biggestHitter',
      'validatedBy',
      'oracle',
    ])
  })
})

describe('gazette catalog — degradation guarantees', () => {
  it('keeps a fact-free headline in every family', () => {
    for (const family of GAZETTE_FAMILIES) {
      const unconditional = HEADLINES[family].filter(
        (template) => template.requires.length === 0
      )
      expect(unconditional.length, family).toBeGreaterThan(0)
    }
  })

  it('keeps at least two universal ledes, with neither a fact nor a family gate', () => {
    const universal = LEDES.filter(
      (lede) => lede.requires.length === 0 && lede.families === undefined
    )
    expect(universal.length).toBeGreaterThanOrEqual(2)
  })

  it('restricts every lede to declared families', () => {
    for (const lede of LEDES) {
      for (const family of lede.families ?? []) {
        expect(GAZETTE_FAMILIES).toContain(family)
      }
    }
  })

  it('lets a brief family use only its own key and the always-available slots', () => {
    for (const family of BRIEF_FAMILIES) {
      for (const template of family.templates) {
        expect(template.requires, `${family.key} « ${template.text} »`).toEqual([family.key])
        for (const slot of slotsOf(template.text)) {
          const needed = SLOT_FACT[slot as GazetteSlot]
          expect(
            needed === null || needed === family.key,
            `${family.key} « ${template.text} » uses the foreign slot {${slot}}`
          ).toBe(true)
        }
      }
    }
  })

  it('asserts no game fact in any flavour brief', () => {
    for (const template of FLAVOUR_BRIEFS) {
      expect(template.requires, template.text).toEqual([])
      for (const slot of slotsOf(template.text)) {
        expect(SLOT_FACT[slot as GazetteSlot], template.text).toBeNull()
      }
    }
  })
})
