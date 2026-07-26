'use client'

import { Button } from '@/components/ui/button'
import { Sheet } from './overlay'
import { TAUNTS, type TauntId } from './taunts'

interface TauntPickerProps {
  targetName: string
  onPick: (tauntId: TauntId) => void
  onClose: () => void
}

/** « Balance une vanne » — 8 fixed lines, one tap, then the sheet closes. */
export function TauntPicker({ targetName, onPick, onClose }: TauntPickerProps) {
  return (
    <Sheet title={`Balance une vanne à ${targetName}`} onClose={onClose}>
      <div className="flex flex-col gap-2">
        {TAUNTS.map((taunt) => (
          <button
            key={taunt.id}
            type="button"
            onClick={() => onPick(taunt.id)}
            className="flex cursor-pointer items-center gap-2 rounded-xl border-2 p-2 text-sm font-bold"
            style={{
              borderColor: 'var(--parchment-line)',
              background: 'var(--surface)',
              color: 'var(--ink)',
            }}
          >
            {taunt.text}
          </button>
        ))}
        <Button variant="ghost" onClick={onClose}>
          Retour
        </Button>
      </div>
    </Sheet>
  )
}
