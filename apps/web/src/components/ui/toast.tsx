'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  addToast,
  nextToastDeadline,
  sweepToasts,
  type ToastItem,
  type ToastVariant,
} from './toast-stack'

export type { ToastVariant }

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

interface ToastProviderProps {
  children: ReactNode
}

/**
 * App toaster: a pile of at most three pills above the tab bar, newest on top,
 * auto-dismissed after 4s. The pile lives in a fixed overlay, so it never shifts
 * the page, and every card enters and leaves on transform/opacity only.
 *
 * Mounted exactly once, in the root layout, so the queue is never thrown away
 * by a client-side navigation that crosses a route-group boundary.
 *
 * A single timer drives the whole pile — armed on the nearest deadline and
 * re-armed after each sweep — instead of one `setTimeout` per toast: the
 * lifetime then lives in the state (`expiresAt`), which is what lets a repeated
 * message renew its card instead of stacking a duplicate, and what lets an
 * evicted card play its exit animation. See `toast-stack.ts` for the rules.
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [stack, setStack] = useState<readonly ToastItem[]>([])
  const nextId = useRef(0)

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = nextId.current++
    const now = Date.now()
    setStack((current) => addToast(current, { id, message, variant }, now))
  }, [])

  useEffect(() => {
    const deadline = nextToastDeadline(stack)
    if (deadline === null) return

    const timer = setTimeout(
      () => setStack((current) => sweepToasts(current, Date.now())),
      Math.max(0, deadline - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [stack])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="toast-zone">
        {stack.map((item) => (
          <div
            key={item.id}
            className="toast-slot"
            data-leaving={item.leavingAt === null ? undefined : ''}
          >
            <div
              role="status"
              className="toast-card max-w-sm rounded-full border px-4 py-2 text-sm font-medium"
              style={{
                background: 'var(--surface-2)',
                borderColor: item.variant === 'error' ? 'var(--bad)' : 'var(--parchment-line)',
                color: item.variant === 'error' ? 'var(--bad)' : 'var(--ink)',
                boxShadow: 'var(--shadow)',
              }}
            >
              {item.message}
            </div>
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
