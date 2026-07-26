import type { ReactNode } from 'react'

interface PillProps {
  children: ReactNode
  variant: 'win' | 'loss' | 'wait' | 'ffa' | 'bronze' | 'plain'
}

export function Pill({ children, variant }: PillProps) {
  return <span className={`pill ${variant}`}>{children}</span>
}
