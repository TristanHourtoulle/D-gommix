/**
 * Pure inputs of the opening sequence (« Le déroulé »). Kept free of every
 * browser global so the decision is unit-testable and so the component can read
 * `sessionStorage` / `matchMedia` in an effect — never during render, which
 * would desync SSR from hydration.
 */

/** Session flag: the sequence plays once per browser session, per tab. */
export const SPLASH_SEEN_KEY = 'degommix.splash.seen'

/** The value written under `SPLASH_SEEN_KEY`. Any other value replays it. */
export const SPLASH_SEEN_VALUE = '1'

/**
 * Owner-validated total. The sequence never runs longer, even when the app's
 * cold-start data is still loading behind it — and never gets cut short when
 * the data arrives early. Mirrored by the delays of the `sp-*` CSS section in
 * `apps/web/src/app/globals.css`: retiming a phase means editing both.
 */
export const SPLASH_TOTAL_MS = 4600

/** Fade-out of the overlay itself, taken *inside* SPLASH_TOTAL_MS. */
export const SPLASH_FADE_MS = 240

export interface SplashGateInput {
  /** Raw value read from `sessionStorage`, or `null` when absent/blocked. */
  readonly seenFlag: string | null
  /** `(prefers-reduced-motion: reduce)` at mount time. */
  readonly prefersReducedMotion: boolean
}

/**
 * Reduced motion wins over everything: there is no shortened variant, the
 * sequence simply never mounts. Otherwise it plays exactly once per session.
 */
export function shouldShowSplash({ seenFlag, prefersReducedMotion }: SplashGateInput): boolean {
  if (prefersReducedMotion) return false
  return seenFlag !== SPLASH_SEEN_VALUE
}
