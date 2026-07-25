import { requireOnboardedSession } from '@/lib/session'
import { QueryProvider } from '@/lib/query-client'
import { ConnectionBanner } from '@/components/connection-banner'
import { SocketProvider } from '@/components/socket-provider'
import { TabBar } from '@/components/tab-bar'

export default async function TabsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireOnboardedSession()

  return (
    <QueryProvider>
      <SocketProvider>
        <ConnectionBanner />
        <div className="tabs-content">{children}</div>
        <TabBar />
      </SocketProvider>
    </QueryProvider>
  )
}
