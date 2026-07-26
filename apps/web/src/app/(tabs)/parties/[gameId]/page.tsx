import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireOnboardedSession } from '@/lib/session'
import { getGameDetail, type GameAbortReason, type GameDetailPlayer } from '@/lib/queries/stats'
import { RematchButton } from '@/components/rematch-button'
import { Card } from '@/components/ui/card'
import { CharacterBadge } from '@/components/ui/character-badge'
import { Icon } from '@/components/icons'
import { MomentStamp } from '@/components/ui/moment-stamp'
import { Pill } from '@/components/ui/pill'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { SectionTitle } from '@/components/ui/section-title'
import { StatTile } from '@/components/ui/stat-tile'
import { GameJournal } from '@/components/stats/game-journal'
import {
  formatClock,
  formatDayTime,
  formatDurationProse,
  formatGameFormat,
} from '@/components/stats/format'
import { CHARACTER_META } from '@/lib/characters'

export const dynamic = 'force-dynamic'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface GameDetailPageProps {
  params: Promise<{ gameId: string }>
}

/**
 * End-state copy per true abort reason (derived from the event log — see
 * deriveAbortReason). `null` reason falls back to the historical generic
 * copy so pre-existing odd logs never render an empty card.
 */
const ABORT_COPY: Record<GameAbortReason | 'unknown', { pill: string; text: string }> = {
  abandon_total: {
    pill: 'Partie arrêtée',
    text: 'La table a voté l’arrêt de la partie d’un commun accord.',
  },
  abandon_individual: {
    pill: 'Partie abandonnée',
    text: 'Trop de joueurs ont quitté la table pour continuer.',
  },
  zombie: {
    pill: 'Partie clôturée',
    text: 'Clôturée automatiquement après 24 h d’inactivité.',
  },
  unknown: {
    pill: 'Partie abandonnée',
    text: 'Personne n’a atteint le village cette fois-ci.',
  },
}

function PlayerRecapRow({ player }: { player: GameDetailPlayer }) {
  const subParts = [
    player.character ? CHARACTER_META[player.character].label : null,
    player.isWinner ? 'vainqueur' : null,
    player.hasLeft ? 'a quitté la partie' : null,
  ].filter((part): part is string => part !== null)

  const rowClass = `card flex items-center gap-3 px-4 py-2.5 ${player.isWinner ? 'border-bronze' : ''}`
  const content = (
    <>
      <PlayerAvatar username={player.username} size={32} avatarId={player.avatarId} />
      {player.character ? <CharacterBadge character={player.character} size="sm" /> : null}
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-sm font-semibold">{player.username}</p>
        {subParts.length > 0 ? (
          <p className="m-0 text-xs text-ink-soft">{subParts.join(' · ')}</p>
        ) : null}
      </div>
      <span className="flex items-center gap-1.5 font-mono text-sm font-bold" title="Dégommages">
        <Icon name="sword" size={16} className="text-bronze" />
        {player.degommages}
      </span>
    </>
  )

  if (!player.isCircleMember) {
    return <div className={rowClass}>{content}</div>
  }
  return (
    <Link
      href={`/amis/${player.userId}`}
      aria-label={`Voir le profil de ${player.username}`}
      className={`${rowClass} no-underline`}
      style={{ color: 'inherit' }}
    >
      {content}
    </Link>
  )
}

export default async function GameDetailPage({ params }: GameDetailPageProps) {
  const { gameId } = await params
  if (!UUID_PATTERN.test(gameId)) notFound()

  const { user } = await requireOnboardedSession()
  const detail = await getGameDetail(gameId, user.id)
  if (!detail || detail.status === 'lobby') notFound()
  if (detail.status === 'active') redirect(`/partie/${gameId}`)

  const durationSeconds =
    detail.startedAt && detail.endedAt
      ? Math.max(0, Math.round((detail.endedAt.getTime() - detail.startedAt.getTime()) / 1000))
      : null
  const isVictory = detail.outcome === 'village_reached' && detail.winner !== null
  // getGameDetail also serves friends of the participants, and only participants
  // may open a rematch (the server would answer NOT_MEMBER otherwise).
  const isParticipant = detail.players.some((player) => player.userId === user.id)
  const colorByUser: Record<string, string> = Object.fromEntries(
    detail.players.flatMap((player) =>
      player.character ? [[player.userId, CHARACTER_META[player.character].colorVar]] : []
    )
  )

  return (
    <main className="tab-page">
      <SectionTitle sub={detail.startedAt ? `Jouée le ${formatDayTime(detail.startedAt)}` : undefined}>
        Détail de partie
      </SectionTitle>

      <Card className="flex flex-col items-center gap-2 px-4 py-5 text-center">
        {isVictory && detail.winner ? (
          <>
            <Pill variant="win">Victoire</Pill>
            {detail.summaryStamp ? <MomentStamp stamp={detail.summaryStamp} size="lg" /> : null}
            {detail.winner.character ? (
              <CharacterBadge character={detail.winner.character} size="lg" />
            ) : null}
            <p className="m-0 font-display text-xl font-bold uppercase tracking-wide">
              {detail.winner.username}
            </p>
            <p className="m-0 text-sm text-ink-soft">
              {detail.winner.character ? `${CHARACTER_META[detail.winner.character].label} · ` : ''}
              village atteint
              {durationSeconds !== null ? ` en ${formatDurationProse(durationSeconds)}` : ''}
            </p>
          </>
        ) : (
          <>
            <Pill variant="loss">{ABORT_COPY[detail.abortReason ?? 'unknown'].pill}</Pill>
            <p className="m-0 text-sm text-ink-soft">
              {ABORT_COPY[detail.abortReason ?? 'unknown'].text}
            </p>
          </>
        )}
      </Card>

      <div className="stat-row">
        <StatTile
          icon="timer"
          label="Durée"
          value={durationSeconds !== null ? formatClock(durationSeconds) : '—'}
        />
        <StatTile icon="sword" label="Dégommages" value={detail.totalDegommages} />
        <StatTile icon="users" label="Format" value={formatGameFormat(detail.format)} />
      </div>

      <div className="flex flex-col gap-2">
        <p className="sec-label m-0">Récap par joueur</p>
        {detail.players.map((player) => (
          <PlayerRecapRow key={player.userId} player={player} />
        ))}
      </div>

      <GameJournal entries={detail.journal} colorByUser={colorByUser} />

      {isParticipant ? <RematchButton finishedGameId={detail.id} variant="primary" /> : null}
    </main>
  )
}
