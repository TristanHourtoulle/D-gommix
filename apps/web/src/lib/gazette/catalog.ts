import type { GazetteFamily } from './facts'

/**
 * The « Gazette du Village » copy catalog. This file is DATA, not code: the
 * owner retunes a weight or a phrasing here and nothing else moves. Its rules,
 * all enforced by catalog.test.ts:
 *
 * - every fact-bearing clause is backed by a `requires` entry, so a template
 *   whose fact is absent is filtered out instead of printing a guess;
 * - typographic apostrophe `’` (U+2019) only;
 * - no gendered adjective or participle ever agrees with a player name
 *   (« {vainqueur} terrasse la table » yes, « {vainqueur} est arrivée » no);
 * - a count slot may legitimately render `1`, so a plural noun may only follow
 *   `{serie}` (>= 3) or `{encaisses}` (>= 2), the two counts whose minimum the
 *   fact derivation guarantees. Everywhere else, count the invariable way
 *   (« {frappes} fois », « {annulations} au compteur »).
 *
 * Register: the village hack writing a front page — same physical, present
 * tense, ageless voice as the 44 sentences of the live journal, one notch up.
 * Album character names ARE allowed here (owner decision, 2026-07-26); they are
 * still forbidden in degommage-messages.ts, which this file does not touch.
 */

/**
 * Slots a template may reference, and the fact each one needs. The renderer
 * NEVER fills a slot from a missing fact: `catalog.test.ts` asserts that every
 * template's `requires` covers every slot it uses, so an ineligible template is
 * filtered out before rendering rather than printing « undefined ».
 */
export const SLOT_FACT = {
  vainqueur: 'winner',
  duree: 'duration',
  frappeur: 'biggestHitter',
  frappes: 'biggestHitter',
  souffre: 'souffreDouleur',
  encaisses: 'souffreDouleur',
  serieur: 'bestRun',
  serie: 'bestRun',
  annuleur: 'undoers',
  annulations: 'undoers',
  chef: 'validatedBy',
  partant: 'quitters',
  intact: 'cleanSheet',
  titre: 'titleHolder',
  prophete: 'oracle',
  prophetie: 'oracle',
  estampille: 'stamps',
  // Always available — no `requires` entry needed:
  joueurs: null,
  degommages: null,
  code: null,
} as const

export type GazetteSlot = keyof typeof SLOT_FACT
export type GazetteFactKey = Exclude<(typeof SLOT_FACT)[GazetteSlot], null>

export interface GazetteTemplate {
  /** French sentence with `{slot}` placeholders. */
  readonly text: string
  /** Facts that must be present for this template to be eligible. */
  readonly requires: readonly GazetteFactKey[]
  /** Relative draw weight — data, not code (plan 010's rule). */
  readonly weight: number
}

/**
 * Marker words that may only ever appear in a template that requires the
 * matching fact. This is what makes the degradation guarantee auditable: if
 * « annul » can only come from an `undoers` template, then removing `undoers`
 * provably removes every mention of an annulation from the whole parchment.
 * Asserted in catalog.test.ts and relied upon by render.test.ts.
 */
export const FACT_MARKERS: Readonly<Partial<Record<GazetteFactKey, RegExp>>> = {
  undoers: /annul/i,
  souffreDouleur: /souffre-douleur/i,
  bestRun: /série/i,
  quitters: /quitt/i,
  cleanSheet: /égratignure/i,
  titleHolder: /en titre/i,
  oracle: /oracle|proph/i,
  stamps: /estampille/i,
}

/**
 * Headlines, one bank per family. The family is a fact (see pickFamily), so a
 * bank never has to hedge about which story it is telling — only about which
 * names it may drop. Every bank keeps one `requires: []` line so a game whose
 * log gave up nothing still gets a front page.
 */
export const HEADLINES: Readonly<Record<GazetteFamily, readonly GazetteTemplate[]>> = {
  remontada: [
    { text: '{vainqueur} ramasse tout sur le sentier et gagne quand même', requires: ['winner'], weight: 5 },
    {
      text: 'Souffre-douleur du village au départ, {vainqueur} finit devant',
      requires: ['souffreDouleur', 'winner'],
      weight: 4,
    },
    { text: 'La table cogne, le village se laisse prendre quand même', requires: [], weight: 2 },
  ],
  eclair: [
    { text: '{vainqueur} plie la partie en {duree}', requires: ['winner', 'duration'], weight: 5 },
    { text: '{duree} de sentier, et le village tombe', requires: ['duration'], weight: 3 },
    { text: 'Le village tombe avant le premier sanglier', requires: [], weight: 2 },
  ],
  marathon: [
    { text: '{duree} de bagarre : {vainqueur} arrive au village', requires: ['winner', 'duration'], weight: 5 },
    { text: 'Le sentier n’en finissait pas : {duree} avant le village', requires: ['duration'], weight: 3 },
    { text: 'Une partie à rallonge, le village finit par céder', requires: [], weight: 2 },
  ],
  village: [
    { text: '{vainqueur} terrasse la table en {duree}', requires: ['winner', 'duration'], weight: 5 },
    { text: '{vainqueur} atteint le village, la table applaudit à peine', requires: ['winner'], weight: 4 },
    { text: 'Le village est atteint, la table recompte les pions', requires: [], weight: 2 },
  ],
  abandon_total: [
    { text: 'La table dépose les armes d’un commun accord', requires: [], weight: 4 },
    { text: '{chef} siffle la fin, tout le monde rentre', requires: ['validatedBy'], weight: 3 },
  ],
  abandon_individual: [
    { text: 'Trop de départs : la partie s’arrête en chemin', requires: [], weight: 4 },
    { text: '{partant} quitte le sentier, la partie ne s’en remet pas', requires: ['quitters'], weight: 3 },
  ],
  zombie: [
    { text: 'Personne n’est revenu : le village ferme les portes', requires: [], weight: 3 },
    { text: 'Vingt-quatre heures de silence, la partie s’éteint', requires: [], weight: 3 },
  ],
  inconnu: [
    { text: 'La partie s’achève sans que personne ne sache très bien comment', requires: [], weight: 3 },
    { text: 'Fin de partie : la Chronique note le score et se tait', requires: [], weight: 3 },
  ],
}

