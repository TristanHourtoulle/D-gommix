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
 * `suspended` and only resumes from inside a user-ACTIVATION handler — in an
 * installed PWA exactly as in Safari. The sounds, however, are triggered by
 * REPLICATED STATE: on the phone of the player who was hit, no gesture
 * happened. So the context is created and unlocked on the first activation
 * anywhere (`armAudioUnlock`), and any cue arriving before that is DROPPED.
 * A dropped first cue is acceptable — the sound is additive, every event it
 * marks is already visible. Do not add an autoplay shim.
 *
 * Which events count matters. Per the HTML user-activation spec (and WebKit),
 * `pointerdown` is activation-triggering only for a MOUSE; for a finger it is
 * `pointerup` / `touchend`. Listening to `pointerdown` alone therefore unlocks
 * desktops and silently fails forever on phones. The unlock listens to
 * `touchend`, `pointerup`, `click` and `keydown`, and does everything iOS
 * wants inside the gesture, synchronously: create the context, `resume()`,
 * start a silent frame. The listeners stay attached until the context is
 * actually observed `running` (a `resume()` promise may never settle), and are
 * re-armed whenever the context later leaves `running` (iOS `suspended`, or
 * the non-standard `interrupted`, after backgrounding, a call, a lock).
 *
 * The physical silent switch mutes Web Audio under iOS's default `ambient`
 * audio session. Since iOS 17, `navigator.audioSession.type = 'playback'`
 * overrides that, and the owner chose to force it — accepting that it pauses
 * other apps' music while the arena is open. Older iOS keeps the old limit.
 */

type WindowWithWebkitAudio = Window &
  typeof globalThis & { webkitAudioContext?: typeof AudioContext }

/** The Audio Session API (iOS 17+), absent from the TS DOM lib. */
interface NavigatorWithAudioSession {
  audioSession: { type: string }
}

const GESTURE_EVENTS = ['touchend', 'pointerup', 'click', 'keydown'] as const
const GESTURE_OPTIONS: AddEventListenerOptions = { capture: true, passive: true }

let context: AudioContext | null = null
let armed = false
/** Whether a caller currently wants the unlock armed (cleared by its cleanup). */
let wanted = false
let visibilityBound = false
/** In-flight `primeArenaSounds`, shared by concurrent callers. */
let priming: Promise<void> | null = null

const buffers = new Map<ArenaSoundId, AudioBuffer>()
/** Keyed by `throttleKey`, so the three « ouch » variants share one clock. */
const lastPlayedAt = new Map<string, number>()

function isRunning(ctx: AudioContext): boolean {
  return ctx.state === 'running'
}

/** Lets the sound play through the iOS silent switch (iOS 17+). */
function forcePlaybackSession(): void {
  if (typeof navigator === 'undefined' || !('audioSession' in navigator)) return
  try {
    ;(navigator as Navigator & NavigatorWithAudioSession).audioSession.type = 'playback'
  } catch {
    // A webview exposing a read-only or partial API: keep the default session.
  }
}

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
 * in the same gesture.
 */
function startSilentFrame(ctx: AudioContext): void {
  try {
    const source = ctx.createBufferSource()
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    source.connect(ctx.destination)
    source.start(0)
  } catch {
    // Nothing to recover: the unlock either took or the next gesture retries.
  }
}

/**
 * Safe to call once per event of a tap: priming skips decoded samples and
 * shares its in-flight run, and calling it every time retries a failed fetch.
 */
function onRunning(): void {
  disarm()
  void primeArenaSounds()
}

/**
 * Follows the context's state for its whole life: observing `running` ends the
 * unlock, and leaving it (`suspended`, iOS `interrupted`) re-arms it.
 */
function handleStateChange(this: AudioContext): void {
  if (this !== context) return
  if (isRunning(this)) {
    onRunning()
    return
  }
  if (this.state !== 'closed' && wanted) attachGestureListeners()
}

function tryResume(ctx: AudioContext): void {
  ctx
    .resume()
    .then(() => {
      if (ctx === context && isRunning(ctx)) onRunning()
    })
    .catch(() => {
      // Refused (no activation, a hostile webview): the listeners stay armed
      // and the next real gesture tries again.
    })
}

