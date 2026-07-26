/**
 * « Titres gaulois »: six auto-attributed epithets, derived at read time from
 * aggregates the circle's finished games already produce. One title is worn at
 * a time; when several apply, the rarest (fewest holders in the circle) wins.
 *
 * Pure and db-free on purpose: `apps/web/vitest.config.ts` runs unit tests with
 * no database and no env vars. Every user-visible string lives in TITLE_META —
 * retuning the wording after a playtest is an edit to this file only (same
 * rationale as lib/degommage-messages.ts).
 */

export const TITLE_IDS = [
  'increvable',
  'berserker',
  'miracule',
  'pacifiste',
  'revenant',
  'ombre',
] as const

export type TitleId = (typeof TITLE_IDS)[number]

export interface TitleMeta {
  /** Worn under the pseudo. Proper noun — never uppercased by the CSS. */
  readonly label: string
  /** One-line « comment on le gagne », shown as the line's tooltip. */
  readonly hint: string
}

/** Owner-validated wording (round 5). Data, not code. */
export const TITLE_META: Record<TitleId, TitleMeta> = {
  increvable: { label: 'L’Increvable', hint: 'Le plus de parties jouées du village' },
  berserker: { label: 'Le Berserker', hint: 'Record de dégommages dans une seule partie' },
  miracule: {
    label: 'Le Miraculé',
    hint: 'A gagné une partie en étant le plus dégommé de la table',
  },
  pacifiste: { label: 'Le Pacifiste', hint: 'A gagné en dégommant le moins' },
  revenant: { label: 'Le Revenant', hint: 'A gagné après trois défaites d’affilée' },
  ombre: { label: 'L’Ombre', hint: 'Le moins dégommé du village' },
}

/**
 * Accessible name of a podium column. The column is one big <Link>, so the
 * title line there cannot be the tap-to-reveal button it is on the two profile
 * pages (nested interactive elements); the definition rides this label instead.
 * Extracted for the unit tests — `apps/web/vitest.config.ts` has no DOM.
 */
export function podiumRowLabel(username: string, titleId: TitleId | null): string {
  const base = `Voir le profil de ${username}`
  if (titleId === null) return base
  const meta = TITLE_META[titleId]
  return `${base} — ${meta.label} : ${meta.hint}`
}

/**
 * Rarity tie-break, rarest-feeling first. Only consulted when two applicable
 * titles have the SAME number of holders: « Le Miraculé » and « Le Revenant »
 * say the most about a player's table story, « L’Increvable » the least (it is
 * pure volume), so volume loses every tie.
 */
export const TITLE_PRIORITY: readonly TitleId[] = [
  'miracule',
  'revenant',
  'berserker',
  'pacifiste',
  'ombre',
  'increvable',
] as const

/** Consecutive losses that must precede the win for « Le Revenant ». */
export const COMEBACK_LOSSES = 3

/**
 * « L’Ombre » is a minimum over a cumulative counter, so a brand-new member
 * would win it on their first quiet game. Three finished games is the floor
 * that keeps the title meaningful; retune here after a playtest.
 */
export const OMBRE_MIN_GAMES = 3

/** Everything the derivation needs about one circle member. */
export interface TitlePlayerFacts {
  userId: string
  /** Finished, started games this member sat in (aborted games included). */
  gamesPlayed: number
  /** Highest dégommage count in a single game; 0 when they never dégommed. */
  bestCarton: number
  /** Lowest dégommage count among the games they won; null when they never won. */
  quietestWin: number | null
  /**
   * Highest suffered count in a game they won while being (at least tied for)
   * the most-dégommé player of that game; 0 when it never happened.
   */
  bestMiracle: number
  /** Total non-undone dégommages suffered, all-time. */
  taken: number
  /** True when they ever won right after COMEBACK_LOSSES straight losses. */
  hasComeback: boolean
}

/**
 * « Le Miraculé » value per player: the largest suffered count over the games
 * they won while being the most-dégommé of that game. A tie for most-dégommé
 * still counts (the winner did take as many hits as anyone else); a game where
 * the winner was never hit does not. Kept until beaten — that is exactly what
 * taking the maximum means.
 */
