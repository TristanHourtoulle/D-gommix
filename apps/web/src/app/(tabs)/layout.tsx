import { requireOnboardedSession } from '@/lib/session'
import { QueryProvider } from '@/lib/query-client'
import { ConnectionBanner } from '@/components/connection-banner'
import { SocketProvider } from '@/components/socket-provider'
import { TabBar } from '@/components/tab-bar'
import { ToastProvider } from '@/components/ui/toast'

export default async function TabsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireOnboardedSession()

  return (
    <QueryProvider>
      <SocketProvider>
        <ToastProvider>
          <ConnectionBanner />
          <div className="tabs-content">{children}</div>
          <TabBar />
        </ToastProvider>
      </SocketProvider>
    </QueryProvider>
  )
}