function handleVisibilityChange(): void {
  if (document.visibilityState !== 'visible') return
  const ctx = context
  if (!wanted || ctx === null || isRunning(ctx)) return
  // iOS suspends the context whenever the PWA is backgrounded. The resume may
  // be honoured without a gesture; if not, the gesture listeners take over.
  attachGestureListeners()
  tryResume(ctx)
}

function bindVisibility(): void {
  if (visibilityBound) return
  visibilityBound = true
  document.addEventListener('visibilitychange', handleVisibilityChange)
}

function unbindVisibility(): void {
  if (!visibilityBound) return
  visibilityBound = false
  document.removeEventListener('visibilitychange', handleVisibilityChange)
}

/** Runs inside the activation, synchronously: iOS checks it at call time. */
function unlock(): void {
  if (context === null) {
    forcePlaybackSession()
    const created = createContext()
    if (created === null) {
      // No Web Audio at all: nothing a further gesture could change.
      disarm()
      return
    }
    context = created
    created.addEventListener('statechange', handleStateChange)
    bindVisibility()
  }
  const ctx = context
  if (isRunning(ctx)) {
    onRunning()
    return
  }
  tryResume(ctx)
  startSilentFrame(ctx)
}

function attachGestureListeners(): void {
  if (armed) return
  armed = true
  for (const type of GESTURE_EVENTS) {
    document.addEventListener(type, unlock, GESTURE_OPTIONS)
  }
}

function disarm(): void {
  if (!armed) return
  armed = false
  for (const type of GESTURE_EVENTS) {
    document.removeEventListener(type, unlock, GESTURE_OPTIONS)
  }
}

/**
 * Arms the unlock on the document. The very first activation anywhere on the
 * arena — including the tap that sends a dégommage — creates the context,
 * resumes it and starts fetching the samples. The listeners come back on their
 * own whenever the context later drops out of `running`.
 *
 * Idempotent: calling it while already armed is a no-op. Returns the cleanup
 * that removes every gesture listener and stops the automatic re-arming.
 */
export function armAudioUnlock(): () => void {
  if (armed) return () => undefined
  wanted = true
  const existing = context
  if (existing !== null) {
    // Re-entering the arena: the previous cleanup suspended the context (maybe
    // still in flight, as on a StrictMode remount). Resume it now — without a
    // gesture this succeeds whenever the page already holds user activation,
    // so a hit landing before the first tap is not dropped. A later resume
    // wins over an earlier pending suspend.
    tryResume(existing)
  }
  if (existing === null || !isRunning(existing)) attachGestureListeners()
  return () => {
    wanted = false
    disarm()
    // Outside the arena nothing may hold the `playback` session (it pauses the
    // user's music): suspend, and the next arena's gesture resumes it.
    const ctx = context
    if (ctx !== null && isRunning(ctx)) {
      ctx.suspend().catch(() => {
        // Already closing or closed: nothing left to silence.
      })
    }
  }
}

/**
 * Fetches and decodes the three samples once, into a module-level map. Every
 * failure is swallowed: a missing sound must never break a game, and the cue
 * that would have used it is simply dropped.
 */
export function primeArenaSounds(): Promise<void> {
  const ctx = context
  if (ctx === null) return Promise.resolve()
  if (priming !== null) return priming
  const run = decodeMissingSamples(ctx).finally(() => {
    if (priming === run) priming = null
  })
  priming = run
  return run
}

async function decodeMissingSamples(ctx: AudioContext): Promise<void> {
  await Promise.all(
    ARENA_SOUND_IDS.map(async (id) => {
      if (buffers.has(id)) return
      try {
        const response = await fetch(ARENA_SOUNDS[id].url)
        if (!response.ok) return
        const encoded = await response.arrayBuffer()
        const decoded = await ctx.decodeAudioData(encoded)
        // A release mid-flight must not leave buffers of a closed context.
        if (ctx === context) buffers.set(id, decoded)
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
  wanted = false
  disarm()
  unbindVisibility()
  priming = null
  buffers.clear()
  lastPlayedAt.clear()
  if (ctx === null) return
  ctx.removeEventListener('statechange', handleStateChange)
  ctx.close().catch(() => {
    // Already closed, or closing twice: nothing left to release.
  })
}
