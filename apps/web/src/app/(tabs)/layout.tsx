import { requireOnboardedSession } from '@/lib/session'
import { QueryProvider } from '@/lib/query-client'
import { ConnectionBanner } from '@/components/connection-banner'
import { FriendsEventsBridge } from '@/components/friends-events-bridge'
import { InviteEventsBridge } from '@/components/invite-events-bridge'
import { SocketProvider } from '@/components/socket-provider'
import { StatsEventsBridge } from '@/components/stats-events-bridge'
import { TabBar } from '@/components/tab-bar'

export default async function TabsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireOnboardedSession()

  return (
    <QueryProvider>
      <SocketProvider>
        <InviteEventsBridge />
        <StatsEventsBridge />
        <FriendsEventsBridge />
        <ConnectionBanner />
        <div className="tabs-content">{children}</div>
        <TabBar />
      </SocketProvider>
    </QueryProvider>
  )
}
