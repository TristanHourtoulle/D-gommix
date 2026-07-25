export const THEME_STORAGE_KEY = 'degommix-theme'

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const

export type ThemePreference = (typeof THEME_PREFERENCES)[number]

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
  )
}

/**
 * Mirrors the inline boot script: `data-theme` drives the CSS overrides, and its
 * absence lets `prefers-color-scheme` decide (the "Système" choice).
 */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement
  if (preference === 'system') {
    root.removeAttribute('data-theme')
    return
  }
  root.setAttribute('data-theme', preference)
}

export function readStoredTheme(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(stored) ? stored : 'system'
  } catch {
    // Storage can be unavailable (private mode, blocked cookies): fall back to system.
    return 'system'
  }
}

export function storeTheme(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Write failures only cost persistence; the theme still applies for this session.
  }
}
