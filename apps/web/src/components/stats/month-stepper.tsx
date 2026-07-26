'use client'

import { currentParisMonthKey, nextMonthKey, previousMonthKey } from '@/lib/season'
import { formatMonthKey } from './format'

interface MonthStepperProps {
  /** Browsed archive month; null = the running month-to-date window. */
  monthKey: string | null
  /** Earliest Paris month with a finished game; null disables stepping back. */
  earliestMonth: string | null
  onChange: (monthKey: string | null) => void
}

/**
 * « ‹ juillet 2026 › » month navigation of the Classement archive (plan 027).
 * Rendered only while the month period is active; stepping forward onto the
 * current month hands back the month-to-date window (monthKey null).
 */
export function MonthStepper({ monthKey, earliestMonth, onChange }: MonthStepperProps) {
  const currentKey = currentParisMonthKey()
  const shown = monthKey ?? currentKey
  const previous = previousMonthKey(shown)
  const next = nextMonthKey(shown)
  const previousDisabled = earliestMonth === null || previous === null || previous < earliestMonth
  const nextDisabled = monthKey === null || next === null

  return (
    <div className="segmented" role="group" aria-label="Mois du classement">
      <button
        type="button"
        className="segment"
        aria-label="Mois précédent"
        disabled={previousDisabled}
        onClick={() => {
          if (previous !== null) onChange(previous)
        }}
      >
        ‹
      </button>
      <span className="segment" aria-live="polite">
        {formatMonthKey(shown)}
      </span>
      <button
        type="button"
        className="segment"
        aria-label="Mois suivant"
        disabled={nextDisabled}
        onClick={() => {
          if (next !== null) onChange(next === currentKey ? null : next)
        }}
      >
        ›
      </button>
    </div>
  )
}
