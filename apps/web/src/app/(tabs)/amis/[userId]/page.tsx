import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOnboardedSession } from '@/lib/session'
import { areFriends, getPlayerStats, getPublicUser } from '@/lib/queries/friends'
import { CHARACTER_META } from '@/lib/characters'
import { CharacterBadge } from '@/components/ui/character-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { SectionTitle } from '@/components/ui/section-title'
import { StatTile } from '@/components/ui/stat-tile'

interface FriendProfilePageProps {
  params: Promise<{ userId: string }>
}

export default async function FriendProfilePage({ params }: FriendProfilePageProps) {
  const { userId } = await params
  const { user: me } = await requireOnboardedSession()

  const profile = await getPublicUser(userId)
  if (!profile) notFound()

  const isSelf = userId === me.id
  if (!isSelf && !(await areFriends(me.id, userId))) {
    return (
      <main className="tab-page">
        <SectionTitle sub="Accès réservé">Profil</SectionTitle>
        <EmptyState
          icon="users"
          title="Profil réservé aux amis"
          description="Envoie-lui une demande d'ami pour découvrir ses stats."
        />
        <Link href="/amis" className="helper-text">
          Retour aux amis
        </Link>
      </main>
    )
  }

  const stats = await getPlayerStats(userId)
  const winrateLabel =
    stats.winrate === null ? '—' : `${Math.round(stats.winrate * 100)} %`
  const favorite = stats.favoriteCharacter

  return (
    <main className="tab-page">
      <SectionTitle sub={isSelf ? 'Tes stats de dégommeur' : 'Stats de ton ami'}>
        Profil
      </SectionTitle>

      <section className="card flex items-center gap-3 p-5">
        <PlayerAvatar username={profile.username} size={44} />
        <div className="min-w-0">
          <p className="m-0 truncate font-bold">{profile.username}</p>
          <p className="m-0 text-xs" style={{ color: 'var(--ink-faint)' }}>
            {stats.gamesPlayed} partie{stats.gamesPlayed > 1 ? 's' : ''} jouée
            {stats.gamesPlayed > 1 ? 's' : ''}
          </p>
        </div>
      </section>

      <div className="stat-row">
        <StatTile icon="trophy" label="Victoires" value={stats.wins} />
        <StatTile icon="flag" label="Winrate" value={winrateLabel} />
        <StatTile icon="sword" label="Dégommages" value={stats.degommages} />
      </div>

      <section className="card flex items-center gap-3 p-5">
        {favorite ? (
          <>
            <CharacterBadge character={favorite} size="lg" />
            <div>
              <p className="m-0 text-xs uppercase" style={{ color: 'var(--ink-faint)' }}>
                Personnage fétiche
              </p>
              <p className="m-0 font-bold">{CHARACTER_META[favorite].label}</p>
            </div>
          </>
        ) : (
          <p className="m-0 text-sm" style={{ color: 'var(--ink-soft)' }}>
            Pas encore de personnage fétiche — aucune partie jouée.
          </p>
        )}
      </section>

      <Link href="/amis" className="helper-text">
        Retour aux amis
      </Link>
    </main>
  )
}
