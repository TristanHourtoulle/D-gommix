'use client'

import type { GameFormat } from '@degommix/game-core'

const FORMATS: readonly GameFormat[] = [2, 3, 4]

interface FormatSegmentedProps {
  value: GameFormat
  onChange: (format: GameFormat) => void
  /** Formats below this player count are disabled (seats already taken). */
  minFormat?: number
  disabled?: boolean
}

/** Arcade `.segmented` control for the 2 / 3 / 4 player format. */
export function FormatSegmented({
  value,
  onChange,
  minFormat = 0,
  disabled = false,
}: FormatSegmentedProps) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Nombre de joueurs">
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
            className="segment num"
          >
            {format}
          </button>
        )
      })}
    </div>
  )
}
