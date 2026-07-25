import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { eq, user } from '@degommix/db'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

const bodySchema = z.object({
  username: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[a-zA-Z0-9_.-]+$/),
})

/** Drizzle wraps driver errors in DrizzleQueryError, so the Postgres code lives on the cause chain. */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  while (typeof current === 'object' && current !== null) {
    if ('code' in current && current.code === '23505') return true
    current = 'cause' in current ? current.cause : null
  }
  return false
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }
  if (session.user.username) {
    return NextResponse.json({ error: 'USERNAME_ALREADY_SET' }, { status: 400 })
  }
  const body: unknown = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_USERNAME' }, { status: 400 })
  }
  try {
    await db
      .update(user)
      .set({ username: parsed.data.username, updatedAt: new Date() })
      .where(eq(user.id, session.user.id))
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: 'USERNAME_TAKEN' }, { status: 409 })
    }
    throw error
  }
  return NextResponse.json({ ok: true })
}