export function computeMiracleValues(
  takenByGame: ReadonlyMap<string, ReadonlyMap<string, number>>,
  winners: readonly { gameId: string; winnerId: string }[]
): Map<string, number> {
  const best = new Map<string, number>()
  for (const { gameId, winnerId } of winners) {
    const game = takenByGame.get(gameId)
    if (game === undefined) continue
    const winnerTaken = game.get(winnerId) ?? 0
    if (winnerTaken === 0) continue
    let maxTaken = 0
    for (const count of game.values()) if (count > maxTaken) maxTaken = count
    if (winnerTaken < maxTaken) continue
    if (winnerTaken > (best.get(winnerId) ?? 0)) best.set(winnerId, winnerTaken)
  }
  return best
}

/**
 * Current holders of every title, circle-wide. A title with no holder is
 * absent from the map.
 *
 * Two global rules:
 * - **Cold start**: only members with at least one finished game are eligible;
 *   a member with zero games holds nothing.
 * - **A title everyone holds says nothing**, so it is dropped when its holder
 *   set covers the whole eligible population and that population is 2+. A solo
 *   eligible member keeps their titles (there is nobody to compare them to,
 *   and the village screen shows them their own line).
 */
export function computeTitleHolders(
  facts: readonly TitlePlayerFacts[]
): Map<TitleId, Set<string>> {
  const eligible = facts.filter((f) => f.gamesPlayed > 0)
  const holders = new Map<TitleId, Set<string>>()
  if (eligible.length === 0) return holders

  const put = (id: TitleId, userIds: string[]): void => {
    if (userIds.length > 0) holders.set(id, new Set(userIds))
  }

  const maxOf = (pick: (f: TitlePlayerFacts) => number): number =>
    eligible.reduce((best, f) => Math.max(best, pick(f)), 0)

  const mostGames = maxOf((f) => f.gamesPlayed)
  put('increvable', eligible.filter((f) => f.gamesPlayed === mostGames).map((f) => f.userId))

  const bestCarton = maxOf((f) => f.bestCarton)
  if (bestCarton > 0) {
    put('berserker', eligible.filter((f) => f.bestCarton === bestCarton).map((f) => f.userId))
  }

  const bestMiracle = maxOf((f) => f.bestMiracle)
  if (bestMiracle > 0) {
    put('miracule', eligible.filter((f) => f.bestMiracle === bestMiracle).map((f) => f.userId))
  }

  const winners = eligible.filter((f) => f.quietestWin !== null)
  if (winners.length > 0) {
    const quietest = winners.reduce((best, f) => Math.min(best, f.quietestWin ?? Infinity), Infinity)
    put('pacifiste', winners.filter((f) => f.quietestWin === quietest).map((f) => f.userId))
  }

  put('revenant', eligible.filter((f) => f.hasComeback).map((f) => f.userId))

  const shadows = eligible.filter((f) => f.gamesPlayed >= OMBRE_MIN_GAMES)
  if (shadows.length > 0) {
    const fewest = shadows.reduce((best, f) => Math.min(best, f.taken), Infinity)
    put('ombre', shadows.filter((f) => f.taken === fewest).map((f) => f.userId))
  }

  if (eligible.length >= 2) {
    for (const [id, set] of [...holders]) {
      if (set.size === eligible.length) holders.delete(id)
    }
  }
  return holders
}

/**
 * The single title a player wears: the rarest one they hold (fewest holders),
 * ties broken by TITLE_PRIORITY. Null when they hold none.
 */
export function pickTitle(
  userId: string,
  holders: ReadonlyMap<TitleId, ReadonlySet<string>>
): TitleId | null {
  let best: TitleId | null = null
  let bestCount = Infinity
  for (const id of TITLE_PRIORITY) {
    const set = holders.get(id)
    if (set === undefined || !set.has(userId)) continue
    if (set.size < bestCount) {
      best = id
      bestCount = set.size
    }
  }
  return best
}

/** One member's worn title, as it crosses the wire and the props. */
export interface PlayerTitleEntry {
  userId: string
  title: TitleId
}

/**
 * Worn title of every member who has one, sorted by userId so the SSR seed and
 * the JSON route serialise identically (api-payloads.ts byte-identity rule).
 */
export function buildTitleEntries(facts: readonly TitlePlayerFacts[]): PlayerTitleEntry[] {
  const holders = computeTitleHolders(facts)
  return facts
    .flatMap((f) => {
      const title = pickTitle(f.userId, holders)
      return title === null ? [] : [{ userId: f.userId, title }]
    })
    .sort((a, b) => a.userId.localeCompare(b.userId))
}
