import { requireOnboardedSession } from '@/lib/session'
import { PlayScreen } from '@/components/lobby/play-screen'
import { RealtimeProviders } from '@/components/lobby/providers'

export default async function PlayPage() {
  await requireOnboardedSession()

  return (
    <RealtimeProviders>
      <PlayScreen />
    </RealtimeProviders>
  )
}
