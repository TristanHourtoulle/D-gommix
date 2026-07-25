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
  /** Chip whose degommage is being confirmed by the server, `null` when idle. */
  pendingTargetId: string | null
  /** True while the anti double-tap lock holds every chip (see `tap-lock.ts`). */
  isLocked: boolean
}

const CHIP_BASE =
  'flex items-center gap-2 rounded-full py-1.5 pr-3 pl-1.5 text-sm font-bold transition-[transform,opacity] duration-150 motion-reduce:transition-none'

/**
 * « Tu viens de dégommer qui ? » — no confirmation dialog, the counter only
 * moves when the confirmed `game:event` comes back (light press feedback).
 * Every chip locks for the duration of a tap so a bounce tap cannot register a
 * second degommage.
 */
export function TapZone({ opponents, names, onTap, pendingTargetId, isLocked }: TapZoneProps) {
  if (opponents.length === 0) return null

  return (
    <section className="relative z-10 flex flex-col gap-2" data-testid="tap-zone">
      <p className="m-0 text-center text-sm font-bold">Tu viens de dégommer qui ?</p>
      <div className="flex flex-wrap justify-center gap-2">
        {opponents.map((opponent) => {
          const meta = CHARACTER_META[opponent.character]
          const isPending = opponent.userId === pendingTargetId
          return (
            <button
              key={opponent.userId}
              type="button"
              disabled={isLocked}
              aria-busy={isPending}
              data-state={isPending ? 'confirming' : isLocked ? 'locked' : 'idle'}
              onClick={() => {
                onTap(opponent.userId)
              }}
              className={[
                CHIP_BASE,
                isLocked
                  ? 'cursor-default'
                  : 'cursor-pointer active:scale-90 motion-reduce:active:scale-100',
                isPending ? 'scale-95 opacity-80 motion-reduce:scale-100' : '',
                isLocked && !isPending ? 'opacity-40' : '',
              ]
                .filter(Boolean)
                .join(' ')}
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
