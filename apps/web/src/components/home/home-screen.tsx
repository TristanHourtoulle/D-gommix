'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { parseHomeGames, type HomePayload, type InvitesPayload } from '@/lib/api-payloads'
import { useHomeData } from '@/hooks/use-tab-data'
import { Icon } from '@/components/icons'
import { RematchButton } from '@/components/rematch-button'
import { CharacterBadge } from '@/components/ui/character-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { StatTile } from '@/components/ui/stat-tile'
import { GameHistoryItem } from './game-history-item'
import { InviteBanner } from './invite-banner'
import { ResumeBanner } from './resume-banner'

/** Home shows a teaser of the history; the full list lives on /parties. */
const HOME_HISTORY_LIMIT = 4

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count > 1 ? 's' : ''}`
}

interface HomeScreenProps {
  username: string
  /** Profile avatar of the viewer, `null` when they kept their initial. */
  avatarId: string | null
  /** SSR payload, so the first paint needs no client round-trip. */
  initialData: HomePayload
  /** SSR payload of the pending invitations banner (its own query key). */
  initialInvites: InvitesPayload
}

/**
 * Client shell of the Accueil screen. The data lives in the `home` query:
 * revisiting the tab reads it from cache, and invite/game events invalidate it
 * instead of refetching the whole page.
 */
export function HomeScreen({
  username,
  avatarId,
  initialData,
  initialInvites,
}: HomeScreenProps) {
  const { data } = useHomeData(initialData)
  const { stats, activeGame } = data
  const lastGames = useMemo(() => parseHomeGames(data.lastGames), [data.lastGames])

  return (
    <main className="tab-page">
      <header>
        <Link
          href="/profil"
          className="flex items-center gap-3 no-underline"
          aria-label="Ouvrir mon profil"
        >
          <PlayerAvatar username={username} size={44} avatarId={avatarId} />
          <div>
            <h1 className="s-title m-0" style={{ fontSize: '0.95rem' }}>
              Salve, {username}
            </h1>
            <p className="s-sub">
              {plural(stats.wins, 'victoire')} · {plural(stats.degommages, 'dégommage')}
            </p>
          </div>
          <Icon name="settings" size={18} className="ml-auto" />
        </Link>
      </header>

      <InviteBanner initialData={initialInvites} />

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
        Aux armes !
      </Link>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="sec-label">Historique récent</p>
          {lastGames.length > 0 ? (
            <Link
              href="/parties"
              className="text-xs font-semibold text-bronze underline underline-offset-2"
            >
              Tout voir
            </Link>
          ) : null}
        </div>
        {lastGames.length === 0 ? (
          <EmptyState
            icon="flag"
            title="Aucune partie"
            description="Lance ta première partie !"
          />
        ) : (
          lastGames
            .slice(0, HOME_HISTORY_LIMIT)
            .map((game) => <GameHistoryItem key={game.id} game={game} />)
        )}
        {/* Sibling of the rows, never inside them: GameHistoryItem's root is a
            <Link>, and a <button> nested in an <a> is invalid HTML. Hidden while
            a lobby/game is open, which the server would reject anyway. */}
        {activeGame === null && lastGames[0] ? (
          <RematchButton finishedGameId={lastGames[0].id} variant="ghost" />
        ) : null}
      </section>
    </main>
  )
}
