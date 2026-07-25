'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useLongPress } from './use-long-press'

/**
 * Hidden entry point of the animations playground: a 1.5 s hold on the profile
 * avatar block opens `/dev/animations`. The gesture IS the gate — see
 * `plans/014-dev-animations-menu.md` for why this screen is not behind
 * `ALLOW_DEV_UI` like `/dev/ui`.
 *
 * Children stay a server subtree: this component only adds pointer handlers and
 * the layout classes the header used to carry itself.
 */
export function DevMenuGesture({ children }: { children: ReactNode }) {
  const router = useRouter()
  const handlers = useLongPress(() => {
    router.push('/dev/animations')
  })

  return (
    <div className="dev-longpress flex items-center gap-3" {...handlers}>
      {children}
    </div>
  )
}
