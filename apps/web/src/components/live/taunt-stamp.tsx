'use client'

import { displayName, type NameMap } from './types'
import { tauntText } from './taunts'
import type { ActiveTaunt } from './use-taunts'

interface TauntStampProps {
  taunt: ActiveTaunt
  names: NameMap
}

/**
 * Fullscreen taunt slam. Mounted with `key={taunt.seq}` by the live screen, so
 * a repeated taunt remounts and restarts the CSS animation, and unmounted by
 * the hook after `TAUNT_DISPLAY_MS`. Announced politely: the line is content,
 * not chrome — a player using a screen reader must hear the trash talk too.
 */
export function TauntStamp({ taunt, names }: TauntStampProps) {
  const text = tauntText(taunt.tauntId)
  // Defence in depth: the hook already filters ids this client does not know.
  if (text === null) return null

  return (
    <div className="taunt-zone" role="status" aria-live="polite">
      <p className="taunt-stamp">
        {text}
        <span className="taunt-from">
          {displayName(names, taunt.fromId)} → {displayName(names, taunt.targetId)}
        </span>
      </p>
    </div>
  )
}
