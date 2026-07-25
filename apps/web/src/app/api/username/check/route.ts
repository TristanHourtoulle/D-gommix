import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { sql, user } from '@degommix/db'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

const querySchema = z.object({
  u: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[a-zA-Z0-9_.-]+$/),
})

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse({ u: searchParams.get('u') ?? '' })
  if (!parsed.success) {
    return NextResponse.json({ available: false })
  }
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.username}) = lower(${parsed.data.u})`)
    .limit(1)
  return NextResponse.json({ available: rows.length === 0 })
}
