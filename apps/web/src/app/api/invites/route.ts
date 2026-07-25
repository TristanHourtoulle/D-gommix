import { NextResponse } from 'next/server'
import { getPendingInvites } from '@/lib/queries/invites'
import type { InvitesPayload } from '@/lib/api-payloads'
import { getOnboardedApiSession } from '@/lib/session'

/** Per-user data: never cacheable by the browser or any intermediary. */
const PRIVATE_HEADERS = { 'cache-control': 'private, no-store' }

/**
 * Pending lobby invitations of the caller. Makes invitations server state
 * instead of component state, so they survive a reload or a sleeping phone
 * (SPECS.md:94: in-app invitations only, no Web Push in v1).
 */
export async function GET() {
  const session = await getOnboardedApiSession()
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const invites = await getPendingInvites(session.user.id)
  const payload: InvitesPayload = { invites }
  return NextResponse.json(payload, { headers: PRIVATE_HEADERS })
}
