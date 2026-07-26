/**
 * Month-to-date « saison » window of the Classement (design decision,
 * plan 019): a game counts for the calendar month — Europe/Paris, the app's
 * display timezone (see components/stats/format.ts) — in which it ended.
 * No archives: the only window ever computed is the current month's start.
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

/**
 * Exact UTC instant of 00:00 on the 1st of the current month, Paris time.
 * Two passes because the offset at `now` can differ from the offset at the
 * month boundary when a DST switch happened mid-month (late March / late
 * October); the second pass re-reads the offset at the candidate instant.
 */
export function startOfCurrentMonthParis(now: Date = new Date()): Date {
  const first = parisStamp(now)
  const isoDay = `${first.year}-${String(first.month).padStart(2, '0')}-01T00:00:00`
  const candidate = new Date(`${isoDay}${first.offset}`)
  const second = parisStamp(candidate)
  return new Date(`${isoDay}${second.offset}`)
}
