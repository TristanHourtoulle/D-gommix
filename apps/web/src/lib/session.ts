import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from './auth'

export interface OnboardedSession {
  user: { id: string; username: string }
}

/**
 * Session lookup for the current request. Wrapped in React `cache()` so the
 * layout, the page and any nested server component share a single Better Auth
 * round-trip instead of hitting the session table once per caller.
 */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }))

/** Redirects to /login when unauthenticated. */
export async function requireSession() {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}

/** Redirects to /login when unauthenticated and to /onboarding when the username is not set. */
export async function requireOnboardedSession(): Promise<OnboardedSession> {
  const session = await requireSession()
  if (!session.user.username) redirect('/onboarding')
  return { user: { id: session.user.id, username: session.user.username } }
}

/**
 * Route-handler counterpart of `requireOnboardedSession`: never redirects, so
 * callers can answer 401 instead of streaming an HTML redirect to `fetch`.
 */
export async function getOnboardedApiSession(): Promise<OnboardedSession | null> {
  const session = await getSession()
  if (!session?.user.username) return null
  return { user: { id: session.user.id, username: session.user.username } }
}
