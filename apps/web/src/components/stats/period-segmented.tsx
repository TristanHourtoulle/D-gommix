'use client'

import type { LeaderboardPeriod } from '@/hooks/use-tab-data'

interface PeriodSegmentedProps {
  value: LeaderboardPeriod
  onChange: (period: LeaderboardPeriod) => void
}

const PERIODS: readonly { value: LeaderboardPeriod; label: string }[] = [
  { value: 'all', label: 'Toujours' },
  { value: 'month', label: 'Ce mois-ci' },
]

/** Arcade `.segmented` toggle between the all-time and month-to-date windows. */
export function PeriodSegmented({ value, onChange }: PeriodSegmentedProps) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Période du classement">
      {PERIODS.map((period) => {
        const selected = period.value === value
        return (
          <button
            key={period.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              if (!selected) onChange(period.value)
            }}
            className="segment"
          >
            {period.label}
          </button>
        )
      })}
    </div>
  )
}
