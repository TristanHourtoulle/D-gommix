import { requireOnboardedSession } from '@/lib/session'
import { TabBar } from '@/components/tab-bar'

export default async function TabsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireOnboardedSession()

  return (
    <>
      <div className="tabs-content">{children}</div>
      <TabBar />
    </>
  )
}
