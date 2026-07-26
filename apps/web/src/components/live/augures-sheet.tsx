'use client'

import { Button } from '@/components/ui/button'
import { useElapsedSeconds } from '@/hooks/use-chrono'
import type { AuguresState } from '@/lib/augures'
import { AuguresPanel } from './augures-panel'
import { Sheet } from './overlay'
import type { NameMap } from './types'

interface AuguresSheetProps {
  state: AuguresState
  /** ISO GAME_STARTED timestamp from `useGame`. */
  startedAt: string | null
  serverOffset: number
  names: NameMap
  onClose: () => void
}

/**
 * « Tableau des augures » — the live reading of the game in progress, over the
 * app's standard bottom sheet. Everything shown is derived from the replicated
 * `GameState` plus the server-anchored chrono: this component issues no
 * request, stores nothing and mutates nothing (`plans/041-tableau-des-augures.md`).
 */
export function AuguresSheet({ state, startedAt, serverOffset, names, onClose }: AuguresSheetProps) {
  const elapsedSec = useElapsedSeconds(startedAt, serverOffset) ?? 0
  return (
    <Sheet title="Tableau des augures" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <AuguresPanel state={state} elapsedSec={elapsedSec} names={names} />
        <Button variant="ghost" onClick={onClose}>
          Retour
        </Button>
      </div>
    </Sheet>
  )
}
