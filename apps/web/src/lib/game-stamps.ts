/**
 * Highlight « moments » of a game, derived from its ordered event log.
 *
 * Pure and db-free on purpose, like `./rivalries.ts`: `apps/web/vitest.config.ts`
 * runs unit tests with no database and no env vars, and the very same functions
 * run on the server (game archive) and in the browser (live journal). One
 * derivation, two surfaces — the archive of a game must stamp exactly what its
 * table saw live, the way plan 025 made the archive replay the live sentences.
 *
 * Nothing here is stored: a stamp is a claim about the event log, recomputed
 * from it every time.
 */

/** Every moment this app knows how to name. Owner-validated set — closed. */
export const STAMP_IDS = [
  'premier_sang',
  'vengeance',
  'triple',
  'carnage',
  'sans_pitie',
  'remontada',
] as const
export type StampId = (typeof STAMP_IDS)[number]

export interface StampMeta {
  readonly id: StampId
  /** Owner-validated French wording printed on the stamp. Do not reword. */
  readonly label: string
  /** One-line French explanation — the stamp's accessible description. */
  readonly hint: string
}

export const STAMP_META: Record<StampId, StampMeta> = {
  premier_sang: {
    id: 'premier_sang',
    label: 'Premier sang',
    hint: 'Premier dégommage de la partie',
  },
  vengeance: {
    id: 'vengeance',
    label: 'Vengeance !',
    hint: 'Rendu au dégommeur, coup pour coup',
  },
  triple: {
    id: 'triple',
    label: 'Triplé !',
    hint: 'Trois dégommages d’affilée',
  },
  carnage: {
    id: 'carnage',
    label: 'Carnage',
    hint: 'Quatre dégommages dans la même partie',
  },
  sans_pitie: {
    id: 'sans_pitie',
    label: 'Sans pitié',
    hint: 'Deux fois la même victime en moins de deux minutes',
  },
  remontada: {
    id: 'remontada',
    label: 'Remontada',
    hint: 'Vainqueur alors qu’il a perdu le plus de pions',
  },
}

/** Consecutive dégommages by one player that make a « Triplé ! ». */
export const TRIPLE_RUN = 3
/** Dégommages by one player in a game that make a « Carnage ». */
export const CARNAGE_THRESHOLD = 4
/** Window in which two hits on the same target read as « Sans pitié ». */
export const SANS_PITIE_WINDOW_MS = 120_000

/**
 * Exactly one stamp is printed per journal line. When several triggers fire on
 * the same dégommage, the first id of this list wins.
 *
 * `carnage` leads because it is the only trigger that can fire at most once per
 * player per game: masking it would lose it, while a masked vengeance / triplé /
 * sans pitié is very likely to recur. The rest is the owner's order. Note that
 * `vengeance` and `triple` can never collide — a triplé's third line has the
 * same actor as its predecessor, whereas a vengeance needs the predecessor's
 * actor to be the current *target*, which would make it a self-dégommage.
 */
const LINE_STAMP_PRIORITY: readonly StampId[] = [
  'carnage',
  'vengeance',
  'triple',
  'sans_pitie',
  'premier_sang',
]

/** One `game_events` row of a SINGLE game, narrowed to what detection needs. */
export interface StampEvent {
  readonly seq: number
  readonly type: string
  readonly actorId: string | null
  readonly targetId: string | null
  readonly payload: unknown
  /**
   * Event time in epoch milliseconds. The two callers hold two different
   * shapes — `Date` in the archive (`RawEvent.createdAt`), ISO string live
   * (`GameEvent.createdAt`) — so the shared contract is the number.
   */
  readonly at: number
}

function readTargetSeq(payload: unknown): number | null {
  if (payload !== null && typeof payload === 'object' && 'targetSeq' in payload) {
    const value = (payload as Record<string, unknown>).targetSeq
    if (typeof value === 'number') return value
  }
  return null
}

/**
 * `seq` of every dégommage cancelled by an UNDO. Same rule as
 * `undoneKeys` in `./rivalries.ts`, minus the game id: that aggregation walks
 * many games at once (where `seq` restarts at 1 in each), this one always
 * receives a single game's log.
 */
function undoneSeqs(events: readonly StampEvent[]): Set<number> {
  const seqs = new Set<number>()
  for (const event of events) {
    if (event.type !== 'UNDO') continue
    const targetSeq = readTargetSeq(event.payload)
    if (targetSeq !== null) seqs.add(targetSeq)
  }
  return seqs
}

/** A dégommage that actually counts: not undone, real actor, real target. */
interface Hit {
  readonly seq: number
  readonly actorId: string
  readonly targetId: string
  readonly at: number
}

/**
 * The dégommages a stamp may be based on, in `seq` order. An undone dégommage
 * is dropped here, which is what makes it unable to trigger OR sustain any
 * stamp — its journal sentence stays (an UNDO appends its own line, it never
 * rewrites one), its claim does not.
 *
 * Sorting defensively costs nothing on a few dozen rows and removes a whole
 * class of drift: both callers already order by `seq`, and nothing downstream
 * should silently depend on them continuing to.
 */
