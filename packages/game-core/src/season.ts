/**
 * Calendar « saison » windows of the Classement, hosted in game-core because
 * BOTH workspaces need the same month boundaries (plan 039): apps/web draws the
 * Classement with them, and apps/ws-server awards the title seals
 * (« L’Invaincu », « Le Sanglier d’or », « Tombeur de champion ») with them —
 * and it cannot import from apps/web. Pure `Intl` maths, zero dependencies,
 * which is what makes it eligible for this package.
 *
 * A game counts for the calendar month — Europe/Paris, the app's display
 * timezone (see apps/web/src/components/stats/format.ts) — in which it ended.
 * Plan 027 added the archive: any month resolves to a closed [from, to) pair of
 * UTC instants.
 */

const PARIS_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  timeZoneName: 'longOffset',
})

interface ParisStamp {
  year: number
  month: number
  /** e.g. "+01:00" (CET) or "+02:00" (CEST). */
  offset: string
}

function parisStamp(at: Date): ParisStamp {
  const parts = PARIS_PARTS.formatToParts(at)
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? ''
  const rawOffset = get('timeZoneName').replace('GMT', '')
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    offset: rawOffset === '' ? '+00:00' : rawOffset,
  }
}

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export interface YearMonth {
  year: number
  month: number
}

/** Parses a strict 'YYYY-MM' key; null on anything else. */
export function parseMonthKey(raw: string): YearMonth | null {
  if (!MONTH_KEY_PATTERN.test(raw)) return null
  return { year: Number(raw.slice(0, 4)), month: Number(raw.slice(5, 7)) }
}

export function toMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/**
 * Exact UTC instant of 00:00 on the 1st of (year, month), Paris time.
 * Two passes: the offset guessed from a nearby instant can differ from the
 * offset in force at the boundary around a DST switch (late March / late
 * October); the second pass re-reads the offset at the candidate instant.
 * Never derive month boundaries with Date#setMonth — integer year/month
 * arithmetic plus this resolver is the only correct path (plan 027).
 */
export function startOfMonthParis(year: number, month: number): Date {
  const isoDay = `${year}-${String(month).padStart(2, '0')}-01T00:00:00`
  const guess = parisStamp(new Date(`${isoDay}Z`))
  const candidate = new Date(`${isoDay}${guess.offset}`)
  const second = parisStamp(candidate)
  return new Date(`${isoDay}${second.offset}`)
}

/**
 * Exact UTC instant of 00:00 on the 1st of the current month, Paris time.
 * Two passes because the offset at `now` can differ from the offset at the
 * month boundary when a DST switch happened mid-month (late March / late
 * October); the second pass re-reads the offset at the candidate instant.
 */
export function startOfCurrentMonthParis(now: Date = new Date()): Date {
  const stamp = parisStamp(now)
  return startOfMonthParis(stamp.year, stamp.month)
}

/** Paris-calendar month key ('YYYY-MM') an instant belongs to. */
export function parisMonthKeyOf(at: Date): string {
  const stamp = parisStamp(at)
  return toMonthKey(stamp.year, stamp.month)
}

export function currentParisMonthKey(now: Date = new Date()): string {
  return parisMonthKeyOf(now)
}

export function previousMonthKey(monthKey: string): string | null {
  const parsed = parseMonthKey(monthKey)
  if (parsed === null) return null
  return parsed.month === 1
    ? toMonthKey(parsed.year - 1, 12)
    : toMonthKey(parsed.year, parsed.month - 1)
}

export function nextMonthKey(monthKey: string): string | null {
  const parsed = parseMonthKey(monthKey)
  if (parsed === null) return null
  return parsed.month === 12
    ? toMonthKey(parsed.year + 1, 1)
    : toMonthKey(parsed.year, parsed.month + 1)
}

export interface MonthWindow {
  /** Inclusive lower bound (00:00 Paris on the 1st, as a UTC instant). */
  from: Date
  /** Exclusive upper bound (00:00 Paris on the 1st of the next month). */
  to: Date
}

/** Closed [from, to) UTC window of a Paris calendar month; null on a bad key. */
export function monthWindowParis(monthKey: string): MonthWindow | null {
  const parsed = parseMonthKey(monthKey)
  if (parsed === null) return null
  const next =
    parsed.month === 12
      ? { year: parsed.year + 1, month: 1 }
      : { year: parsed.year, month: parsed.month + 1 }
  return {
    from: startOfMonthParis(parsed.year, parsed.month),
    to: startOfMonthParis(next.year, next.month),
  }
}

/**
 * The fields the village ordering reads. Structurally a subset of
 * `CircleStanding` (apps/web/src/lib/queries/stats.ts) and of the ws-server's
 * month standings, so both can be sorted with the same comparator — which is
 * the point: the seal « Tombeur de champion » must crown exactly the player the
 * Classement chip crowns.
 */
export interface RankedStanding {
  readonly wins: number
  /** Percentage 0-100 over village_reached games only. */
  readonly winrate: number
  readonly degommages: number
  readonly username: string
}

/** Ranking order of the village (design §5.3). Wins > winrate > dégommages. */
export function compareStandings(a: RankedStanding, b: RankedStanding): number {
  return (
    b.wins - a.wins ||
    b.winrate - a.winrate ||
    b.degommages - a.degommages ||
    a.username.localeCompare(b.username, 'fr')
  )
}
