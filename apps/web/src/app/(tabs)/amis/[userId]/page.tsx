import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOnboardedSession } from '@/lib/session'
import { areFriends, getPlayerStats, getPublicUser } from '@/lib/queries/friends'
import { getDegommagesTaken, getHeadToHead } from '@/lib/queries/rivalries'
import { getSharedGames } from '@/lib/queries/shared-games'
import { getPlayerCharacterStats } from '@/lib/queries/stats'
import { CHARACTER_META } from '@/lib/characters'
import { CharacterBadge } from '@/components/ui/character-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { FriendProfileActions } from '@/components/friends/friend-profile-actions'
import { GameHistoryItem } from '@/components/home/game-history-item'
import { HeadToHeadCard } from '@/components/stats/head-to-head-card'
import { PerCharacterBlock } from '@/components/stats/per-character-block'
import { RematchButton } from '@/components/rematch-button'
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

  const [stats, headToHead, sharedResult, taken, perCharacter] = await Promise.all([
    getPlayerStats(userId),
    isSelf ? Promise.resolve(null) : getHeadToHead(me.id, userId),
    isSelf ? Promise.resolve(null) : getSharedGames(me.id, userId),
    getDegommagesTaken(userId),
    getPlayerCharacterStats(userId),
  ])
  const sharedGames = sharedResult?.games ?? []
  const winrateLabel =
    stats.winrate === null ? '—' : `${Math.round(stats.winrate * 100)} %`
  const favorite = stats.favoriteCharacter

  return (
    <main className="tab-page">
      <SectionTitle sub={isSelf ? 'Tes stats de dégommeur' : 'Stats de ton ami'}>
        Profil
      </SectionTitle>

      <section className="card flex items-center gap-3 p-5">
        <PlayerAvatar username={profile.username} size={44} avatarId={profile.avatarId} />
        <div className="min-w-0">
          <p className="m-0 truncate font-bold">{profile.username}</p>
          <p className="m-0 text-xs" style={{ color: 'var(--ink-faint)' }}>
            {stats.gamesPlayed} partie{stats.gamesPlayed > 1 ? 's' : ''} jouée
            {stats.gamesPlayed > 1 ? 's' : ''}
          </p>
        </div>
        {isSelf ? null : <FriendProfileActions friendId={userId} />}
      </section>

      <div className="stat-row">
        <StatTile icon="trophy" label="Victoires" value={stats.wins} />
        <StatTile icon="flag" label="Winrate" value={winrateLabel} />
        <StatTile icon="sword" label="Dégommages" value={stats.degommages} />
        <StatTile icon="pawn" label="Subis" value={taken} />
      </div>

      {headToHead && sharedResult ? (
        <HeadToHeadCard
          username={profile.username}
          headToHead={headToHead}
          record={sharedResult.record}
        />
      ) : null}

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

      <PerCharacterBlock perCharacter={perCharacter} />

      {isSelf ? null : (
        <section className="flex flex-col gap-2">
          <p className="sec-label">Vieilles querelles</p>
          {sharedGames.length === 0 ? (
            <EmptyState
              icon="flag"
              title="Aucune partie ensemble"
              description="Invite-le dans un salon pour lancer la première."
            />
          ) : (
            sharedGames.map((game, index) => (
              <GameHistoryItem
                key={game.id}
                game={game}
                action={
                  // « Revanche » on the most recent shared game only, like Accueil.
                  // Unlike Accueil the server page cannot see the client's activeGame,
                  // so the server-side rejection (+ error toast) is the guard.
                  index === 0 ? <RematchButton finishedGameId={game.id} compact /> : undefined
                }
              />
            ))
          )}
        </section>
      )}

      <Link href="/amis" className="helper-text">
        Retour aux amis
      </Link>
    </main>
  )
}
