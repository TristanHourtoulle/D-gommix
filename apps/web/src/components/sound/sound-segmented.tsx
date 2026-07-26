'use client'

import { useSyncExternalStore } from 'react'
import {
  getSoundServerSnapshot,
  getSoundSnapshot,
  storeSound,
  subscribeSound,
  type SoundPreference,
} from './sound-preference'

interface SoundOption {
  value: SoundPreference
  label: string
}

/**
 * « Muet » first, because off is the default and the honest resting state of
 * this control. No icon: the icon registry has no speaker glyph, and adding one
 * is an icon-pipeline job.
 */
const OPTIONS: readonly SoundOption[] = [
  { value: 'off', label: 'Muet' },
  { value: 'on', label: 'Sons' },
]

/**
 * Arcade `.segmented` control for « Les sons de l’arène ». It writes to the
 * store and nothing else — the live screen subscribes on its own, so flipping
 * this changes an open arena without a reload. The tap itself also counts as
 * the iOS unlock gesture for the rest of this document.
 */
export function SoundSegmented() {
  const preference = useSyncExternalStore(
    subscribeSound,
    getSoundSnapshot,
    getSoundServerSnapshot
  )

  return (
    <div className="segmented" role="radiogroup" aria-label="Sons de l’arène">
      {OPTIONS.map((option) => {
        const selected = option.value === preference
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => storeSound(option.value)}
            className="segment"
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
