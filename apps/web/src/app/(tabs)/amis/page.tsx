import { SectionTitle } from '@/components/ui/section-title'
import { EmptyState } from '@/components/ui/empty-state'

export default function FriendsPage() {
  return (
    <main className="tab-page">
      <SectionTitle sub="Ton cercle de dégommeurs">Amis</SectionTitle>
      <EmptyState
        icon="users"
        title="Bientôt disponible"
        description="Les demandes d'amis et la recherche de pseudos arrivent ici."
      />
    </main>
  )
}
