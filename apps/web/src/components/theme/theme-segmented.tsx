'use client'

import { useCallback, useEffect, useState } from 'react'
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

/** Arcade `.segmented` control persisting the theme choice in localStorage. */
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
    <div className="segmented" role="radiogroup" aria-label="Thème de l'application">
      {OPTIONS.map((option) => {
        const selected = option.value === selectedValue
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => handleSelect(option.value)}
            className="segment stacked"
          >
            <Icon name={option.icon} size={18} />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
