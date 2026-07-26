import Link from 'next/link'
import { Icon } from '@/components/icons'
import { CharacterBadge } from '@/components/ui/character-badge'
import type { ActiveGame } from '@/lib/queries/home'
import { formatLabel } from './format'

interface ResumeBannerProps {
  game: ActiveGame
}

/**
 * « Reprendre la partie » card shown while the user has a lobby or live game.
 * Same card vocabulary as the invitation banner: icon + bold status + meta
 * sub-line, then a full-width small key.
 */
export function ResumeBanner({ game }: ResumeBannerProps) {
  const href = game.status === 'lobby' ? `/lobby/${game.gameId}` : `/partie/${game.gameId}`

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className="flex shrink-0" style={{ color: 'var(--bronze-strong)' }} aria-hidden>
          <Icon name="flag" size={20} />
        </span>
        <p className="m-0 min-w-0 flex-1 text-sm leading-snug">
          <b className="block truncate">
            {game.status === 'lobby' ? 'Camp en attente' : 'Partie en cours'}
          </b>
          <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>
            {formatLabel(game.format)}
          </span>
        </p>
        {game.characters.length > 0 ? (
          <span className="flex shrink-0">
            {game.characters.map((character, index) => (
              <span key={character} className={index > 0 ? '-ml-2' : undefined}>
                <CharacterBadge character={character} size="sm" />
              </span>
            ))}
          </span>
        ) : null}
      </div>
      <Link href={href} className="cta sm no-underline">
        <Icon name="play" size={14} />
        Reprendre la partie
      </Link>
    </div>
  )
}
