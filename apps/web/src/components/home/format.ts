import type { GameFormat } from '@degommix/game-core'

/** « 1v1 » or « FFA · N joueurs ». */
export function formatLabel(format: GameFormat): string {
  return format === 2 ? '1v1' : `FFA · ${format} joueurs`
}

/** Compact duration: « < 1 min », « 14 min », « 1 h 05 ». */
export function formatDuration(durationSec: number | null): string | null {
  if (durationSec === null) return null
  const minutes = Math.floor(durationSec / 60)
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`
}

const TIME_FORMAT = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const DAY_FORMAT = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' })
const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const MS_PER_DAY = 86_400_000

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Maquette history meta: « 18:47 · hier », « 09:58 · lun. 20 ». */
export function formatWhen(date: Date | null, now: Date = new Date()): string {
  if (!date) return '—'
  const time = TIME_FORMAT.format(date)
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / MS_PER_DAY)
  if (dayDiff <= 0) return `${time} · aujourd’hui`
  if (dayDiff === 1) return `${time} · hier`
  if (dayDiff < 180) return `${time} · ${DAY_FORMAT.format(date)}`
  return DATE_FORMAT.format(date)
}
