'use client'

import type { ReactNode } from 'react'

interface SheetProps {
  title: string
  onClose: () => void
  children: ReactNode
}

/** Bottom sheet over a dim backdrop — tap outside to dismiss. */
export function Sheet({ title, onClose, children }: SheetProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 cursor-default border-0 p-0"
        style={{ background: 'rgba(20, 12, 5, 0.45)' }}
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md rounded-t-2xl border-2 p-4 pb-8"
        style={{
          background: 'var(--surface-2)',
          borderColor: 'var(--parchment-line)',
          boxShadow: 'var(--shadow)',
        }}
      >
        <p className="m-0 mb-3 text-center text-sm font-bold">{title}</p>
        {children}
      </div>
    </div>
  )
}

interface ModalProps {
  title: string
  children: ReactNode
}

/** Centered modal without outside-tap dismissal: decisions stay explicit. */
export function Modal({ title, children }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0" style={{ background: 'rgba(20, 12, 5, 0.45)' }} />
      <div
        className="relative w-full max-w-sm rounded-2xl border-2 p-4"
        style={{
          background: 'var(--surface-2)',
          borderColor: 'var(--parchment-line)',
          boxShadow: 'var(--shadow)',
        }}
      >
        <p className="m-0 mb-3 text-center text-sm font-bold">{title}</p>
        {children}
      </div>
    </div>
  )
}
