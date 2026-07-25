'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { LONG_PRESS_MS, LongPress } from './long-press'

export interface LongPressHandlers {
  onPointerDown: (event: ReactPointerEvent) => void
  onPointerMove: (event: ReactPointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onPointerLeave: () => void
  onContextMenu: (event: ReactMouseEvent) => void
}

/** React binding of {@link LongPress} — that module documents the gesture rules. */
export function useLongPress(
  onFire: () => void,
  holdMs: number = LONG_PRESS_MS
): LongPressHandlers {
  // The callback lives in a ref so a re-render never rebuilds the recognizer
  // mid-hold, which would drop the armed timer.
  const onFireRef = useRef(onFire)
  onFireRef.current = onFire

  const press = useMemo(() => new LongPress(() => onFireRef.current(), holdMs), [holdMs])

  useEffect(() => {
    const cancel = (): void => {
      press.cancel()
    }
    // A page scroll always cancels the hold, even when the browser emits no
    // `pointercancel` — capture phase so a scrolling ancestor is caught too.
    window.addEventListener('scroll', cancel, { capture: true, passive: true })
    return () => {
      window.removeEventListener('scroll', cancel, { capture: true })
      press.cancel()
    }
  }, [press])

  return {
    onPointerDown: (event) => {
      if (event.button !== 0) return
      press.start({ x: event.clientX, y: event.clientY })
    },
    onPointerMove: (event) => {
      press.move({ x: event.clientX, y: event.clientY })
    },
    onPointerUp: press.cancel,
    onPointerCancel: press.cancel,
    onPointerLeave: press.cancel,
    onContextMenu: (event) => {
      // Otherwise Android and desktop pop their context menu mid-hold.
      event.preventDefault()
    },
  }
}
