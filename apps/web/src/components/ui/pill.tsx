import type { ReactNode } from 'react'

interface PillProps {
  children: ReactNode
  variant: 'win' | 'loss' | 'wait' | 'ffa'
}

export function Pill({ children, variant }: PillProps) {
  return <span className={`pill ${variant}`}>{children}</span>
}
