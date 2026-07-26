import { deName } from './elision'
import { hashGameSeq } from './seq-hash'

/**
 * The four registers of the live journal. « baffes » is the default voice —
 * short, physical, ageless — so everything else reads as a surprise rather
 * than a gimmick.
 *
 * The owner validated the SHARES — 60 % baffes / 15 % toutatis / 10 % rome /
 * 15 % chambrage — not the per-template constants, so the vague-2 expansion
 * (2026-07-26, +36 sentences: 12 baffes, 8 per other tone) had to retune the
 * per-tone full weights to hold that mix. Keeping the old 26 / 9 / 5 / 8 would
 * have drifted the catalog to 63.7 / 14.0 / 9.2 / 13.2, because baffes gained
 * the most sentences.
 *
 * The arithmetic. A tone's budget is `nFull × F + nSans × floor(F / 2)`, with
 * nFull / nSans = 23/0 baffes, 11/8 toutatis, 16/3 rome, 12/7 chambrage. A
 * brute-force search over every integer tuple (F ≤ 60) picked
 * `18 / 7 / 4 / 7`, the closest tuple that keeps the weights small enough to
 * stay hand-editable (F ≤ 30):
 *
 *   baffes    23 × 18            = 414 → 60.000 %  (target 60, Δ +0.000)
 *   toutatis  11 × 7  + 8 × 3    = 101 → 14.638 %  (target 15, Δ −0.362)
 *   rome      16 × 4  + 3 × 2    =  70 → 10.145 %  (target 10, Δ +0.145)
 *   chambrage 12 × 7  + 7 × 3    = 105 → 15.217 %  (target 15, Δ +0.217)
 *                                  690 = TOTAL_WEIGHT
 *
 * Lifting the F ≤ 30 bound only buys 0.27 point (59 / 23 / 13 / 22, worst
 * deviation 0.088) for four times bigger numbers — not worth the legibility.
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
   * Full weight per tone: baffes 18, toutatis 7, rome 4, chambrage 7;
   * a `sansActeur` message carries `floor(F / 2)` — 9, 3, 2, 3. Those four
   * numbers are what holds the validated 60 / 15 / 10 / 15 mix; see the header
   * for the arithmetic, and retune them (not the sentences) after a playtest.
   */
  readonly weight: number
}