function survivingHits(events: readonly StampEvent[]): Hit[] {
  const undone = undoneSeqs(events)
  const hits: Hit[] = []
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (event.type !== 'DEGOMMAGE') continue
    const { actorId, targetId } = event
    if (actorId === null || targetId === null || actorId === targetId) continue
    if (undone.has(event.seq)) continue
    hits.push({ seq: event.seq, actorId, targetId, at: event.at })
  }
  return hits
}

/** A streak of consecutive dégommages dealt by one player, in `seq` order. */
export interface HitRun {
  readonly actorId: string
  /** `seq` of every surviving dégommage of the streak, in order. */
  readonly seqs: readonly number[]
}

/**
 * Maximal streaks of consecutive dégommages by the same player, over hits
 * already filtered of undone ones and sorted by `seq`. A streak ends the
 * moment another player scores; an undone dégommage neither sustains nor
 * breaks one, because it never reaches this list.
 *
 * Single source of truth for « d'affilée » in this app: `detectLineStamps`
 * stamps « Triplé ! » on every third hit of a run, and the live « Tableau des
 * augures » (`lib/augures.ts`) reads the longest run's true length. The two
 * must never drift apart, which is why neither counts on its own.
 */
export function actorRuns(
  hits: readonly { readonly seq: number; readonly actorId: string }[]
): HitRun[] {
  const runs: HitRun[] = []
  let current: { actorId: string; seqs: number[] } | null = null
  for (const hit of hits) {
    if (current !== null && current.actorId === hit.actorId) {
      current.seqs.push(hit.seq)
      continue
    }
    current = { actorId: hit.actorId, seqs: [hit.seq] }
    runs.push(current)
  }
  return runs
}

/**
 * `seq → stamp` of every journal line that deserves one, at most one per line
 * (see LINE_STAMP_PRIORITY). Pure fold over the log: same rows in, same map
 * out, on every device and forever.
 */
export function detectLineStamps(events: readonly StampEvent[]): Map<number, StampId> {
  const hits = survivingHits(events)
  const stamps = new Map<number, StampId>()
  /** Non-undone dégommages dealt so far, per player. */
  const dealt = new Map<string, number>()
  /** Epoch ms of the previous surviving hit on each target. */
  const lastHitOnTarget = new Map<string, number>()
  // « Triplé ! » fires on the 3rd, 6th, 9th… hit WITHIN a run — which is
  // exactly what the previous inline counter encoded by resetting itself to
  // zero after each triplé.
  const tripleSeqs = new Set<number>()
  for (const run of actorRuns(hits)) {
    run.seqs.forEach((seq, index) => {
      if ((index + 1) % TRIPLE_RUN === 0) tripleSeqs.add(seq)
    })
  }

  for (const [index, hit] of hits.entries()) {
    const previous = index > 0 ? hits[index - 1] : undefined
    const total = (dealt.get(hit.actorId) ?? 0) + 1
    dealt.set(hit.actorId, total)

    const fired = new Set<StampId>()
    // `=== CARNAGE_THRESHOLD`, not `>=`: the stamp marks the moment the
    // threshold is crossed, so it fires exactly once per player per game.
    if (total === CARNAGE_THRESHOLD) fired.add('carnage')
    if (
      previous !== undefined &&
      previous.actorId === hit.targetId &&
      previous.targetId === hit.actorId
    ) {
      fired.add('vengeance')
    }
    if (tripleSeqs.has(hit.seq)) fired.add('triple')
    const previousOnTarget = lastHitOnTarget.get(hit.targetId)
    if (previousOnTarget !== undefined && hit.at - previousOnTarget <= SANS_PITIE_WINDOW_MS) {
      fired.add('sans_pitie')
    }
    if (index === 0) fired.add('premier_sang')

    lastHitOnTarget.set(hit.targetId, hit.at)

    const chosen = LINE_STAMP_PRIORITY.find((id) => fired.has(id))
    if (chosen !== undefined) stamps.set(hit.seq, chosen)
  }

  return stamps
}

/**
 * Non-undone dégommages suffered per player, from one game's ordered log.
 * Mirrors `aggregateTakenCounts` in `./rivalries.ts` for the single-game case.
 */
export function takenFromEvents(events: readonly StampEvent[]): Map<string, number> {
  const taken = new Map<string, number>()
  for (const hit of survivingHits(events)) {
    taken.set(hit.targetId, (taken.get(hit.targetId) ?? 0) + 1)
  }
  return taken
}

/**
 * The end-of-game stamp: « Remontada » when the winner is the player who lost
 * the most pions. A STRICT maximum is required — a tie would make the claim
 * false — and a winner who never lost a pion gets nothing.
 *
 * Takes the already-aggregated counts rather than the log so the live summary
 * can feed it `takenByTarget(state)` (always complete, even when no raw event
 * was recorded) while the archive feeds it `takenFromEvents(rows)`.
 */
export function detectSummaryStamp(
  taken: ReadonlyMap<string, number>,
  winnerId: string | null
): StampId | null {
  if (winnerId === null) return null
  const winnerTaken = taken.get(winnerId) ?? 0
  if (winnerTaken === 0) return null
  for (const [userId, count] of taken) {
    if (userId !== winnerId && count >= winnerTaken) return null
  }
  return 'remontada'
}
