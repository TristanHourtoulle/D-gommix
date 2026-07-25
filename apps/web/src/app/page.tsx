import { requireOnboardedSession } from '@/lib/session'
import { SignOutButton } from '@/components/sign-out-button'

export default async function HomePage() {
  const { user } = await requireOnboardedSession()
  const initial = user.username.charAt(0).toUpperCase()

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      <h1 className="wordmark text-center">Dégommix</h1>
      <section className="card flex items-center gap-3 p-5">
        <span className="avatar-ring" aria-hidden>
          {initial}
        </span>
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
