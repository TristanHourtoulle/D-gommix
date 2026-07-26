'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { parseHomeGames, type HomePayload, type InvitesPayload } from '@/lib/api-payloads'
import { useHomeData } from '@/hooks/use-tab-data'
import { Icon } from '@/components/icons'
import { RematchButton } from '@/components/rematch-button'
import { EmptyState } from '@/components/ui/empty-state'
import { Pill } from '@/components/ui/pill'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { GameHistoryItem } from './game-history-item'
import { InviteBanner } from './invite-banner'
import { ResumeBanner } from './resume-banner'

/** Home shows a teaser of the history; the full list lives on /parties. */
const HOME_HISTORY_LIMIT = 4

/** The form guide reads deeper into the payload than the 4 rows displayed. */
const FORM_GUIDE_LIMIT = 10

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count > 1 ? 's' : ''}`
}

/** French ordinal of a leaderboard rank: « 1ᵉʳ », then « 2ᵉ », « 3ᵉ »… */
function rankOrdinal(rank: number): string {
  return rank === 1 ? '1ᵉʳ' : `${rank}ᵉ`
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
 * Client shell of the Accueil screen, « Place du village » layout: hero header
 * (salutation + stats + rank chips), form guide, banners, CTA, then history.
 * The data lives in the `home` query: revisiting the tab reads it from cache,
 * and invite/game events invalidate it instead of refetching the whole page.
 */
export function HomeScreen({
  username,
  avatarId,
  initialData,
  initialInvites,
}: HomeScreenProps) {
  const { data } = useHomeData(initialData)
  const { stats, activeGame } = data
  const viewerRank = data.viewerRank ?? null
  const lastGames = useMemo(() => parseHomeGames(data.lastGames), [data.lastGames])

  const formGuide = useMemo(
    () => lastGames.filter((game) => game.myResult !== 'aborted').slice(0, FORM_GUIDE_LIMIT),
    [lastGames]
  )
  const formWins = formGuide.filter((game) => game.myResult === 'won').length

  return (
    <main className="tab-page">
      <header>
        <Link
          href="/profil"
          className="card flex items-center gap-3 no-underline"
          aria-label="Ouvrir mon profil"
          style={{ color: 'inherit' }}
        >
          <PlayerAvatar username={username} size={56} avatarId={avatarId} />
          <div className="min-w-0 flex-1">
            <h1 className="s-title m-0" style={{ fontSize: '1rem' }}>
              Salve, {username}
            </h1>
            <p className="s-sub">
              {plural(stats.wins, 'victoire')} · {plural(stats.degommages, 'dégommage')}
            </p>
            {viewerRank ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Pill variant="bronze">{rankOrdinal(viewerRank.rank)} du village</Pill>
                <Pill variant="plain">{viewerRank.winrate} % de vict.</Pill>
              </div>
            ) : null}
          </div>
          <span className="flex shrink-0" style={{ color: 'var(--ink-faint)' }} aria-hidden>
            <Icon name="settings" size={18} />
          </span>
        </Link>
      </header>

      {formGuide.length > 0 ? (
        <div
          className="flex items-center gap-2 px-1"
          role="img"
          aria-label={`Forme récente : ${plural(formWins, 'victoire')} sur ${formGuide.length}`}
        >
          <span className="sec-label">Forme</span>
          <span className="flex items-center gap-1.5" aria-hidden>
            {formGuide.map((game) => (
              <span
                key={game.id}
                className={game.myResult === 'won' ? 'form-dot v' : 'form-dot d'}
              />
            ))}
          </span>
          <span className="text-xs" style={{ color: 'var(--ink-faint)' }} aria-hidden>
            {formGuide.length > 1 ? `${formGuide.length} dernières` : 'dernière partie'}
          </span>
        </div>
      ) : null}

      <InviteBanner initialData={initialInvites} />

      {activeGame ? <ResumeBanner game={activeGame} /> : null}

      <Link href="/jouer" className="cta no-underline">
        <Icon name="play" size={18} />
        Aux armes !
      </Link>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="sec-label">Chronique</p>
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
          lastGames.slice(0, HOME_HISTORY_LIMIT).map((game, index) => (
            <GameHistoryItem
              key={game.id}
              game={game}
              action={
                // Inline « Revanche » on the most recent row only. Hidden while
                // a lobby/game is open, which the server would reject anyway.
                index === 0 && activeGame === null ? (
                  <RematchButton finishedGameId={game.id} compact />
                ) : undefined
              }
            />
          ))
        )}
      </section>
    </main>
  )
}
