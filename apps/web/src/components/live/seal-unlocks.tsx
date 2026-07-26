'use client'

import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SealMedallion } from '@/components/ui/seal-medallion'
import { sealsPayloadSchema, type SealsPayload } from '@/lib/api-payloads'
import { sealMeta } from '@/lib/seals'

/**
 * « Sceau débloqué » block of the Banquet. Reads the seals this viewer FIRST
 * earned in this game over HTTP rather than over the socket: the ws-server
 * commits the seal rows in the same transaction as the END_VALIDATED event and
 * only emits `game:event` after that commit (apps/ws-server/src/game-manager.ts
 * `persist`), so a fetch triggered by the finished state can never race the
 * write — and unlike a one-shot socket push, it still works on reload, on a
 * second device, and after a background restore.
 *
 * Renders nothing when the game unlocked nothing, which is the common case.
 */
export function SealUnlocks({ gameId }: { gameId: string }) {
  const { data } = useQuery({
    // Not in `@/lib/query-keys`: that module holds the tab data endpoints, and
    // this one is game-scoped and never invalidated — a game's seal set is
    // immutable once written.
    queryKey: ['seals', gameId],
    queryFn: async (): Promise<SealsPayload> => {
      const response = await fetch(`/api/seals?gameId=${gameId}`, { credentials: 'same-origin' })
      if (!response.ok) throw new Error(`/api/seals failed (${response.status})`)
      return sealsPayloadSchema.parse(await response.json())
    },
    staleTime: Infinity,
  })

  // Loading, error and "nothing unlocked" all render nothing: a failed fetch
  // must never break the Banquet.
  const seals = data?.seals ?? []
  if (seals.length === 0) return null

  return (
    <section
      className="card relative flex flex-col gap-3 p-4"
      style={{ borderColor: 'var(--bronze)' }}
      data-testid="seal-unlocks"
    >
      <p className="sec-label m-0">{seals.length > 1 ? 'Sceaux débloqués' : 'Sceau débloqué'}</p>
      {seals.map((seal, index) => {
        const meta = sealMeta(seal.sealId)
        if (!meta) return null
        return (
          <div
            key={seal.sealId}
            className="seal-reveal flex items-center gap-3"
            style={{ '--i': index } as CSSProperties}
          >
            <SealMedallion sealId={seal.sealId} size={56} />
            <div className="min-w-0">
              <p className="m-0 font-bold">{meta.label}</p>
              <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
                {meta.hint}
              </p>
            </div>
          </div>
        )
      })}
    </section>
  )
}
