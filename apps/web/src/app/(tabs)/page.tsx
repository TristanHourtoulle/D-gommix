import Link from 'next/link'
import { requireOnboardedSession } from '@/lib/session'
import { getActiveGame, getHomeStats, getLastGames } from '@/lib/queries/home'
import { Icon } from '@/components/icons'
import { CharacterBadge } from '@/components/ui/character-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { StatTile } from '@/components/ui/stat-tile'
import { GameHistoryItem } from '@/components/home/game-history-item'
import { InviteBanner } from '@/components/home/invite-banner'
import { ResumeBanner } from '@/components/home/resume-banner'

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count > 1 ? 's' : ''}`
}

export default async function HomePage() {
  const { user } = await requireOnboardedSession()
  const [stats, activeGame, lastGames] = await Promise.all([
    getHomeStats(user.id),
    getActiveGame(user.id),
    getLastGames(user.id),
  ])

  return (
    <main className="tab-page">
      <header className="flex items-center gap-3">
        <PlayerAvatar username={user.username} size={44} />
        <div>
          <h1 className="s-title m-0" style={{ fontSize: '0.95rem' }}>
            Salut {user.username}
          </h1>
          <p className="s-sub">
            {plural(stats.wins, 'victoire')} · {plural(stats.degommages, 'dégommage')}
          </p>
        </div>
      </header>

      <InviteBanner />

      {activeGame ? <ResumeBanner game={activeGame} /> : null}

      <div className="stat-row">
        <StatTile icon="trophy" label="Victoires" value={stats.wins} />
        <StatTile icon="sword" label="Dégommages" value={stats.degommages} />
        <div className="stat-tile">
          {stats.favoriteCharacter ? (
            <CharacterBadge character={stats.favoriteCharacter} size="sm" />
          ) : (
            <span className="stat-num">—</span>
          )}
          <span className="stat-lbl">Fétiche</span>
        </div>
      </div>

      <Link href="/jouer" className="cta no-underline">
        <Icon name="play" size={18} />
        Nouvelle partie
      </Link>

      <section className="flex flex-col gap-2">
        <p className="sec-label">Historique récent</p>
        {lastGames.length === 0 ? (
          <EmptyState
            icon="flag"
            title="Aucune partie"
            description="Lance ta première partie !"
          />
        ) : (
          lastGames.map((game) => <GameHistoryItem key={game.id} game={game} />)
        )}
      </section>
    </main>
  )
}
