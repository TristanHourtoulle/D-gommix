import { NextResponse } from 'next/server'
import { getFriendsPageData } from '@/lib/queries/friends'
import type { FriendsPayload } from '@/lib/api-payloads'
import { getOnboardedApiSession } from '@/lib/session'

/** Per-user data: never cacheable by the browser or any intermediary. */
const PRIVATE_HEADERS = { 'cache-control': 'private, no-store' }

/**
 * JSON twin of the Amis server component. Onboarded session required, and the
 * underlying query only ever walks friendships/requests attached to the
 * caller, so the friends-only scope of the page is preserved.
 */
export async function GET() {
  const session = await getOnboardedApiSession()
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const payload: FriendsPayload = await getFriendsPageData(session.user.id)
  return NextResponse.json(payload, { headers: PRIVATE_HEADERS })
}
