const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 3_600_000

/**
 * French relative « last seen » label for an offline friend, mirroring the
 * vocabulary of `formatDuration` (`@/components/home/format`): « à l’instant »
 * under a minute, « il y a N min » under an hour, « il y a N h » under a day,
 * « hier » under 48 h. Older than that (or null/invalid input) returns null —
 * the row then shows the plain « hors ligne » dot alone.
 */
export function formatLastSeen(iso: string | null, now: Date = new Date()): string | null {
  if (iso === null) return null
  const seenAt = new Date(iso).getTime()
  if (Number.isNaN(seenAt)) return null
  const elapsedMs = now.getTime() - seenAt
  if (elapsedMs < MS_PER_MINUTE) return 'à l’instant'
  if (elapsedMs < MS_PER_HOUR) return `il y a ${Math.floor(elapsedMs / MS_PER_MINUTE)} min`
  if (elapsedMs < 24 * MS_PER_HOUR) return `il y a ${Math.floor(elapsedMs / MS_PER_HOUR)} h`
  if (elapsedMs < 48 * MS_PER_HOUR) return 'hier'
  return null
}
