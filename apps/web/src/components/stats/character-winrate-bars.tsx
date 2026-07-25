import type { CSSProperties } from 'react'
import { CharacterBadge } from '@/components/ui/character-badge'
import { CHARACTER_META } from '@/lib/characters'
import type { CharacterWinrate } from '@/lib/queries/stats'

interface CharacterWinrateBarsProps {
  winrates: CharacterWinrate[]
}

/** Per-character winrate bars, camp-colored, maquette `.char-bar-row` structure. */
export function CharacterWinrateBars({ winrates }: CharacterWinrateBarsProps) {
  return (
    <div>
      <p className="sec-label">Victoires par personnage</p>
      <div className="flex flex-col gap-2">
        {winrates.map(({ character, winrate, games }) => (
          <div key={character} className="flex items-center gap-2.5">
            <CharacterBadge character={character} size="sm" />
            <div className="h-2.5 flex-1 overflow-hidden rounded-full border border-parchment-line bg-surface-2">
              <i
                className="block h-full rounded-full"
                style={
                  {
                    width: `${winrate}%`,
                    background: CHARACTER_META[character].colorVar,
                  } as CSSProperties
                }
              />
            </div>
            <span
              className="w-11 shrink-0 text-right font-mono text-xs font-bold"
              title={`${games} partie${games > 1 ? 's' : ''}`}
            >
              {winrate}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
