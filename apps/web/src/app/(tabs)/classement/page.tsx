import { SectionTitle } from '@/components/ui/section-title'
import { EmptyState } from '@/components/ui/empty-state'

export default function LeaderboardPage() {
  return (
    <main className="tab-page">
      <SectionTitle sub="Le cercle d'amis au grand complet">Classement</SectionTitle>
      <EmptyState
        icon="trophy"
        title="Bientôt disponible"
        description="Victoires, winrate et plus grand dégommeur arrivent ici."
      />
    </main>
  )
}
