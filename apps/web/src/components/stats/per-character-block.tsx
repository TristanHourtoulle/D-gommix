import { CharacterWinrateBars } from './character-winrate-bars'
import type { CharacterStat } from '@/lib/character-stats'

interface PerCharacterBlockProps {
  perCharacter: CharacterStat[]
}

/**
 * One player's winrate per character, rendered with the classement's bars.
 * Characters without a village_reached game are hidden (`winrate === null`,
 * the small-sample guard of buildPerCharacter).
 */
export function PerCharacterBlock({ perCharacter }: PerCharacterBlockProps) {
  const winrates = perCharacter.flatMap((stat) =>
    stat.winrate === null
      ? []
      : [{ character: stat.character, winrate: stat.winrate, games: stat.villageGames }]
  )

  if (winrates.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="sec-label">Victoires par personnage</p>
        <p className="m-0 text-sm" style={{ color: 'var(--ink-soft)' }}>
          Les winrates par personnage apparaîtront après les premières parties menées au village.
        </p>
      </div>
    )
  }
  return <CharacterWinrateBars winrates={winrates} />
}
