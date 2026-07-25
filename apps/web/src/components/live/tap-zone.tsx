'use client'

import type { CSSProperties } from 'react'
import type { PlayerState } from '@degommix/game-core'
import { CharacterBadge } from '@/components/ui/character-badge'
import { CHARACTER_META } from '@/lib/characters'
import { displayName, type NameMap } from './types'

interface TapZoneProps {
  /** Opponents still in game — one chip each, one tap = one degommage. */
  opponents: PlayerState[]
  names: NameMap
  onTap: (targetId: string) => void
}

/**
 * « Tu viens de dégommer qui ? » — no confirmation dialog, the counter only
 * moves when the confirmed `game:event` comes back (light press feedback).
 */
export function TapZone({ opponents, names, onTap }: TapZoneProps) {
  if (opponents.length === 0) return null

  return (
    <section className="relative z-10 flex flex-col gap-2" data-testid="tap-zone">
      <p className="m-0 text-center text-sm font-bold">Tu viens de dégommer qui ?</p>
      <div className="flex flex-wrap justify-center gap-2">
        {opponents.map((opponent) => {
          const meta = CHARACTER_META[opponent.character]
          return (
            <button
              key={opponent.userId}
              type="button"
              onClick={() => {
                onTap(opponent.userId)
              }}
              className="flex cursor-pointer items-center gap-2 rounded-full py-1.5 pr-3 pl-1.5 text-sm font-bold transition-transform active:scale-90"
              style={
                {
                  border: '2px solid',
                  borderColor: meta.colorVar,
                  background: 'var(--surface-2)',
                  color: 'var(--ink)',
                } as CSSProperties
              }
            >
              <CharacterBadge character={opponent.character} size="sm" />
              {displayName(names, opponent.userId)}
              <span style={{ color: meta.colorVar }}>+1</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
