import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/session'
import { Icon } from '@/components/icons'
import { Card } from '@/components/ui/card'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { SignOutButton } from '@/components/sign-out-button'
import { UsernameForm } from '@/components/profile/username-form'
import { AvatarPicker } from '@/components/profile/avatar-picker'
import { SoundSegmented } from '@/components/sound/sound-segmented'
import { ThemeSegmented } from '@/components/theme/theme-segmented'
import { DevMenuGesture } from '@/components/dev/dev-menu-gesture'
import { PerCharacterBlock } from '@/components/stats/per-character-block'
import { PlayerTitleLine } from '@/components/stats/player-title-line'
import { SealsBoard } from '@/components/profile/seals-board'
import { getAvatarId } from '@/lib/queries/profile'
import { getPlayerCharacterStats } from '@/lib/queries/stats'
import { getTitleFor } from '@/lib/queries/titles'
import { getUnlockedSeals } from '@/lib/queries/seals'

export default async function ProfilePage() {
  const session = await requireSession()
  const { username, email } = session.user
  if (!username) redirect('/onboarding')
  const [avatarId, perCharacter, title, seals] = await Promise.all([
    getAvatarId(session.user.id),
    getPlayerCharacterStats(session.user.id),
    getTitleFor(session.user.id, session.user.id),
    getUnlockedSeals(session.user.id),
  ])

  return (
    <main className="tab-page">
      <Link
        href="/"
        className="sec-label flex items-center gap-1 no-underline"
        style={{ color: 'var(--ink-faint)' }}
      >
        <Icon name="chevron-right" size={12} className="rotate-180" />
        Village
      </Link>

      <header>
        <DevMenuGesture>
          <PlayerAvatar username={username} size={56} avatarId={avatarId} />
          <div>
            <h1 className="s-title m-0" style={{ fontSize: '1.05rem' }}>
              {username}
            </h1>
            <PlayerTitleLine titleId={title} />
            <p className="s-sub">Ta hutte</p>
          </div>
        </DevMenuGesture>
      </header>

      <PerCharacterBlock perCharacter={perCharacter} />

      <SealsBoard unlocked={seals} isSelf />

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
        <p className="sec-label">Avatar</p>
        <Card className="flex flex-col gap-3 p-4">
          <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
            Choisis ta tête. Elle s’affiche partout où ton pseudo apparaît.
          </p>
          <AvatarPicker username={username} currentAvatarId={avatarId} />
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
        <p className="sec-label">Sons</p>
        <Card className="flex flex-col gap-3 p-4">
          <SoundSegmented />
          <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
            Trois bruitages courts pendant la partie : le carnyx et le « PAF ! » à chaque
            dégommage, une fanfare quand le village tombe. Rien en dehors de l’arène. Sur
            iPhone, le bouton silencieux coupe tout.
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
