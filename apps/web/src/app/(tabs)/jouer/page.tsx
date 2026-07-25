import { SectionTitle } from '@/components/ui/section-title'
import { EmptyState } from '@/components/ui/empty-state'

export default function PlayPage() {
  return (
    <main className="tab-page">
      <SectionTitle sub="Créer ou rejoindre une partie">Jouer</SectionTitle>
      <EmptyState
        icon="sword"
        title="Bientôt disponible"
        description="La création de partie et le code à 6 caractères arrivent ici."
      />
    </main>
  )
}
