'use client'

import {
  ARENA_SOUNDS,
  ARENA_SOUND_IDS,
  MASTER_GAIN,
  shouldPlay,
  type ArenaSoundId,
} from './arena-sounds'

/**
 * Web Audio side of « Les sons de l’arène ».
 *
 * Everything about this file is shaped by one iOS rule: an AudioContext starts
 * `suspended` and only resumes from inside a user-gesture handler — in an
 * installed PWA exactly as in Safari. The sounds, however, are triggered by
 * REPLICATED STATE: on the phone of the player who was hit, no gesture
 * happened. So the context is created and unlocked on the first pointerdown
 * anywhere (`armAudioUnlock`), and any cue arriving before that is DROPPED.
 * A dropped first cue is acceptable — the sound is additive, every event it
 * marks is already visible. Do not add an autoplay shim.
 *
 * The physical silent switch mutes Web Audio on iOS and cannot be detected or
 * overridden from the web. That is a documented limitation, not a bug.
 */

type WindowWithWebkitAudio = Window &
  typeof globalThis & { webkitAudioContext?: typeof AudioContext }

let context: AudioContext | null = null
let armed = false
let visibilityBound = false

const buffers = new Map<ArenaSoundId, AudioBuffer>()
/** Keyed by `throttleKey`, so the three « ouch » variants share one clock. */
const lastPlayedAt = new Map<string, number>()

function createContext(): AudioContext | null {
  const scope = window as WindowWithWebkitAudio
  // Older iOS only exposes the prefixed constructor. Both are read here, inside
  // a function, so nothing is instantiated at module scope (Safari counts a
  // context created outside a gesture against the per-document limit).
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext
  if (Ctor === undefined) return null
  try {
    return new Ctor()
  } catch {
    // A blocked or exhausted audio stack degrades to silence, never to a crash.
    return null
  }
}

/**
 * The belt-and-braces half of the classic unlock: `resume()` alone is not
 * reliably enough on older iOS, so a single silent one-frame buffer is started
 * straight after it.
 */
function startSilentFrame(ctx: AudioContext): void {
  try {
    const source = ctx.createBufferSource()
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    source.connect(ctx.destination)
    source.start(0)
  } catch {
    // Nothing to recover: the unlock either took or the next cue is dropped.
  }
}

function bindVisibility(): void {
  if (visibilityBound) return
  visibilityBound = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    const ctx = context
    if (ctx === null) return
    // iOS suspends the context whenever the PWA is backgrounded. If the resume
    // is refused (it needs a gesture again), fall back to the one-shot listener.
    ctx.resume().catch(() => {
      armAudioUnlock()
    })
  })
}

/**
 * Arms a one-shot `pointerdown` unlock on the document. The very first touch
 * anywhere on the arena — including the tap that sends a dégommage — creates
 * the context, resumes it and starts fetching the samples.
 *
 * Idempotent: calling it while already armed or already running is a no-op.
 * Returns the cleanup that removes the listener.
 */
export function armAudioUnlock(): () => void {
  if (armed) return () => undefined
  if (context !== null && context.state === 'running') return () => undefined

  armed = true
  const unlock = (): void => {
    armed = false
    context ??= createContext()
    const ctx = context
    if (ctx === null) return
    bindVisibility()
    ctx
      .resume()
      .then(() => {
        startSilentFrame(ctx)
        void primeArenaSounds()
      })
      .catch(() => {
        // The gesture was not honoured (a synthetic event, a hostile webview):
        // re-arm so the next real touch gets another chance.
        armAudioUnlock()
      })
  }

  document.addEventListener('pointerdown', unlock, { once: true, capture: true })
  return () => {
    armed = false
    document.removeEventListener('pointerdown', unlock, { capture: true })
  }
}

/**
 * Fetches and decodes the three samples once, into a module-level map. Every
 * failure is swallowed: a missing sound must never break a game, and the cue
 * that would have used it is simply dropped.
 */
export async function primeArenaSounds(): Promise<void> {
  const ctx = context
  if (ctx === null) return
  await Promise.all(
    ARENA_SOUND_IDS.map(async (id) => {
      if (buffers.has(id)) return
      try {
        const response = await fetch(ARENA_SOUNDS[id].url)
        if (!response.ok) return
        const encoded = await response.arrayBuffer()
        buffers.set(id, await ctx.decodeAudioData(encoded))
      } catch {
        // Offline, a 404, or a codec the browser refuses: stay silent.
      }
    })
  )
}

/**
 * Plays one cue, or drops it. A cue is dropped when the context is missing or
 * not running (no gesture yet), when the page is not visible (a phone in a
 * pocket must not honk), when the sample is not decoded yet, or when the same
 * sound played too recently. Dropped, never queued: a late honk is worse than
 * no honk.
 *
 * `delayMs` is scheduled on `ctx.currentTime`, never on a wall-clock timer, so
 * the 40 ms paf offset cannot jitter against the CSS stamp animation.
 */
export function playArenaSound(id: ArenaSoundId, delayMs = 0): void {
  const ctx = context
  if (ctx === null || ctx.state !== 'running') return
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return

  const buffer = buffers.get(id)
  if (buffer === undefined) return

  const now = Date.now()
  const key = ARENA_SOUNDS[id].throttleKey
  if (!shouldPlay(id, now, lastPlayedAt.get(key) ?? null)) return
  lastPlayedAt.set(key, now)

  try {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    gain.gain.value = ARENA_SOUNDS[id].gain * MASTER_GAIN
    source.connect(gain)
    gain.connect(ctx.destination)
    source.start(ctx.currentTime + delayMs / 1000)
  } catch {
    // A context closed between the checks above and here: nothing to do.
  }
}

/**
 * Closes the context and drops the decoded buffers, so turning « Sons » off
 * actually frees the audio hardware instead of leaving a suspended context
 * around. Web Audio contexts are a limited resource on iOS.
 */
export function releaseArenaAudio(): void {
  const ctx = context
  context = null
  armed = false
  buffers.clear()
  lastPlayedAt.clear()
  if (ctx === null) return
  ctx.close().catch(() => {
    // Already closed, or closing twice: nothing left to release.
  })
}
