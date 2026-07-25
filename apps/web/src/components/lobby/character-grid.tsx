'use client'

import type { CharacterId } from '@degommix/game-core'
import { CharacterBadge } from '@/components/ui/character-badge'
import { CHARACTER_IDS, CHARACTER_META } from '@/lib/characters'
import type { LobbyPlayer } from '@/lib/realtime-types'

interface CharacterGridProps {
  players: LobbyPlayer[]
  meId: string
  disabled?: boolean
  onPick: (character: CharacterId) => void
}

/**
 * The four character cells: free (dashed, tappable), mine (bronze ring) or
 * locked by another player (solid, greyed, taker's name shown).
 */
export function CharacterGrid({ players, meId, disabled = false, onPick }: CharacterGridProps) {
  const takenBy = new Map<CharacterId, LobbyPlayer>()
  for (const player of players) {
    if (player.character) takenBy.set(player.character, player)
  }

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {CHARACTER_IDS.map((character) => {
        const meta = CHARACTER_META[character]
        const taker = takenBy.get(character)
        const mine = taker?.userId === meId
        const locked = taker !== undefined && !mine
        return (
          <button
            key={character}
            type="button"
            disabled={locked || mine || disabled}
            aria-label={locked ? `${meta.label}, pris par ${taker.username}` : meta.label}
            onClick={() => onPick(character)}
            className="flex flex-col items-center gap-1.5 rounded-xl p-2.5 text-center"
            style={{
              border: taker
                ? `1.5px solid ${mine ? 'var(--bronze)' : 'var(--parchment-line)'}`
                : '1.5px dashed var(--parchment-line)',
              background: taker ? 'var(--surface-2)' : 'transparent',
              opacity: locked ? 0.55 : 1,
              filter: locked ? 'grayscale(0.65)' : undefined,
              cursor: locked || mine ? 'default' : 'pointer',
            }}
          >
            <CharacterBadge character={character} />
            <b className="text-[0.76rem]">{meta.label}</b>
            <span className="text-[0.7rem]" style={{ color: 'var(--ink-faint)' }}>
              {taker ? (mine ? 'toi' : taker.username) : 'libre'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
