import { requireOnboardedSession } from '@/lib/session'
import { PlayScreen } from '@/components/lobby/play-screen'

export default async function PlayPage() {
  await requireOnboardedSession()

  return <PlayScreen />
}
