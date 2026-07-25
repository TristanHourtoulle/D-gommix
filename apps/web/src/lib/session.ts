import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from './auth'

export interface OnboardedSession {
  user: { id: string; username: string }
}

export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

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
