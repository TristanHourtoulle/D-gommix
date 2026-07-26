import { deName } from './elision'
import { hashGameSeq } from './seq-hash'

/**
 * The four registers of the live journal, and the mix the owner validated:
 * 60 % baffes / 15 % toutatis / 10 % rome / 15 % chambrage. « baffes » is the
 * default voice — short, physical, ageless — so everything else reads as a
 * surprise rather than a gimmick.
 */
export const DEGOMMAGE_TONES = ['baffes', 'toutatis', 'rome', 'chambrage'] as const
export type DegommageTone = (typeof DEGOMMAGE_TONES)[number]

export interface DegommageMessage {
  readonly tone: DegommageTone
  /** French sentence with the `{acteur}` and `{cible}` placeholders. */
  readonly template: string
  /**
   * True when the sentence never names the striker: punchier, but it leans on
   * the bronze character badge next to the line to say who did it. Those carry
   * half their tone's weight so they stay a minority.
   */
  readonly sansActeur: boolean
  /**
   * Relative draw weight. Data, not code: retuning the mix after a playtest is
   * an edit to these numbers, and `degommage-messages.test.ts` re-derives the
   * resulting tone shares so a drift cannot go unnoticed.
   *
   * Full weight per tone: baffes 26, toutatis 9, rome 5, chambrage 8;
   * a `sansActeur` message carries `floor(F / 2)`.
   */
  readonly weight: number
}

export const DEGOMMAGE_MESSAGES: readonly DegommageMessage[] = [
  // ---- I. Baffes historiques — 11 × 26 = 286 (59.1 %) ----
  { tone: 'baffes', template: '{acteur} renvoie un pion de {cible} à l’écurie', sansActeur: false, weight: 26 },
  { tone: 'baffes', template: '{acteur} catapulte un pion de {cible} hors du sentier', sansActeur: false, weight: 26 },
  { tone: 'baffes', template: '{acteur} expédie un pion de {cible} au pré', sansActeur: false, weight: 26 },
  { tone: 'baffes', template: '{acteur} dégomme un pion de {cible}, plein sabot', sansActeur: false, weight: 26 },
  { tone: 'baffes', template: '{acteur} envoie valser un pion de {cible}', sansActeur: false, weight: 26 },
  { tone: 'baffes', template: 'Un pion de {cible} décolle. Signé {acteur}', sansActeur: false, weight: 26 },
  { tone: 'baffes', template: '{acteur} sort un pion de {cible} du décor', sansActeur: false, weight: 26 },
  { tone: 'baffes', template: '{acteur} raccompagne un pion de {cible} à l’étable', sansActeur: false, weight: 26 },
  { tone: 'baffes', template: '{acteur} balaie un pion de {cible} d’un revers', sansActeur: false, weight: 26 },
  { tone: 'baffes', template: '{acteur} met un pion de {cible} au tapis', sansActeur: false, weight: 26 },
  { tone: 'baffes', template: '{acteur} claque des doigts : un pion de {cible} rentre', sansActeur: false, weight: 26 },

  // ---- II. Par Toutatis — 6 × 9 + 5 × 4 = 74 (15.3 %) ----
  { tone: 'toutatis', template: 'Par Toutatis ! {acteur} dégomme un pion de {cible}', sansActeur: false, weight: 9 },
  { tone: 'toutatis', template: 'Le ciel tombe sur la tête d’un pion de {cible}', sansActeur: true, weight: 4 },
  { tone: 'toutatis', template: '{acteur} invoque Épona : un pion de {cible} rentre', sansActeur: false, weight: 9 },
  { tone: 'toutatis', template: 'Par Bélénos, {cible} y laisse un pion', sansActeur: true, weight: 4 },
  { tone: 'toutatis', template: '{acteur} sonne le carnyx, {cible} recule d’un pion', sansActeur: false, weight: 9 },
  { tone: 'toutatis', template: 'Un menhir de trop pour un pion de {cible}', sansActeur: true, weight: 4 },
  { tone: 'toutatis', template: 'Épona rappelle un pion de {cible} à l’écurie', sansActeur: true, weight: 4 },
  { tone: 'toutatis', template: 'Le sanglier pour {acteur}, l’écurie pour {cible}', sansActeur: false, weight: 9 },
  { tone: 'toutatis', template: '{acteur} fait tomber le ciel sur un pion de {cible}', sansActeur: false, weight: 9 },
  { tone: 'toutatis', template: '{acteur} pousse le cri, {cible} perd un pion', sansActeur: false, weight: 9 },
  { tone: 'toutatis', template: 'Toutatis a tranché : {cible} rentre un pion', sansActeur: true, weight: 4 },

  // ---- III. Rome antique — 10 × 5 + 1 × 2 = 52 (10.7 %) ----
  { tone: 'rome', template: 'Veni, vidi, dégommé : {acteur} contre {cible}', sansActeur: false, weight: 5 },
  { tone: 'rome', template: '{cible} mord la poussière de l’arène', sansActeur: true, weight: 2 },
  { tone: 'rome', template: '{acteur} fête son triomphe, {cible} rentre à pied', sansActeur: false, weight: 5 },
  { tone: 'rome', template: 'Ave {acteur} ! Un pion de {cible} quitte l’arène', sansActeur: false, weight: 5 },
  { tone: 'rome', template: 'La légion de {acteur} bouscule un pion de {cible}', sansActeur: false, weight: 5 },
  { tone: 'rome', template: '{acteur} baisse le pouce : un pion de {cible} sort', sansActeur: false, weight: 5 },
  { tone: 'rome', template: '{acteur} repousse un pion de {cible} hors du limes', sansActeur: false, weight: 5 },
  { tone: 'rome', template: 'Aux lions ! {acteur} dégomme un pion de {cible}', sansActeur: false, weight: 5 },
  { tone: 'rome', template: '{acteur} plante l’aigle, {cible} plie bagage', sansActeur: false, weight: 5 },
  { tone: 'rome', template: '{acteur} trace sa voie, {cible} perd un pion', sansActeur: false, weight: 5 },
  { tone: 'rome', template: 'Un pion de {cible} part aux galères. Merci {acteur}', sansActeur: false, weight: 5 },

  // ---- IV. Chambrage de table — 7 × 8 + 4 × 4 = 72 (14.9 %) ----
  { tone: 'chambrage', template: '{cible} peut retourner s’entraîner', sansActeur: true, weight: 4 },
  { tone: 'chambrage', template: '{acteur} range un pion de {cible}. De rien.', sansActeur: false, weight: 8 },
  { tone: 'chambrage', template: '{acteur} dégomme un pion de {cible}. Aucun regret.', sansActeur: false, weight: 8 },
  { tone: 'chambrage', template: 'Petit détour par l’écurie pour {cible}', sansActeur: true, weight: 4 },
  { tone: 'chambrage', template: '{cible} recompte ses pions. Il en manque un.', sansActeur: true, weight: 4 },
  { tone: 'chambrage', template: '{acteur} dégomme un pion de {cible} et sifflote', sansActeur: false, weight: 8 },
  { tone: 'chambrage', template: '{cible} avait dit « je gère ». Raté.', sansActeur: true, weight: 4 },
  { tone: 'chambrage', template: '{acteur} n’a pas hésité. {cible} rentre un pion.', sansActeur: false, weight: 8 },
  { tone: 'chambrage', template: 'Un pion de {cible} rentre. {acteur} regarde ailleurs.', sansActeur: false, weight: 8 },
  { tone: 'chambrage', template: '{cible} perd un pion, {acteur} perd son sérieux', sansActeur: false, weight: 8 },
  { tone: 'chambrage', template: 'Coup du sort pour {cible}, coup de {acteur} en vrai', sansActeur: false, weight: 8 },
]

