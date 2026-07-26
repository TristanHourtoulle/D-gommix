import { type StampEvent } from './game-stamps'
import { hashGameSeq } from './seq-hash'

/**
 * « Le Barde commente » — ambient Assurancetourix asides derived from a game's
 * ordered event log and its server-anchored chrono.
 *
 * Pure and db-free, like `./game-stamps.ts` and `./rivalries.ts`:
 * `apps/web/vitest.config.ts` runs unit tests with no database and no env vars.
 *
 * NOTHING HERE IS STORED, SENT OR ARCHIVED. A barde line is table ambiance,
 * not a claim about the game: it never becomes a `GameEvent`, never crosses a
 * socket, never reaches `game_events`, and never appears in the game archive
 * (`/parties/[gameId]`) or the Gazette. The archive is the faithful record —
 * plan 025 made it replay the exact sentences the table read live precisely
 * because fidelity is its whole value — and a second, non-factual voice would
 * turn a joke into a record. Plan 029 settled the identical question for
 * taunts; see `plans/044-barde-commente.md` Decision 1.
 *
 * Determinism: every phone folds the same log and draws from the same seed, so
 * the same line appears at the same place on every screen, after a reload and
 * after a late resync. Four of the five milestones involve no clock at all.
 * The fifth is chrono-gated and can differ by up to about a second between
 * phones (the server offset carries each phone's one-way latency, uncorrected
 * — `hooks/use-game.ts:36,47`); its POSITION in the journal is still derived
 * from the log, so it never moves after a reload.
 */

/** Every milestone the barde knows how to comment. Owner-validated set — closed. */
export const BARDE_MILESTONE_IDS = [
  'dix_degommages',
  'remontada_en_cours',
  'tous_sur_un',
  'egalite_parfaite',
  'cinq_minutes',
] as const
export type BardeMilestoneId = (typeof BARDE_MILESTONE_IDS)[number]

/** Surviving dégommages that make « dix dégommages cumulés ». */
export const BARDE_DEGOMMAGE_THRESHOLD = 10
/** Both strict maxima must reach this before « remontada en cours » is a claim. */
export const BARDE_REMONTADA_MIN = 2
/** Below this many surviving hits, « tous sur un » is noise, not a pile-on. */
export const BARDE_PILE_ON_MIN_TOTAL = 6
/** Server-anchored elapsed play behind « cinq minutes ». */
export const BARDE_FIVE_MINUTES_MS = 300_000

/**
 * Arbitration when several milestones start holding on the same dégommage: at
 * most ONE row per `seq`, and the loser is not lost — it is re-tested on the
 * next hit and fires there if it still holds.
 *
 * `dix_degommages` leads because it marks a *crossing*: it stops being true
 * about "this moment" if it slips to a later hit. Then the two rarest claims,
 * `remontada_en_cours` and `tous_sur_un`. `egalite_parfaite` goes last because
 * it is by far the most likely to recur, so postponing it costs the least.
 */
const BARDE_PRIORITY: readonly BardeMilestoneId[] = [
  'dix_degommages',
  'remontada_en_cours',
  'tous_sur_un',
  'egalite_parfaite',
]

export interface BardeMilestoneMeta {
  readonly id: BardeMilestoneId
  /** French one-liner naming the trigger. Documentation and test oracle. */
  readonly hint: string
  /**
   * The lines the barde may draw for this milestone. DATA, not code: the
   * owner's retouche pass is an edit to these strings and nothing else — no
   * weight, no priority and no predicate depends on their number or wording,
   * only on the array being non-empty. Every line below is a DRAFT awaiting
   * that pass (see `plans/044-barde-commente.md` Decision 4).
   */
  readonly lines: readonly string[]
}

export const BARDE_MILESTONES: Record<BardeMilestoneId, BardeMilestoneMeta> = {
  dix_degommages: {
    id: 'dix_degommages',
    hint: 'Dix dégommages cumulés dans la partie',
    lines: [
      'Dix pions à l’écurie : Assurancetourix y voit le sujet de son chef-d’œuvre',
      'Dix dégommages ! Le barde réclame le silence pour immortaliser ça',
      'Assurancetourix compte dix pions tombés — un par corde, ou presque',
    ],
  },
  remontada_en_cours: {
    id: 'remontada_en_cours',
    hint: 'Le plus dégommé est aussi celui qui dégomme le plus',
    lines: [
      'Le plus tabassé est aussi le plus mordant — Assurancetourix sent venir la légende',
      'Assurancetourix affûte sa remontada : le souffre-douleur rend coup pour coup',
      'Le barde tient son titre : celui qui rendait tout. Les paroles viendront',
    ],
  },
  tous_sur_un: {
    id: 'tous_sur_un',
    hint: 'Un joueur encaisse plus de la moitié des dégommages',
    lines: [
      'Toute la table sur le même pion : Assurancetourix prépare une complainte en trois actes',
      'Le barde s’émeut : il n’y a qu’une victime, et beaucoup de coupables',
      'Assurancetourix dédie sa plus triste chanson au plus dégommé d’entre vous',
    ],
  },
  egalite_parfaite: {
    id: 'egalite_parfaite',
    hint: 'Tous les joueurs ont encaissé le même nombre de dégommages',
    lines: [
      'Égalité parfaite. Assurancetourix trouve ça très beau, donc très chantable',
      'Tout le monde à la même enseigne — le barde appelle ça de l’harmonie',
      'Match nul aux pions tombés : Assurancetourix hésite entre l’ode et la complainte',
    ],
  },
  cinq_minutes: {
    id: 'cinq_minutes',
    hint: 'Cinq minutes de partie au chrono serveur',
    lines: [
      'Assurancetourix note : cinq minutes de combat, et déjà matière à trois couplets',
      'Le barde accorde sa lyre — cinq minutes que ça dure, il faut bien un hymne',
      'Cinq minutes déjà. Assurancetourix prépare le refrain, personne ne l’a demandé',
    ],
  },
}

