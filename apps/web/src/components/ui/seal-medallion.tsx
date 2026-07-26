import type { ReactElement } from 'react'
import type { SealId } from '@degommix/game-core'
import { SealArt } from './seal-art'

interface SealMedallionProps {
  sealId: SealId
  size?: 40 | 56 | 72
  /** Locked seals render the same drawing, faint and desaturated. */
  isLocked?: boolean
}

/**
 * Bronze ring around a haut-fait drawing — the `PlayerAvatar` of seals: the
 * wrapper owns the <svg> and the chrome, `SealArt` owns the 0 0 100 100 body.
 *
 * `aria-hidden` on purpose: the accessible name lives in the surrounding text
 * (label + hint), exactly like `PlayerAvatar`.
 */
export function SealMedallion({
  sealId,
  size = 56,
  isLocked = false,
}: SealMedallionProps): ReactElement {
  const className = isLocked ? 'seal-ring locked' : 'seal-ring'
  return (
    <span className={className} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 100 100" focusable="false">
        <SealArt sealId={sealId} />
      </svg>
    </span>
  )
}
