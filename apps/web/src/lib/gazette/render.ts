import { formatDurationProse, formatEditionDate } from '@/components/stats/format'
import { deName } from '@/lib/elision'
import { hashGameSeq } from '@/lib/seq-hash'
import {
  BRIEF_FAMILIES,
  FLAVOUR_BRIEFS,
  HEADLINES,
  LEDES,
  type GazetteFactKey,
  type GazetteSlot,
  type GazetteTemplate,
} from './catalog'
import type { GazetteFacts } from './facts'

/**
 * Turns a game's facts into the parchment. Pure and seeded exclusively by
 * `hashGameSeq(gameId, slot)`, the same arithmetic the live journal uses: same
 * game → same gazette, on every phone, forever; two games never open on the
 * same front page. Nothing here reads the clock, the viewer or the network.
 */
export interface Gazette {
  readonly masthead: string
  readonly edition: string
  readonly headline: string
  readonly lede: string
  readonly briefs: readonly string[]
}

export const MASTHEAD = 'La Gazette du Village'

/**
 * Last resorts. The catalog keeps a `requires: []` line in every headline bank
 * and two universal ledes, so these should be unreachable — they exist so a
 * future catalog edit degrades into a dull front page rather than a crash.
 */
const NEUTRAL_HEADLINE = 'Le village a une histoire de plus'
const NEUTRAL_LEDE = 'La partie est finie. La Chronique en garde la trace.'

/**
 * Draw slots. Distinct constants, far above any plausible event `seq`, so the
 * gazette's picks can never be confused with a journal sentence's pick for the
 * same game — and so adding a slot later never reshuffles the existing ones.
 */
const SLOT_HEADLINE = 90_001
const SLOT_LEDE = 90_002
const SLOT_BRIEF_BASE = 90_100 // + family index
const SLOT_FLAVOUR_BASE = 90_200 // + filler index

/** A column of one or two lines reads as an accident; four reads as a list. */
const MIN_BRIEFS = 2
const MAX_BRIEFS = 3

/**
 * Whether the log proved this fact. Scalar facts are present when non-null,
 * list facts when non-empty — the single definition of « present » the whole
 * degradation rule rests on.
 */
export function hasFact(facts: GazetteFacts, key: GazetteFactKey): boolean {
  switch (key) {
    case 'winner':
      return facts.winner !== null
    case 'duration':
      return facts.durationSeconds !== null
    case 'biggestHitter':
      return facts.biggestHitter !== null
    case 'souffreDouleur':
      return facts.souffreDouleur !== null
    case 'bestRun':
      return facts.bestRun !== null
    case 'undoers':
      return facts.undoers.length > 0
    case 'validatedBy':
      return facts.validatedBy !== null
    case 'quitters':
      return facts.quitters.length > 0
    case 'cleanSheet':
      return facts.cleanSheet !== null
    case 'titleHolder':
      return facts.titleHolder !== null
    case 'stamps':
      return facts.stamps.length > 0
  }
}

/** Keeps only the templates whose every required fact is present. */
export function eligibleTemplates<T extends GazetteTemplate>(
  templates: readonly T[],
  facts: GazetteFacts
): T[] {
  return templates.filter((template) => template.requires.every((key) => hasFact(facts, key)))
}

/**
 * The weighted walk of `pickDegommageIndex`, one level up: seed modulo the
 * total weight, subtract in array order, first negative wins. Returns null on
 * an empty list so the caller decides what an impossible draw means.
 */
export function pickTemplate<T extends GazetteTemplate>(
  gameId: string,
  slot: number,
  eligible: readonly T[]
): T | null {
  if (eligible.length === 0) return null
  const totalWeight = eligible.reduce((sum, template) => sum + template.weight, 0)
  let remaining = hashGameSeq(gameId, slot) % totalWeight
  let index = eligible.length - 1
  for (let i = 0; i < eligible.length; i++) {
    const template = eligible[i]
    if (!template) break
    remaining -= template.weight
    if (remaining < 0) {
      index = i
      break
    }
  }
  return eligible[index] ?? null
}

