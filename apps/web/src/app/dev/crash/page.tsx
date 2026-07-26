import { notFound } from 'next/navigation'

/**
 * Request-time rendering so the ALLOW_DEV_UI gate and the throw run per
 * request instead of being baked in (or failing) at build time.
 */
export const dynamic = 'force-dynamic'

/** Dev-only crash trigger: exercises global-error.tsx (no segment boundary above). */
export default function DevCrashPage() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_UI !== '1') {
    notFound()
  }
  throw new Error('Dev crash trigger (plans/020)')
}
