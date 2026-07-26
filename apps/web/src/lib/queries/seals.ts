import { and, eq, seals, sql } from '@degommix/db'
import { isSealId, type SealId } from '@degommix/game-core'
import { db } from '@/lib/db'

export interface UnlockedSeal {
  sealId: SealId
  gameId: string
  /** ISO 8601. */
  unlockedAt: string
}

/**
 * Rows are filtered through `isSealId` so a seal written by a newer build — or
 * a hand-edited row — can never reach the UI as an unknown id. Same defensive
 * stance as `isKnownAvatarId` in `PlayerAvatar`.
 */
function toUnlockedSeals(
  rows: { sealId: string; gameId: string; unlockedAt: Date }[]
): UnlockedSeal[] {
  const unlocked: UnlockedSeal[] = []
  for (const row of rows) {
    if (!isSealId(row.sealId)) continue
    unlocked.push({
      sealId: row.sealId,
      gameId: row.gameId,
      unlockedAt: row.unlockedAt.toISOString(),
    })
  }
  return unlocked
}

/** Every seal a player has unlocked, newest first. */
export async function getUnlockedSeals(userId: string): Promise<UnlockedSeal[]> {
  const rows = await db
    .select({ sealId: seals.sealId, gameId: seals.gameId, unlockedAt: seals.unlockedAt })
    .from(seals)
    .where(eq(seals.userId, userId))
    .orderBy(sql`${seals.unlockedAt} desc`)
  return toUnlockedSeals(rows)
}

/** Seals this player FIRST earned in `gameId` — the Banquet's « newly earned » set. */
export async function getSealsEarnedIn(userId: string, gameId: string): Promise<UnlockedSeal[]> {
  const rows = await db
    .select({ sealId: seals.sealId, gameId: seals.gameId, unlockedAt: seals.unlockedAt })
    .from(seals)
    .where(and(eq(seals.userId, userId), eq(seals.gameId, gameId)))
    .orderBy(sql`${seals.unlockedAt} desc`)
  return toUnlockedSeals(rows)
}
