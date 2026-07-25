'use client'

import { Icon } from '@/components/icons'
import { CodeBoxes } from '@/components/ui/code-boxes'
import { useToast } from '@/components/ui/toast'

interface CodeDisplayProps {
  code: string
}

/** Large shareable game code with a copy-to-clipboard button. */
export function CodeDisplay({ code }: CodeDisplayProps) {
  const { toast } = useToast()

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code)
      toast('Code copié !')
    } catch {
      toast('Impossible de copier le code', 'error')
    }
  }

  return (
    <div className="flex items-center justify-center gap-2">
      <CodeBoxes code={code} />
      <button
        type="button"
        aria-label="Copier le code"
        onClick={() => void copy()}
        className="flex h-[46px] w-[38px] items-center justify-center rounded-[9px]"
        style={{
          border: '1.5px solid var(--parchment-line)',
          background: 'var(--surface-2)',
          color: 'var(--bronze-strong)',
        }}
      >
        <Icon name="copy" size={17} />
      </button>
    </div>
  )
}
