import { requireOnboardedSession } from '@/lib/session'
import { getPendingInvites } from '@/lib/queries/invites'
import { PlayScreen } from '@/components/lobby/play-screen'

export default async function PlayPage() {
  const { user } = await requireOnboardedSession()
  const invites = await getPendingInvites(user.id)

  return <PlayScreen initialInvites={{ invites }} />
}