/** Sum of every weight — the modulus of the weighted walk. */
export const TOTAL_WEIGHT = DEGOMMAGE_MESSAGES.reduce((sum, message) => sum + message.weight, 0)

/** `de {acteur}` / `de {cible}`, the only spots where élision applies. */
const ELIDABLE_PLACEHOLDER = /\bde \{(acteur|cible)\}/g

/**
 * Fills a template. `de {nom}` becomes `d’<nom>` before a vowel or an « h »
 * (see `elision.ts`); the remaining placeholders are substituted as-is.
 */
export function renderDegommageTemplate(template: string, acteur: string, cible: string): string {
  return template
    .replace(ELIDABLE_PLACEHOLDER, (_match, key: string) => deName(key === 'acteur' ? acteur : cible))
    .split('{acteur}')
    .join(acteur)
    .split('{cible}')
    .join(cible)
}

/**
 * Weighted walk over the catalog, seeded by the game id *and* the event's `seq`
 * so every phone lands on the same sentence — after a reload, after a late
 * resync, forever — while two different games draw two different sequences
 * (see `seq-hash.ts`: seeding on `seq` alone replayed the same few sentences
 * game after game).
 *
 * `previousIndex` is the index picked for the *previous* dégommage of the same
 * game; when the walk lands on it again the pick shifts one slot forward, which
 * keeps the result deterministic while making an immediate repeat impossible.
 */
export function pickDegommageIndex(
  gameId: string,
  seq: number,
  previousIndex: number | null
): number {
  let remaining = hashGameSeq(gameId, seq) % TOTAL_WEIGHT
  let index = DEGOMMAGE_MESSAGES.length - 1
  for (let i = 0; i < DEGOMMAGE_MESSAGES.length; i++) {
    const message = DEGOMMAGE_MESSAGES[i]
    if (!message) break
    remaining -= message.weight
    if (remaining < 0) {
      index = i
      break
    }
  }
  return index === previousIndex ? (index + 1) % DEGOMMAGE_MESSAGES.length : index
}

/** One dégommage, reduced to what the picker needs. */
export interface DegommageRef {
  readonly seq: number
  readonly actorId: string
  readonly targetId: string
}

/**
 * Renders the sentence of every dégommage of a game, in `seq` order, as a
 * `seq → label` lookup. Folding over the whole ordered list (rather than
 * picking per event in isolation) is what makes the no-immediate-repeat rule
 * reproducible: the same list always yields the same labels, on every device.
 *
 * `gameId` seeds the draw together with each `seq`, so the archive of a game
 * replays exactly what its table read live, and two games never open on the
 * same sentence.
 *
 * Undone dégommages keep their sentence — an `UNDO` appends its own generic
 * line, it never rewrites history.
 */
export function renderDegommageJournal(
  gameId: string,
  refs: readonly DegommageRef[],
  name: (userId: string) => string
): Map<number, string> {
  const labels = new Map<number, string>()
  let previousIndex: number | null = null
  for (const ref of refs) {
    const index = pickDegommageIndex(gameId, ref.seq, previousIndex)
    previousIndex = index
    const message = DEGOMMAGE_MESSAGES[index]
    if (!message) continue
    labels.set(ref.seq, renderDegommageTemplate(message.template, name(ref.actorId), name(ref.targetId)))
  }
  return labels
}
