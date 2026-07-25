import Link from 'next/link'
import { Icon } from '@/components/icons'
import { CharacterBadge } from '@/components/ui/character-badge'
import { Pill } from '@/components/ui/pill'
import type { ActiveGame } from '@/lib/queries/home'
import { formatLabel } from './format'

interface ResumeBannerProps {
  game: ActiveGame
}

/** « Reprendre la partie » card shown while the user has a lobby or live game. */
export function ResumeBanner({ game }: ResumeBannerProps) {
  const href = game.status === 'lobby' ? `/lobby/${game.gameId}` : `/partie/${game.gameId}`

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Pill variant="wait">
          {game.status === 'lobby' ? 'Camp en attente' : 'Partie en cours'}
        </Pill>
        <Pill variant="ffa">{formatLabel(game.format)}</Pill>
      </div>
      {game.characters.length > 0 ? (
        <div className="flex">
          {game.characters.map((character, index) => (
            <span key={character} className={index > 0 ? '-ml-2' : undefined}>
              <CharacterBadge character={character} size="sm" />
            </span>
          ))}
        </div>
      ) : null}
      <Link href={href} className="cta no-underline">
        <Icon name="play" size={18} />
        Reprendre la partie
      </Link>
    </div>
  )
}