/** Every slot the facts can fill; an absent fact leaves its slots undefined. */
function slotValues(facts: GazetteFacts): Partial<Record<GazetteSlot, string>> {
  const undoer = facts.undoers[0]
  const quitter = facts.quitters[0]
  const stamp = facts.stamps[0]
  return {
    vainqueur: facts.winner?.username,
    duree:
      facts.durationSeconds !== null ? formatDurationProse(facts.durationSeconds) : undefined,
    frappeur: facts.biggestHitter?.username,
    frappes: facts.biggestHitter ? String(facts.biggestHitter.count) : undefined,
    souffre: facts.souffreDouleur?.username,
    encaisses: facts.souffreDouleur ? String(facts.souffreDouleur.count) : undefined,
    serieur: facts.bestRun?.username,
    serie: facts.bestRun ? String(facts.bestRun.count) : undefined,
    annuleur: undoer?.username,
    annulations: undoer ? String(undoer.count) : undefined,
    chef: facts.validatedBy?.username,
    partant: quitter?.username,
    intact: facts.cleanSheet?.username,
    titre: facts.titleHolder?.username,
    estampille: stamp?.label,
    joueurs: String(facts.playerCount),
    degommages: String(facts.totalDegommages),
    code: facts.gameCode,
  }
}

/** `de {slot}`, the only spot where élision applies (as in the live journal). */
const ELIDABLE_PLACEHOLDER = /\bde \{(\w+)\}/g

/**
 * Fills a template. `de {nom}` becomes `d’<nom>` before a vowel or an « h »,
 * then the remaining placeholders are substituted as-is. A slot with no value
 * is left untouched on purpose: eligibility already guarantees it cannot
 * happen, and render.test.ts asserts no `{` ever survives.
 */
export function renderGazetteTemplate(
  text: string,
  values: Partial<Record<GazetteSlot, string>>
): string {
  let rendered = text.replace(ELIDABLE_PLACEHOLDER, (match, key: string) => {
    const value = values[key as GazetteSlot]
    return value === undefined ? match : deName(value)
  })
  for (const [slot, value] of Object.entries(values)) {
    if (value === undefined) continue
    rendered = rendered.split(`{${slot}}`).join(value)
  }
  return rendered
}

/** « Édition du 26 juillet 2026 · partie n° 4F2K9B », date half optional. */
function editionLine(facts: GazetteFacts): string {
  if (facts.endedAt === null) return `Partie n° ${facts.gameCode}`
  return `Édition du ${formatEditionDate(facts.endedAt)} · partie n° ${facts.gameCode}`
}

export function buildGazette(gameId: string, facts: GazetteFacts): Gazette {
  const values = slotValues(facts)
  const render = (text: string): string => renderGazetteTemplate(text, values)

  const headline = pickTemplate(
    gameId,
    SLOT_HEADLINE,
    eligibleTemplates(HEADLINES[facts.family], facts)
  )
  const lede = pickTemplate(
    gameId,
    SLOT_LEDE,
    eligibleTemplates(
      LEDES.filter((entry) => entry.families === undefined || entry.families.includes(facts.family)),
      facts
    )
  )

  // Editorial priority is the array order, never a draw: the most surprising
  // fact of the game leads the column. A fact the lede already told is skipped
  // — the brèves add to the chapeau, they do not repeat it — which can only
  // ever REMOVE a brief, so the degradation guarantee is untouched (the flavour
  // padding below still holds the column at MIN_BRIEFS).
  const ledeFacts = new Set<GazetteFactKey>(lede?.requires ?? [])
  const briefs: string[] = []
  for (let index = 0; index < BRIEF_FAMILIES.length && briefs.length < MAX_BRIEFS; index++) {
    const family = BRIEF_FAMILIES[index]
    if (!family || !hasFact(facts, family.key) || ledeFacts.has(family.key)) continue
    const picked = pickTemplate(
      gameId,
      SLOT_BRIEF_BASE + index,
      eligibleTemplates(family.templates, facts)
    )
    if (picked) briefs.push(render(picked.text))
  }

  // Filler only ever pads a short column — it never displaces a real fact.
  const usedFlavour = new Set<string>()
  for (let n = 0; briefs.length < MIN_BRIEFS; n++) {
    const pool = FLAVOUR_BRIEFS.filter((template) => !usedFlavour.has(template.text))
    const picked = pickTemplate(gameId, SLOT_FLAVOUR_BASE + n, pool)
    if (!picked) break
    usedFlavour.add(picked.text)
    briefs.push(render(picked.text))
  }

  return {
    masthead: MASTHEAD,
    edition: editionLine(facts),
    headline: headline ? render(headline.text) : NEUTRAL_HEADLINE,
    lede: lede ? render(lede.text) : NEUTRAL_LEDE,
    briefs,
  }
}
