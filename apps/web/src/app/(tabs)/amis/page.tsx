import { requireOnboardedSession } from '@/lib/session'
import { getFriendsPageData } from '@/lib/queries/friends'
import { SectionTitle } from '@/components/ui/section-title'
import { FriendsScreen } from '@/components/friends/friends-screen'

export default async function FriendsPage() {
  const { user } = await requireOnboardedSession()
  const data = await getFriendsPageData(user.id)

  return (
    <main className="tab-page">
      <SectionTitle sub="Ton cercle de dégommeurs">Amis</SectionTitle>
      <FriendsScreen initialData={data} />
    </main>
  )
}
