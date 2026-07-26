'use client'

import { useId, useState } from 'react'
import { TITLE_META, type TitleId } from '@/lib/titles'

interface PlayerTitleLineProps {
  /** Worn title, or null when the player has none (cold start). */
  titleId: TitleId | null
  /** Podium columns are centred; the two profile headers are left-aligned. */
  align?: 'left' | 'center'
  /**
   * Tap the title to reveal « comment on le gagne » under it. Off only where
   * the line already sits inside a link (the podium): a <button> nested in an
   * <a> is invalid HTML and would fight the row's own tap target. There the
   * hint rides the link's aria-label instead — see `Podium`.
   */
  interactive?: boolean
}

/**
 * « Titre gaulois » worn under a pseudo. The bronze italic cousin of
 * `.sec-label` (globals.css): same micro-size and weight, but italic, in
 * bronze, and never uppercased — « L’Increvable » is a proper noun.
 *
 * The definition used to live in a `title=` tooltip, i.e. nowhere at all on a
 * phone. It is a tap-to-reveal caption now (second tap closes it); the dotted
 * underline is what says « tappable ».
 */
export function PlayerTitleLine({
  titleId,
  align = 'left',
  interactive = true,
}: PlayerTitleLineProps) {
  const [isOpen, setIsOpen] = useState(false)
  const hintId = useId()
  if (titleId === null) return null

  const meta = TITLE_META[titleId]
  const alignClass = align === 'center' ? 'text-center' : 'text-left'
  const labelClass = `block max-w-full truncate text-[0.68rem] font-bold italic text-bronze-strong ${alignClass}`

  if (!interactive) {
    return (
      <span className={labelClass} title={meta.hint}>
        {meta.label}
      </span>
    )
  }

  return (
    <span className={`block max-w-full ${alignClass}`}>
      <button
        type="button"
        className={`${labelClass} cursor-pointer underline decoration-dotted underline-offset-2`}
        aria-expanded={isOpen}
        aria-controls={hintId}
        onClick={() => setIsOpen((open) => !open)}
      >
        {meta.label}
      </button>
      {isOpen ? (
        <span
          id={hintId}
          className={`block text-[0.62rem] ${alignClass}`}
          style={{ color: 'var(--ink-faint)' }}
        >
          {meta.hint}
        </span>
      ) : null}
    </span>
  )
}
