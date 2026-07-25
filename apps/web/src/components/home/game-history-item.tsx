import Link from 'next/link'
import { Icon } from '@/components/icons'
import { CharacterBadge } from '@/components/ui/character-badge'
import { Pill } from '@/components/ui/pill'
import type { HomeGame, HomeGameParticipant } from '@/lib/queries/home'
import { formatDuration, formatLabel, formatWhen } from './format'

const RESULT_PILL = {
  won: { variant: 'win', label: 'Victoire' },
  lost: { variant: 'loss', label: 'Défaite' },
  aborted: { variant: 'wait', label: 'Abandonnée' },
} as const

function ParticipantBadge({ participant }: { participant: HomeGameParticipant }) {
  if (participant.character) {
    return <CharacterBadge character={participant.character} size="sm" />
  }
  return (
    <span
      className="avatar-ring"
      style={{ width: 26, height: 26, fontSize: '0.65rem', borderWidth: 1.5 }}
      title={participant.username}
    >
      {participant.username.charAt(0).toUpperCase()}
    </span>
  )
}

interface GameHistoryItemProps {
  game: HomeGame
}

/** One finished game row of the home history, linking to /parties/[id]. */
export function GameHistoryItem({ game }: GameHistoryItemProps) {
  const pill = RESULT_PILL[game.myResult]
  const meta = [formatLabel(game.format), formatDuration(game.durationSec), formatWhen(game.endedAt)]
    .filter(Boolean)
    .join(' · ')

  return (
    <Link
      href={`/parties/${game.id}`}
      className="card flex items-center gap-3 no-underline"
      style={{ color: 'inherit' }}
    >
      <Pill variant={pill.variant}>{pill.label}</Pill>
      <span className="min-w-0 flex-1 truncate text-xs" style={{ color: 'var(--ink-faint)' }}>
        {meta}
      </span>
      <span
        className="flex shrink-0"
        aria-label={game.participants.map((participant) => participant.username).join(', ')}
      >
        {game.participants.map((participant, index) => (
          <span key={participant.username} className={index > 0 ? '-ml-2' : undefined}>
            <ParticipantBadge participant={participant} />
          </span>
        ))}
      </span>
      <span className="flex shrink-0" style={{ color: 'var(--ink-faint)' }} aria-hidden>
        <Icon name="chevron-right" size={13} />
      </span>
    </Link>
  )
}