/**
 * The line this game draws for `id`. Seeded by the game id and the milestone's
 * INDEX — never its anchor `seq`, which moves when a dégommage is undone and
 * would rewrite a line the table already read. `hashGameSeq` is the app's only
 * random-looking primitive (`./seq-hash.ts`); `Math.random()` is banned here
 * because every phone must land on the same line.
 */
export function pickBardeLine(gameId: string, id: BardeMilestoneId): string {
  const index = BARDE_MILESTONE_IDS.indexOf(id)
  const lines = BARDE_MILESTONES[id].lines
  return lines[hashGameSeq(gameId, index) % lines.length] ?? lines[0] ?? ''
}

/** Milliseconds left before the five-minute milestone, 0 once reached. */
export function bardeTimeRemainingMs(
  startedAtMs: number | null,
  serverOffsetMs: number,
  nowMs: number = Date.now()
): number {
  if (startedAtMs === null || !Number.isFinite(startedAtMs)) return BARDE_FIVE_MINUTES_MS
  const elapsed = nowMs + serverOffsetMs - startedAtMs
  return Math.max(0, BARDE_FIVE_MINUTES_MS - elapsed)
}

/** Whether five minutes of server-anchored play have elapsed. */
export function bardeTimeReached(
  startedAtMs: number | null,
  serverOffsetMs: number,
  nowMs: number = Date.now()
): boolean {
  if (startedAtMs === null || !Number.isFinite(startedAtMs)) return false
  return nowMs + serverOffsetMs - startedAtMs >= BARDE_FIVE_MINUTES_MS
}

/** One barde line, pinned after a journal `seq`. */
export interface BardeRow {
  readonly id: BardeMilestoneId
  /** The line sits immediately AFTER the journal line of this `seq`. */
  readonly anchorSeq: number
  readonly text: string
}

/**
 * The seats of the game, read defensively out of `GAME_STARTED`'s `unknown`
 * payload in the style of `./game-stamps.ts`. An empty result means "unknown
 * seats", which makes the three seat-dependent milestones unavailable rather
 * than wrong — the honest degradation for a partial replay.
 */
function readSeats(events: readonly StampEvent[]): string[] {
  const start = events.find((event) => event.type === 'GAME_STARTED')
  const payload = start?.payload
  if (payload === null || typeof payload !== 'object' || !('players' in payload)) return []
  const players = (payload as Record<string, unknown>).players
  if (!Array.isArray(players)) return []
  const seats: string[] = []
  for (const player of players as readonly unknown[]) {
    if (player === null || typeof player !== 'object' || !('userId' in player)) continue
    const userId = (player as Record<string, unknown>).userId
    if (typeof userId === 'string') seats.push(userId)
  }
  return seats
}

/** `seq` of every dégommage cancelled by an UNDO in this log. */
function undoneSeqs(events: readonly StampEvent[]): Set<number> {
  const seqs = new Set<number>()
  for (const event of events) {
    if (event.type !== 'UNDO') continue
    const payload = event.payload
    if (payload === null || typeof payload !== 'object' || !('targetSeq' in payload)) continue
    const targetSeq = (payload as Record<string, unknown>).targetSeq
    if (typeof targetSeq === 'number') seqs.add(targetSeq)
  }
  return seqs
}

/** A dégommage that actually counts towards a milestone. */
interface BardeHit {
  readonly seq: number
  readonly actorId: string
  readonly targetId: string
}

/**
 * The dégommages a milestone may be based on, in `seq` order — the same undo
 * semantics `./game-stamps.ts:139-160` states for stamps: an undone dégommage
 * is dropped, which is what makes it unable to trigger OR sustain anything.
 *
 * Deliberately not `survivingHits` from that module: this fold needs `dealt`,
 * `taken` and a running total at once, which that helper does not provide, and
 * exporting it would widen a private contract for one caller.
 */
