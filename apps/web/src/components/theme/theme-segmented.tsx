'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Icon, type IconName } from '@/components/icons'
import {
  applyTheme,
  readStoredTheme,
  storeTheme,
  type ThemePreference,
} from './theme'

interface ThemeOption {
  value: ThemePreference
  label: string
  icon: IconName
}

const OPTIONS: readonly ThemeOption[] = [
  { value: 'light', label: 'Clair', icon: 'sun' },
  { value: 'dark', label: 'Sombre', icon: 'moon' },
  { value: 'system', label: 'Système', icon: 'settings' },
]

function segmentStyle(selected: boolean): CSSProperties {
  return {
    background: selected ? 'var(--ink)' : 'var(--surface-2)',
    color: selected ? 'var(--parchment)' : 'var(--ink-soft)',
    border: `1.5px solid ${selected ? 'var(--ink)' : 'var(--parchment-line)'}`,
  }
}

/** Segmented control persisting the theme choice in localStorage. */
export function ThemeSegmented() {
  const [preference, setPreference] = useState<ThemePreference | null>(null)

  useEffect(() => {
    setPreference(readStoredTheme())
  }, [])

  const handleSelect = useCallback((next: ThemePreference) => {
    setPreference(next)
    storeTheme(next)
    applyTheme(next)
  }, [])

  const selectedValue = preference ?? 'system'

  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label="Thème de l'application">
      {OPTIONS.map((option) => {
        const selected = option.value === selectedValue
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => handleSelect(option.value)}
            className="flex flex-1 flex-col items-center gap-1 rounded-[10px] py-2.5 text-xs font-bold"
            style={segmentStyle(selected)}
          >
            <Icon name={option.icon} size={18} />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
