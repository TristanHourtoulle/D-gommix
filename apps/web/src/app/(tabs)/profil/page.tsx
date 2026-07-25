import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/session'
import { Icon } from '@/components/icons'
import { Card } from '@/components/ui/card'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { SignOutButton } from '@/components/sign-out-button'
import { UsernameForm } from '@/components/profile/username-form'
import { ThemeSegmented } from '@/components/theme/theme-segmented'

export default async function ProfilePage() {
  const session = await requireSession()
  const { username, email } = session.user
  if (!username) redirect('/onboarding')

  return (
    <main className="tab-page">
      <Link
        href="/"
        className="sec-label flex items-center gap-1 no-underline"
        style={{ color: 'var(--ink-faint)' }}
      >
        <Icon name="chevron-right" size={12} className="rotate-180" />
        Accueil
      </Link>

      <header className="flex items-center gap-3">
        <PlayerAvatar username={username} size={56} />
        <div>
          <h1 className="s-title m-0" style={{ fontSize: '1.05rem' }}>
            {username}
          </h1>
          <p className="s-sub">Ton profil de dégommeur</p>
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <p className="sec-label">Pseudo</p>
        <Card className="flex flex-col gap-3 p-4">
          <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
            C&apos;est lui que tes amis verront dans les parties. 20 caractères maximum.
          </p>
          <UsernameForm currentUsername={username} />
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <p className="sec-label">Thème</p>
        <Card className="flex flex-col gap-3 p-4">
          <ThemeSegmented />
          <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
            « Système » suit le réglage clair/sombre de ton téléphone.
          </p>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <p className="sec-label">Compte</p>
        <Card className="flex flex-col gap-3 p-4">
          <div>
            <p className="field-label m-0">Email</p>
            <p className="m-0 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {email}
            </p>
          </div>
          <SignOutButton />
        </Card>
      </section>

      <p className="helper-text">Dégommix · v1</p>
    </main>
  )
}
