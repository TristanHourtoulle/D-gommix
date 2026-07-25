import { requireOnboardedSession } from '@/lib/session'
import { SignOutButton } from '@/components/sign-out-button'
import { PlayerAvatar } from '@/components/ui/player-avatar'

export default async function HomePage() {
  const { user } = await requireOnboardedSession()

  return (
    <main className="tab-page justify-center">
      <h1 className="wordmark text-center">Dégommix</h1>
      <section className="card flex items-center gap-3 p-5">
        <PlayerAvatar username={user.username} />
        <div>
          <p className="m-0 font-semibold">Salut {user.username} !</p>
          <p className="m-0 text-sm" style={{ color: 'var(--ink-soft)' }}>
            Les écrans du jeu arrivent bientôt.
          </p>
        </div>
      </section>
      <SignOutButton />
    </main>
  )
}
