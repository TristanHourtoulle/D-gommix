import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { and, eq, or, sql, friendRequests, friendships, user } from '@degommix/db'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

const SEARCH_LIMIT = 10

const querySchema = z.object({ q: z.string().min(2).max(20) })

/** Escapes LIKE wildcards so the query text is matched literally. */
function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/**
 * Partial username search for the Amis screen: session-gated, min 2 chars,
 * case-insensitive contains, excludes self, 10 results max. Each hit carries
 * the relation flags the UI needs to pick its action button.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse({ q: (searchParams.get('q') ?? '').trim() })
  if (!parsed.success) {
    return NextResponse.json({ users: [] })
  }
  const me = session.user.id
  const pattern = `%${escapeLikePattern(parsed.data.q)}%`

  const candidates = await db
    .select({ id: user.id, username: user.username })
    .from(user)
    .where(and(sql`${user.username} ilike ${pattern}`, sql`${user.id} <> ${me}`))
    .orderBy(sql`lower(${user.username}) asc`)
    .limit(SEARCH_LIMIT)

  if (candidates.length === 0) {
    return NextResponse.json({ users: [] })
  }

  const [friendRows, pendingRows] = await Promise.all([
    db
      .select({ userLow: friendships.userLow, userHigh: friendships.userHigh })
      .from(friendships)
      .where(or(eq(friendships.userLow, me), eq(friendships.userHigh, me))),
    db
      .select({ senderId: friendRequests.senderId, receiverId: friendRequests.receiverId })
      .from(friendRequests)
      .where(
        and(
          eq(friendRequests.status, 'pending'),
          or(eq(friendRequests.senderId, me), eq(friendRequests.receiverId, me))
        )
      ),
  ])

  const friendIds = new Set(
    friendRows.map((row) => (row.userLow === me ? row.userHigh : row.userLow))
  )
  const pendingIds = new Set(
    pendingRows.map((row) => (row.senderId === me ? row.receiverId : row.senderId))
  )

  const users = candidates.map((candidate) => ({
    id: candidate.id,
    username: candidate.username ?? '',
    isFriend: friendIds.has(candidate.id),
    hasPending: pendingIds.has(candidate.id),
  }))

  return NextResponse.json({ users })
}
