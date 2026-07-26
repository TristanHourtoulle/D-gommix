export interface StreakGameResult {
  userId: string
  won: boolean
}

/**
 * Current win streak per player from finished `village_reached` games ordered
 * newest first. Aborted games never reach this function (the caller filters
 * on outcome, mirroring design §5.3 where aborted games are excluded from the
 * winrate denominator) — so an aborted game neither extends nor breaks a
 * streak. A streak is broken by the first village_reached loss.
 */
export function computeCurrentStreaks(
  resultsNewestFirst: StreakGameResult[]
): Map<string, number> {
  const streaks = new Map<string, number>()
  const broken = new Set<string>()
  for (const result of resultsNewestFirst) {
    if (broken.has(result.userId)) continue
    if (result.won) {
      streaks.set(result.userId, (streaks.get(result.userId) ?? 0) + 1)
    } else {
      broken.add(result.userId)
    }
  }
  return streaks
}
