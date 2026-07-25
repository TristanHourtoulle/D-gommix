import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { eq, user } from '@degommix/db'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { avatarIdSchema } from '@/lib/avatars'

const bodySchema = z.object({ avatarId: avatarIdSchema })

/** Sets (or clears) the profile avatar. `null` restores the pseudo initial. */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }
  const body: unknown = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_AVATAR' }, { status: 400 })
  }
  await db
    .update(user)
    .set({ avatarId: parsed.data.avatarId, updatedAt: new Date() })
    .where(eq(user.id, session.user.id))

  return NextResponse.json({ ok: true, avatarId: parsed.data.avatarId })
}