function survivingHits(events: readonly StampEvent[]): BardeHit[] {
  const undone = undoneSeqs(events)
  const hits: BardeHit[] = []
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (event.type !== 'DEGOMMAGE') continue
    const { actorId, targetId } = event
    if (actorId === null || targetId === null || actorId === targetId) continue
    if (undone.has(event.seq)) continue
    hits.push({ seq: event.seq, actorId, targetId })
  }
  return hits
}

/** The one seat holding the strict maximum of `counts`, or `null` on any tie. */
function strictLeader(
  seats: readonly string[],
  counts: ReadonlyMap<string, number>
): { readonly id: string; readonly value: number } | null {
  let leader: string | null = null
  let best = -1
  let tied = false
  for (const seat of seats) {
    const value = counts.get(seat) ?? 0
    if (value > best) {
      best = value
      leader = seat
      tied = false
    } else if (value === best) {
      tied = true
    }
  }
  if (leader === null || tied) return null
  return { id: leader, value: best }
}

/**
 * The ambient lines this game has earned, most-anchored-last. Linear in the
 * log — a live game holds a few dozen events, so nothing here memoises.
 *
 * `timeReached` is passed in rather than read from a clock so this stays a
 * pure function: the caller owns the single `setTimeout` that flips it.
 */
export function detectBardeRows(
  gameId: string,
  events: readonly StampEvent[],
  startedAtMs: number | null,
  timeReached: boolean
): BardeRow[] {
  if (events.length === 0) return []

  const seats = readSeats(events)
  const seatsKnown = seats.length > 0
  const hits = survivingHits(events)

  const dealt = new Map<string, number>()
  const taken = new Map<string, number>()
  const fired = new Set<BardeMilestoneId>()
  const claimed = new Set<number>()
  const rows: BardeRow[] = []
  let total = 0

  // Pass 1 — the four event-anchored milestones, at most one row per hit.
  for (const hit of hits) {
    dealt.set(hit.actorId, (dealt.get(hit.actorId) ?? 0) + 1)
    taken.set(hit.targetId, (taken.get(hit.targetId) ?? 0) + 1)
    total += 1

    const takenLeader = seatsKnown ? strictLeader(seats, taken) : null
    const dealtLeader = seatsKnown ? strictLeader(seats, dealt) : null
    const holds = (id: BardeMilestoneId): boolean => {
      switch (id) {
        case 'dix_degommages':
          return total >= BARDE_DEGOMMAGE_THRESHOLD
        case 'remontada_en_cours':
          return (
            takenLeader !== null &&
            dealtLeader !== null &&
            takenLeader.id === dealtLeader.id &&
            takenLeader.value >= BARDE_REMONTADA_MIN &&
            dealtLeader.value >= BARDE_REMONTADA_MIN
          )
        case 'tous_sur_un':
          return (
            total >= BARDE_PILE_ON_MIN_TOTAL &&
            takenLeader !== null &&
            takenLeader.value * 2 > total
          )
        case 'egalite_parfaite': {
          const [head] = seats
          if (!seatsKnown || seats.length < 2 || head === undefined) return false
          const shared = taken.get(head) ?? 0
          if (shared < 1) return false
          return seats.every((seat) => (taken.get(seat) ?? 0) === shared)
        }
        case 'cinq_minutes':
          return false
      }
    }

    const id = BARDE_PRIORITY.find((candidate) => !fired.has(candidate) && holds(candidate))
    if (id === undefined) continue
    fired.add(id)
    claimed.add(hit.seq)
    rows.push({ id, anchorSeq: hit.seq, text: pickBardeLine(gameId, id) })
  }

  // Pass 2 — the clock line. Its anchor is the last event inside the window,
  // a value that can no longer move once five minutes have passed (no later
  // event can enter it), which is what keeps its position stable across a
  // reload. It yields every collision to pass 1: a line about the clock is
  // worth less than a line about the game.
  if (timeReached && startedAtMs !== null && Number.isFinite(startedAtMs)) {
    const seqs = events.map((event) => event.seq).sort((a, b) => a - b)
    const deadline = startedAtMs + BARDE_FIVE_MINUTES_MS
    const last = seqs[seqs.length - 1]
    let inWindow: number | null = null
    for (const event of events) {
      if (event.at <= deadline && (inWindow === null || event.seq > inWindow)) inWindow = event.seq
    }
    const start = inWindow ?? seqs[0]
    if (start !== undefined && last !== undefined) {
      let anchor: number = start
      while (claimed.has(anchor)) {
        const floor = anchor
        const next = seqs.find((seq) => seq > floor)
        if (next === undefined) {
          anchor = last + 1
          break
        }
        anchor = next
      }
      rows.push({
        id: 'cinq_minutes',
        anchorSeq: anchor,
        text: pickBardeLine(gameId, 'cinq_minutes'),
      })
    }
  }

  return rows.sort((a, b) => a.anchorSeq - b.anchorSeq)
}
