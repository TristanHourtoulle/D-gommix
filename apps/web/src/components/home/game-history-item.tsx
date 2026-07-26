import type { ReactNode } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/icons'
import { CharacterBadge } from '@/components/ui/character-badge'
import { PlayerAvatar } from '@/components/ui/player-avatar'
import { Pill } from '@/components/ui/pill'
import type { HomeGame } from '@/lib/queries/home'
import { formatDuration, formatWhen } from './format'

const RESULT_PILL = {
  won: { variant: 'win', label: 'Victoire' },
  lost: { variant: 'loss', label: 'Défaite' },
  aborted: { variant: 'wait', label: 'Abandonnée' },
} as const

/** Smallest ring the app uses, so the row keeps its one-line density. */
const PARTICIPANT_AVATAR_SIZE = 32

/**
 * Narrative line of a history row. `myResult` is viewer-relative, so on a won
 * game the viewer IS the winner — the 1v1 opponent is simply the participant
 * who is not the winner, no viewer id needed.
 */
function narrative(game: HomeGame): string {
  if (game.myResult === 'aborted') return 'Partie abandonnée'
  if (game.myResult === 'won') {
    if (game.format !== 2) return 'Tu as dominé la mêlée'
    const opponent = game.participants.find(
      (participant) => participant.username !== game.winnerUsername
    )
    return opponent ? `Tu as dégommé ${opponent.username}` : 'Tu l’as emporté'
  }
  return game.winnerUsername ? `${game.winnerUsername} l’emporte` : 'Partie perdue'
}

interface GameHistoryItemProps {
  game: HomeGame
  /**
   * Inline trailing action (the « Revanche » key of the most recent row).
   * A <button> cannot nest inside the row's <Link> (invalid HTML), so when an
   * action is present the row becomes a plain card whose main zone is the
   * Link and the action a sibling.
   */
  action?: ReactNode
}

/** One finished game row of the home history, linking to /parties/[id]. */
export function GameHistoryItem({ game, action }: GameHistoryItemProps) {
  const pill = RESULT_PILL[game.myResult]
  const meta = [formatWhen(game.endedAt), formatDuration(game.durationSec)]
    .filter(Boolean)
    .join(' · ')

  const content = (
    <>
      <Pill variant={pill.variant}>{pill.label}</Pill>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.8rem] font-semibold">{narrative(game)}</span>
        <span className="block truncate text-xs" style={{ color: 'var(--ink-faint)' }}>
          {meta}
        </span>
      </span>
      <span
        className="flex shrink-0"
        aria-label={game.participants.map((participant) => participant.username).join(', ')}
      >
        {game.participants.map((participant, index) => (
          <span
            key={participant.username}
            className={index > 0 ? '-ml-2' : undefined}
            title={participant.username}
          >
            {participant.character ? (
              <CharacterBadge character={participant.character} size="sm" />
            ) : (
              <PlayerAvatar
                username={participant.username}
                avatarId={participant.avatarId}
                size={PARTICIPANT_AVATAR_SIZE}
              />
            )}
          </span>
        ))}
      </span>
    </>
  )

  if (action) {
    return (
      <div className="card flex items-center gap-3">
        <Link
          href={`/parties/${game.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 no-underline"
          style={{ color: 'inherit' }}
        >
          {content}
        </Link>
        {/* Neutralizes `.cta.auto`'s own align-self so the key stays centered. */}
        <span className="flex shrink-0">{action}</span>
      </div>
    )
  }

  return (
    <Link
      href={`/parties/${game.id}`}
      className="card flex items-center gap-3 no-underline"
      style={{ color: 'inherit' }}
    >
      {content}
      <span className="flex shrink-0" style={{ color: 'var(--ink-faint)' }} aria-hidden>
        <Icon name="chevron-right" size={13} />
      </span>
    </Link>
  )
}
