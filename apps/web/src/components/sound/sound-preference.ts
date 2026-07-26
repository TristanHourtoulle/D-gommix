/**
 * « Sons de l’arène » preference. Storage mirrors
 * `components/theme/theme.ts` exactly — a `degommix-*` localStorage key, a
 * readonly tuple with a type guard, every read and write wrapped so a blocked
 * storage (private mode, embedded webview) degrades to the safe default.
 *
 * The safe default here is `'off'`: sound is opt-in, and a player who never
 * opens « Ta hutte » must never hear anything nor download a single byte of
 * audio.
 *
 * Unlike the theme there is NO boot script: nothing paints from this value, so
 * there is nothing to flash.
 */

export const SOUND_STORAGE_KEY = 'degommix-sound'

export const SOUND_PREFERENCES = ['off', 'on'] as const

export type SoundPreference = (typeof SOUND_PREFERENCES)[number]

export function isSoundPreference(value: unknown): value is SoundPreference {
  return typeof value === 'string' && (SOUND_PREFERENCES as readonly string[]).includes(value)
}

type Listener = () => void

const listeners = new Set<Listener>()

/**
 * Cached snapshot. `useSyncExternalStore` compares snapshots by identity, and a
 * string compares by value, so caching only saves a localStorage read per
 * render — but it is also what lets the server snapshot stay constant.
 */
let snapshot: SoundPreference | null = null

function readStored(): SoundPreference {
  if (typeof window === 'undefined') return 'off'
  try {
    const stored = window.localStorage.getItem(SOUND_STORAGE_KEY)
    return isSoundPreference(stored) ? stored : 'off'
  } catch {
    // Storage can be unavailable (private mode, blocked cookies): stay silent.
    return 'off'
  }
}

/** Current preference, read once then served from memory. */
export function getSoundSnapshot(): SoundPreference {
  if (snapshot === null) snapshot = readStored()
  return snapshot
}

/**
 * Server render and hydration both see `'off'` — the honest value, since the
 * server cannot know and nothing audible depends on the first paint. React then
 * re-renders with the client snapshot right after hydration.
 */
export function getSoundServerSnapshot(): SoundPreference {
  return 'off'
}

export function subscribeSound(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Persists the choice and notifies every mounted reader in this document. */
export function storeSound(preference: SoundPreference): void {
  snapshot = preference
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, preference)
  } catch {
    // Write failures only cost persistence; the choice still holds this session.
  }
  for (const listener of listeners) listener()
}