export interface GazetteLede extends GazetteTemplate {
  /** Families this paragraph fits; undefined means all of them. */
  readonly families?: readonly GazetteFamily[]
}

/**
 * The lede paragraph. Two entries carry neither `requires` nor `families`:
 * they are the universal fallback that makes the degradation rule total, and
 * removing them would let a fact-less game render an empty chapeau.
 */
export const LEDES: readonly GazetteLede[] = [
  {
    text: 'Au départ : {joueurs} autour de la table. À l’arrivée : {degommages} au compteur des dégommages. La Chronique a tout noté.',
    requires: [],
    weight: 4,
  },
  {
    text: 'Rien ne sera oublié : la Chronique garde la partie n° {code} au chaud, pions compris.',
    requires: [],
    weight: 3,
  },
  {
    text: '{souffre} encaisse {encaisses} dégommages et rentre au village par ses propres moyens.',
    requires: ['souffreDouleur'],
    weight: 6,
  },
  {
    text: 'Fléau des Gaules en titre chez les présents, {titre} avait une réputation à tenir.',
    requires: ['titleHolder'],
    weight: 6,
  },
  {
    text: '{frappeur} distribue les dégommages : {frappes} au compteur, et le sanglier du soir est servi.',
    requires: ['biggestHitter'],
    weight: 5,
  },
  {
    text: '{vainqueur} atteint le village en {duree}, montre en main.',
    requires: ['winner', 'duration'],
    weight: 5,
  },
  {
    text: '{serieur} enchaîne une série de {serie} dégommages — le sentier a tremblé.',
    requires: ['bestRun'],
    weight: 6,
  },
  {
    text: '{souffre} prend {encaisses} dégommages, {frappeur} en distribue {frappes} : la table était partagée.',
    requires: ['souffreDouleur', 'biggestHitter'],
    weight: 4,
  },
  {
    text: 'Pas de village au bout du sentier cette fois : la partie s’arrête là, {joueurs} autour de la table et {degommages} au compteur.',
    requires: [],
    weight: 5,
    families: ['abandon_total', 'abandon_individual', 'zombie', 'inconnu'],
  },
  {
    text: 'Le temps de s’asseoir, et c’était déjà fini : {duree} auront suffi.',
    requires: ['duration'],
    weight: 5,
    families: ['eclair'],
  },
  {
    text: '{duree} sur le sentier : le sanglier a eu le temps de refroidir.',
    requires: ['duration'],
    weight: 5,
    families: ['marathon'],
  },
  {
    text: 'Encaisser {encaisses} dégommages et finir devant : {vainqueur} a le cuir épais.',
    requires: ['souffreDouleur', 'winner'],
    weight: 6,
    families: ['remontada'],
  },
]

export interface GazetteBriefFamily {
  readonly key: GazetteFactKey
  readonly templates: readonly GazetteTemplate[]
}

/**
 * « Brèves du sanglier ». The ORDER of this array is the editorial priority and
 * is never drawn — and it is also the brief's draw slot (SLOT_BRIEF_BASE +
 * index), so reordering it reshuffles every gazette ever rendered. Append at
 * the end; do not permute.
 */
