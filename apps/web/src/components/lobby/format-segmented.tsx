'use client'

import type { CSSProperties } from 'react'
import type { GameFormat } from '@degommix/game-core'

const FORMATS: readonly GameFormat[] = [2, 3, 4]

interface FormatSegmentedProps {
  value: GameFormat
  onChange: (format: GameFormat) => void
  /** Formats below this player count are disabled (seats already taken). */
  minFormat?: number
  disabled?: boolean
}

function segmentStyle(selected: boolean): CSSProperties {
  return {
    fontFamily: 'var(--font-mono)',
    background: selected ? 'var(--ink)' : 'var(--surface-2)',
    color: selected ? 'var(--parchment)' : 'var(--ink-soft)',
    border: `1.5px solid ${selected ? 'var(--ink)' : 'var(--parchment-line)'}`,
  }
}

/** Maquette `.segmented` control for the 2 / 3 / 4 player format. */
export function FormatSegmented({
  value,
  onChange,
  minFormat = 0,
  disabled = false,
}: FormatSegmentedProps) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label="Nombre de joueurs">
      {FORMATS.map((format) => {
        const selected = format === value
        const blocked = disabled || format < minFormat
        return (
          <button
            key={format}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={blocked && !selected}
            onClick={() => {
              if (!selected && !blocked) onChange(format)
            }}
            className="flex-1 rounded-[10px] py-2 text-center font-bold disabled:cursor-not-allowed disabled:opacity-40"
            style={segmentStyle(selected)}
          >
            {format}
          </button>
        )
      })}
    </div>
  )
}
