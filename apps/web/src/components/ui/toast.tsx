'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type ToastVariant = 'info' | 'error'

interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TOAST_DURATION_MS = 4000

interface ToastProviderProps {
  children: ReactNode
}

/** Minimal app toaster: stacked pills above the tab bar, auto-dismiss 4s. */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = nextId.current++
    setToasts((current) => [...current, { id, message, variant }])
    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, TOAST_DURATION_MS)
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            role="status"
            className="max-w-sm rounded-full border px-4 py-2 text-sm font-medium shadow-lg"
            style={{
              background: 'var(--surface-2)',
              borderColor: item.variant === 'error' ? 'var(--bad)' : 'var(--parchment-line)',
              color: item.variant === 'error' ? 'var(--bad)' : 'var(--ink)',
              boxShadow: 'var(--shadow)',
            }}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** Fire-and-forget toasts. Must be used inside a `ToastProvider`. */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within a ToastProvider')
  return context
}