export const BRIEF_FAMILIES: readonly GazetteBriefFamily[] = [
  {
    key: 'stamps',
    templates: [
      { text: 'L’estampille du jour : {estampille}.', requires: ['stamps'], weight: 4 },
      { text: 'La Chronique décerne une estampille : {estampille}.', requires: ['stamps'], weight: 3 },
      { text: 'Estampille au dossier — {estampille}. Ça ne s’efface plus.', requires: ['stamps'], weight: 3 },
    ],
  },
  {
    key: 'bestRun',
    templates: [
      {
        text: '{serieur} enchaîne une série de {serie} dégommages. Le sentier fume encore.',
        requires: ['bestRun'],
        weight: 4,
      },
      { text: 'Série de {serie} pour {serieur} : personne n’a osé s’interposer.', requires: ['bestRun'], weight: 3 },
      { text: '{serie} dégommages coup sur coup : la série est signée {serieur}.', requires: ['bestRun'], weight: 3 },
    ],
  },
  {
    key: 'undoers',
    templates: [
      { text: '{annuleur} a annulé {annulations} fois. Le Sénat enquête.', requires: ['undoers'], weight: 4 },
      {
        text: 'Le stylet de {annuleur} gratte le parchemin : {annulations} au compteur des annulations.',
        requires: ['undoers'],
        weight: 3,
      },
      { text: 'Annulations : {annulations}. Le nom qui revient, c’est {annuleur}.', requires: ['undoers'], weight: 3 },
    ],
  },
  {
    key: 'souffreDouleur',
    templates: [
      {
        text: '{souffre} encaisse {encaisses} dégommages : souffre-douleur du village, sans discussion.',
        requires: ['souffreDouleur'],
        weight: 4,
      },
      {
        text: 'Le village a trouvé son souffre-douleur : {souffre}, {encaisses} dégommages au compteur.',
        requires: ['souffreDouleur'],
        weight: 3,
      },
      {
        text: '{encaisses} dégommages pour {souffre}, souffre-douleur désigné du village. Condoléances.',
        requires: ['souffreDouleur'],
        weight: 3,
      },
    ],
  },
  {
    key: 'quitters',
    templates: [
      { text: '{partant} a quitté le sentier avant la fin. La table continue sans.', requires: ['quitters'], weight: 4 },
      { text: 'Départ anticipé : {partant} quitte la partie, le pion reste.', requires: ['quitters'], weight: 3 },
      { text: '{partant} quitte le sentier en cours de route. Le village n’a rien vu.', requires: ['quitters'], weight: 3 },
    ],
  },
  {
    key: 'cleanSheet',
    templates: [
      {
        text: 'Zéro égratignure pour {intact} : le sentier a regardé ailleurs. Suspect.',
        requires: ['cleanSheet'],
        weight: 4,
      },
      { text: '{intact} traverse la partie sans une égratignure. Idéfix approuve.', requires: ['cleanSheet'], weight: 3 },
      { text: 'Pas une égratignure du côté de {intact}. Le Sénat vérifiera.', requires: ['cleanSheet'], weight: 3 },
    ],
  },
  {
    key: 'biggestHitter',
    templates: [
      { text: '{frappeur} a dégommé {frappes} fois. Le sanglier est mérité.', requires: ['biggestHitter'], weight: 4 },
      {
        text: 'Le sanglier revient à {frappeur} : {frappes} au compteur des dégommages.',
        requires: ['biggestHitter'],
        weight: 3,
      },
      { text: '{frappes} au tableau pour {frappeur}. Personne d’autre n’approche.', requires: ['biggestHitter'], weight: 3 },
    ],
  },
  {
    key: 'validatedBy',
    templates: [
      { text: 'Le chef de camp {chef} a validé la fin sans broncher.', requires: ['validatedBy'], weight: 4 },
      { text: '{chef}, chef de camp, siffle la fin de partie.', requires: ['validatedBy'], weight: 3 },
      { text: 'Fin validée par {chef}. Le village range les pions.', requires: ['validatedBy'], weight: 3 },
    ],
  },
  // Appended at the very end on purpose (plan 040): the array order IS the
  // brief draw slot, so inserting anywhere else would reshuffle every gazette
  // ever rendered. `{prophetie}` may render `1`, hence the invariable wording.
  {
    key: 'oracle',
    templates: [
      {
        text: 'L’Oracle avait vu juste : {prophete} repart avec {prophetie} au compteur des prophéties.',
        requires: ['oracle'],
        weight: 4,
      },
      {
        text: 'Le village consulte {prophete} avant la prochaine : {prophetie} au compteur de l’Oracle.',
        requires: ['oracle'],
        weight: 3,
      },
      { text: 'Prophétie confirmée — {prophete} avait annoncé la couleur.', requires: ['oracle'], weight: 3 },
    ],
  },
]

/**
 * Filler. These claim NOTHING about the game — which is exactly why they are
 * allowed to exist without a fact behind them, and why they may only ever pad a
 * short column, never replace a real brief (see buildGazette).
 */
export const FLAVOUR_BRIEFS: readonly GazetteTemplate[] = [
  { text: 'Assurancetourix demande à chanter la victoire — requête rejetée.', requires: [], weight: 4 },
  { text: 'Idéfix a retrouvé un pion sous la table. Personne ne le réclame.', requires: [], weight: 3 },
  { text: 'Panoramix refuse de commenter la composition de la potion.', requires: [], weight: 3 },
  { text: 'Bonemine trouve le sanglier trop cuit. Le banquet s’en remettra.', requires: [], weight: 3 },
  { text: 'Falbala passe près du sentier. La Gazette perd le fil de sa phrase.', requires: [], weight: 2 },
]
