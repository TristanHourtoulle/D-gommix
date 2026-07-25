'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import {
  SPLASH_FADE_MS,
  SPLASH_SEEN_KEY,
  SPLASH_SEEN_VALUE,
  SPLASH_TOTAL_MS,
  shouldShowSplash,
} from './splash-gate'

const WORDMARK = 'DÉGOMMIX'

/**
 * The four camps, in the validated order. Colours are hardcoded light-theme hex
 * on purpose: the splash never follows the app theme (see the `sp-*` section of
 * globals.css).
 */
const CAMPS = [
  { color: '#b23a2e', name: 'Astérix' },
  { color: '#2c5b82', name: 'Obélix' },
  { color: '#b9861f', name: 'Caius' },
  { color: '#3f6b3c', name: 'Caligula' },
] as const

const LEAVES = [
  { cx: 49, cy: 26, rx: 11, ry: 6, rotate: -32 },
  { cx: 41, cy: 47, rx: 11, ry: 6, rotate: -22 },
  { cx: 35, cy: 68, rx: 11, ry: 6, rotate: -12 },
  { cx: 32, cy: 88, rx: 10, ry: 5.5, rotate: -4 },
  { cx: 31, cy: 105, rx: 8, ry: 4.5, rotate: 0 },
] as const

/**
 * One laurel sprig: a stem traced with `stroke-dashoffset` then five leaves
 * hatching in sequence. The `stroke-dasharray: 210` pairs with the
 * `sp-draw` keyframe, which counts down from that exact length.
 */
function SplashLaurel({ side }: { side: 'l' | 'r' }) {
  return (
    <svg className={`sp-laurel ${side}`} viewBox="0 0 74 118" aria-hidden="true">
      <path d="M62 8 C40 32 30 62 32 110" style={{ strokeDasharray: 210 }} />
      {LEAVES.map((leaf, index) => (
        <ellipse
          key={`${leaf.cx}-${leaf.cy}`}
          style={{ '--i': index } as CSSProperties}
          cx={leaf.cx}
          cy={leaf.cy}
          rx={leaf.rx}
          ry={leaf.ry}
          transform={
            leaf.rotate === 0 ? undefined : `rotate(${leaf.rotate} ${leaf.cx} ${leaf.cy})`
          }
        />
      ))}
    </svg>
  )
}

export interface SplashOverlayProps {
  /** Drives the whole sequence. Dropping it snaps every element to its rest
   *  state, which is the final image. */
  readonly playing: boolean
  /** Set while the overlay fades out, right before it unmounts. */
  readonly leaving?: boolean
  readonly onDismiss: () => void
}

/**
 * Purely presentational, so the hidden dev animations menu (plan 014) can drive
 * `playing` itself without ever touching the session flag.
 */
export function SplashOverlay({ playing, leaving = false, onDismiss }: SplashOverlayProps) {
  const classNames = ['sp-root']
  if (playing) classNames.push('is-playing')
  if (leaving) classNames.push('sp-out')

  return (
    <div className={classNames.join(' ')}>
      <div className="sp-rod top" aria-hidden="true" />
      <div className="sp-rod bot" aria-hidden="true" />
      <div className="sp-sheet" aria-hidden="true">
        <SplashLaurel side="l" />
        <SplashLaurel side="r" />
        <p className="wordmark sp-mark">
          {Array.from(WORDMARK).map((letter, index) => (
            <span key={`${letter}-${index}`} style={{ '--i': index } as CSSProperties}>
              {letter}
            </span>
          ))}
        </p>
        <div className="sp-rule" />
        <p className="sp-sub">Le Village des quatre camps</p>
        <div className="sp-pips">
          {CAMPS.map((camp, index) => (
            <span
              key={camp.name}
              className="sp-pip"
              style={{ '--c': camp.color, '--i': index } as CSSProperties}
            />
          ))}
        </div>
        <p className="sp-salve">Salve !</p>
      </div>
      <button
        type="button"
        className="sp-skip"
        onClick={onDismiss}
        aria-label="Passer l'animation d'ouverture"
      />
    </div>
  )
}

type SplashPhase = 'idle' | 'playing' | 'leaving'

/**
 * Mounts the opening sequence once per session, over the app. Rendered as a
 * sibling of the app tree in the root layout, so it survives every client-side
 * navigation and never replays when crossing route groups.
 */
export function SplashGate() {
  const [phase, setPhase] = useState<SplashPhase>('idle')

  // The decision is taken post-hydration, on purpose: the first client render
  // must be byte-identical to the server's (nothing at all), otherwise React
  // warns and the overlay flashes on every hydration. Reading sessionStorage or
  // matchMedia during render would break exactly that.
  useEffect(() => {
    let seenFlag: string | null = null
    try {
      seenFlag = window.sessionStorage.getItem(SPLASH_SEEN_KEY)
    } catch {
      // Storage blocked (private mode, embedded webview): treat as unseen —
      // the splash is decorative, never a gate on anything.
    }
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!shouldShowSplash({ seenFlag, prefersReducedMotion })) return

    try {
      // Written at the start, not at the end: a reload mid-splash must not
      // replay it.
      window.sessionStorage.setItem(SPLASH_SEEN_KEY, SPLASH_SEEN_VALUE)
    } catch {
      // Same: a session that cannot remember replays it. Acceptable.
    }
    setPhase('playing')
  }, [])

  // The 240 ms fade is taken *inside* the 4 600 ms budget, so the cut to the app
  // is never a hard flash — which matters in dark theme, where the app behind is
  // near-black while the splash is parchment.
  useEffect(() => {
    if (phase !== 'playing') return
    const timer = window.setTimeout(() => setPhase('leaving'), SPLASH_TOTAL_MS - SPLASH_FADE_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'leaving') return
    const timer = window.setTimeout(() => setPhase('idle'), SPLASH_FADE_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  // Tap anywhere: dropping `is-playing` snaps to the final image, then the same
  // fade runs. No-op once the sequence is already leaving or gone.
  const dismiss = useCallback(() => {
    setPhase((current) => (current === 'playing' ? 'leaving' : current))
  }, [])

  if (phase === 'idle') return null

  return (
    <SplashOverlay playing={phase === 'playing'} leaving={phase === 'leaving'} onDismiss={dismiss} />
  )
}
