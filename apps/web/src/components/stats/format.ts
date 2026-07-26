import type { GameFormat } from '@degommix/game-core'

const FORMAT_LABELS: Record<GameFormat, string> = { 2: '1v1', 3: '3J', 4: '4J' }

export function formatGameFormat(format: GameFormat): string {
  return FORMAT_LABELS[format]
}

/** "18:47" style clock for the duration stat tile. */
export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** "18 min 47 s" style duration for prose. */
export function formatDurationProse(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s} s`
  return s === 0 ? `${m} min` : `${m} min ${s} s`
}

const dayTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
})

/** "25 juillet à 14:02" */
export function formatDayTime(date: Date): string {
  return dayTimeFormatter.format(date)
}

const monthYearFormatter = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Paris',
})

/** "juillet 2026" from a 'YYYY-MM' month key (mid-month day dodges tz edges). */
export function formatMonthKey(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))
  if (!Number.isInteger(year) || !Number.isInteger(month)) return monthKey
  return monthYearFormatter.format(new Date(Date.UTC(year, month - 1, 15)))
}

const clockTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'Europe/Paris',
})

/** "14:02:37" journal timestamp. */
export function formatEventTime(date: Date): string {
  return clockTimeFormatter.format(date)
}