export const DEGOMMAGE_MESSAGES: readonly DegommageMessage[] = [
  // ---- I. Baffes historiques — 23 × 18 = 414 (60.0 %) ----
  { tone: 'baffes', template: '{acteur} renvoie un pion de {cible} à l’écurie', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: '{acteur} catapulte un pion de {cible} hors du sentier', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: '{acteur} expédie un pion de {cible} au pré', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: '{acteur} dégomme un pion de {cible}, plein sabot', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: '{acteur} envoie valser un pion de {cible}', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: 'Un pion de {cible} décolle. Signé {acteur}', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: '{acteur} sort un pion de {cible} du décor', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: '{acteur} raccompagne un pion de {cible} à l’étable', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: '{acteur} balaie un pion de {cible} d’un revers', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: '{acteur} met un pion de {cible} au tapis', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: '{acteur} claque des doigts : un pion de {cible} rentre', sansActeur: false, weight: 18 },
  // Vague 2 (owner-validated 2026-07-26) — 12 lines, same full weight.
  { tone: 'baffes', template: '{acteur} fauche un pion de {cible} en plein élan', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: '{acteur} éjecte un pion de {cible} du sentier, sans les formes', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: 'Un pion de {cible} mord la poussière. Merci {acteur}', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: '{acteur} souffle un pion de {cible} comme une bougie', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: 'Le pion de {cible} ? Reparti à l’écurie, {acteur} a dit non', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: '{acteur} fait valdinguer un pion de {cible} par-dessus la palissade', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: '{acteur} remet un pion de {cible} au vestiaire', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: '{acteur} coupe la route à un pion de {cible} — demi-tour', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: 'Un pion de {cible} prend la porte, {acteur} tient la poignée', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: '{acteur} tamponne un pion de {cible} — retour à l’expéditeur', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: '{acteur} déloge un pion de {cible} sans sommation', sansActeur: false, weight: 18 },
  { tone: 'baffes', template: '{acteur} plie la rencontre : un pion de {cible} plie bagage', sansActeur: false, weight: 18 },

  // ---- II. Par Toutatis — 11 × 7 + 8 × 3 = 101 (14.6 %) ----
  { tone: 'toutatis', template: 'Par Toutatis ! {acteur} dégomme un pion de {cible}', sansActeur: false, weight: 7 },
  { tone: 'toutatis', template: 'Le ciel tombe sur la tête d’un pion de {cible}', sansActeur: true, weight: 3 },
  { tone: 'toutatis', template: '{acteur} invoque Épona : un pion de {cible} rentre', sansActeur: false, weight: 7 },
  { tone: 'toutatis', template: 'Par Bélénos, {cible} y laisse un pion', sansActeur: true, weight: 3 },
  { tone: 'toutatis', template: '{acteur} sonne le carnyx, {cible} recule d’un pion', sansActeur: false, weight: 7 },
  { tone: 'toutatis', template: 'Un menhir de trop pour un pion de {cible}', sansActeur: true, weight: 3 },
  { tone: 'toutatis', template: 'Épona rappelle un pion de {cible} à l’écurie', sansActeur: true, weight: 3 },
  { tone: 'toutatis', template: 'Le sanglier pour {acteur}, l’écurie pour {cible}', sansActeur: false, weight: 7 },
  { tone: 'toutatis', template: '{acteur} fait tomber le ciel sur un pion de {cible}', sansActeur: false, weight: 7 },
  { tone: 'toutatis', template: '{acteur} pousse le cri, {cible} perd un pion', sansActeur: false, weight: 7 },
  { tone: 'toutatis', template: 'Toutatis a tranché : {cible} rentre un pion', sansActeur: true, weight: 3 },
  // Vague 2 (owner-validated 2026-07-26) — 8 lines.
  { tone: 'toutatis', template: 'Par Toutatis, {cible} y laisse des plumes face à {acteur}', sansActeur: false, weight: 7 },
  { tone: 'toutatis', template: 'Bélénos détourne le regard : {acteur} dégomme un pion de {cible}', sansActeur: false, weight: 7 },
  { tone: 'toutatis', template: 'Le druide n’a rien pu faire pour le pion de {cible}', sansActeur: true, weight: 3 },
  { tone: 'toutatis', template: '{acteur} sacrifie un pion de {cible} aux dieux du sentier', sansActeur: false, weight: 7 },
  { tone: 'toutatis', template: 'Le gui n’a pas porté chance au pion de {cible}', sansActeur: true, weight: 3 },
  { tone: 'toutatis', template: '{acteur} invoque Taranis : la foudre tombe sur un pion de {cible}', sansActeur: false, weight: 7 },
  { tone: 'toutatis', template: 'Les augures étaient formels : un pion de {cible} devait rentrer', sansActeur: true, weight: 3 },
  { tone: 'toutatis', template: 'Par Épona ! Le pion de {cible} rentre au galop, signé {acteur}', sansActeur: false, weight: 7 },

  // ---- III. Rome antique — 16 × 4 + 3 × 2 = 70 (10.1 %) ----
  { tone: 'rome', template: 'Veni, vidi, dégommé : {acteur} contre {cible}', sansActeur: false, weight: 4 },
  { tone: 'rome', template: '{cible} mord la poussière de l’arène', sansActeur: true, weight: 2 },
  { tone: 'rome', template: '{acteur} fête son triomphe, {cible} rentre à pied', sansActeur: false, weight: 4 },
  { tone: 'rome', template: 'Ave {acteur} ! Un pion de {cible} quitte l’arène', sansActeur: false, weight: 4 },
  { tone: 'rome', template: 'La légion de {acteur} bouscule un pion de {cible}', sansActeur: false, weight: 4 },
  { tone: 'rome', template: '{acteur} baisse le pouce : un pion de {cible} sort', sansActeur: false, weight: 4 },
  { tone: 'rome', template: '{acteur} repousse un pion de {cible} hors du limes', sansActeur: false, weight: 4 },
  { tone: 'rome', template: 'Aux lions ! {acteur} dégomme un pion de {cible}', sansActeur: false, weight: 4 },
  { tone: 'rome', template: '{acteur} plante l’aigle, {cible} plie bagage', sansActeur: false, weight: 4 },
  { tone: 'rome', template: '{acteur} trace sa voie, {cible} perd un pion', sansActeur: false, weight: 4 },
  { tone: 'rome', template: 'Un pion de {cible} part aux galères. Merci {acteur}', sansActeur: false, weight: 4 },
  // Vague 2 (owner-validated 2026-07-26) — 8 lines.
  { tone: 'rome', template: 'Le Sénat prend acte : un pion de {cible} capitule devant {acteur}', sansActeur: false, weight: 4 },
  { tone: 'rome', template: 'Ave {acteur} ! Un pion de {cible} te salue bien bas', sansActeur: false, weight: 4 },
  { tone: 'rome', template: 'Rome ne répond plus pour le pion de {cible}', sansActeur: true, weight: 2 },
  { tone: 'rome', template: '{acteur} envoie un pion de {cible} aux galères', sansActeur: false, weight: 4 },
  { tone: 'rome', template: 'Veni, vidi, {acteur} a dégommé un pion de {cible}', sansActeur: false, weight: 4 },
  { tone: 'rome', template: 'La légion de {cible} recule d’un pion', sansActeur: true, weight: 2 },
  { tone: 'rome', template: '{acteur} cloue un pion de {cible} au pilori du forum', sansActeur: false, weight: 4 },
  { tone: 'rome', template: 'Un pion de {cible} finit aux lions. {acteur} applaudit', sansActeur: false, weight: 4 },

  // ---- IV. Chambrage de table — 12 × 7 + 7 × 3 = 105 (15.2 %) ----
  { tone: 'chambrage', template: '{cible} peut retourner s’entraîner', sansActeur: true, weight: 3 },
  { tone: 'chambrage', template: '{acteur} range un pion de {cible}. De rien.', sansActeur: false, weight: 7 },
  { tone: 'chambrage', template: '{acteur} dégomme un pion de {cible}. Aucun regret.', sansActeur: false, weight: 7 },
  { tone: 'chambrage', template: 'Petit détour par l’écurie pour {cible}', sansActeur: true, weight: 3 },
  { tone: 'chambrage', template: '{cible} recompte ses pions. Il en manque un.', sansActeur: true, weight: 3 },
  { tone: 'chambrage', template: '{acteur} dégomme un pion de {cible} et sifflote', sansActeur: false, weight: 7 },
  { tone: 'chambrage', template: '{cible} avait dit « je gère ». Raté.', sansActeur: true, weight: 3 },
  { tone: 'chambrage', template: '{acteur} n’a pas hésité. {cible} rentre un pion.', sansActeur: false, weight: 7 },
  { tone: 'chambrage', template: 'Un pion de {cible} rentre. {acteur} regarde ailleurs.', sansActeur: false, weight: 7 },
  { tone: 'chambrage', template: '{cible} perd un pion, {acteur} perd son sérieux', sansActeur: false, weight: 7 },
  { tone: 'chambrage', template: 'Coup du sort pour {cible}, coup de {acteur} en vrai', sansActeur: false, weight: 7 },
  // Vague 2 (owner-validated 2026-07-26) — 8 lines. The three « personnage »
  // punchlines (Assurancetourix, Panoramix, Obélix) never name the striker, so
  // they are `sansActeur` by the catalog's own rule and carry half the weight.
  { tone: 'chambrage', template: '{cible}, ça va ? Ton pion, lui, non. Signé {acteur}', sansActeur: false, weight: 7 },
  { tone: 'chambrage', template: '{acteur} présente ses condoléances au pion de {cible}', sansActeur: false, weight: 7 },
  { tone: 'chambrage', template: 'Même Idéfix a détourné le regard : {acteur} dégomme {cible}', sansActeur: false, weight: 7 },
  { tone: 'chambrage', template: 'Assurancetourix chantera la chute du pion de {cible}. Personne n’écoutera', sansActeur: true, weight: 3 },
  { tone: 'chambrage', template: 'Panoramix est formel : aucune potion ne ramène le pion de {cible}', sansActeur: true, weight: 3 },
  { tone: 'chambrage', template: 'Abraracourcix lui-même n’aurait pas osé. {acteur}, si', sansActeur: false, weight: 7 },
  { tone: 'chambrage', template: '{cible} range son pion et sa fierté — cadeau de {acteur}', sansActeur: false, weight: 7 },
  { tone: 'chambrage', template: 'Obélix trouve que c’est bien tombé. Le pion de {cible} confirme', sansActeur: true, weight: 3 },
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
