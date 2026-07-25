import { eq, user } from '@degommix/db'
import { db } from '@/lib/db'

/**
 * Current avatar of a user. Read from the table rather than from the Better
 * Auth session: `avatar_id` is our column, not part of the session contract.
 */
export async function getAvatarId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ avatarId: user.avatarId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return rows[0]?.avatarId ?? null
}
