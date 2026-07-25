'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

const usernameSchema = z
  .string()
  .min(1, 'Choisis un pseudo')
  .max(20, '20 caractères maximum')
  .regex(/^[a-zA-Z0-9_.-]+$/, 'Lettres, chiffres, point, tiret et underscore uniquement')

const availabilityResponseSchema = z.object({ available: z.boolean() })

type Availability = 'idle' | 'unchanged' | 'checking' | 'available' | 'taken'

interface UsernameFormProps {
  currentUsername: string
}

function isSameUsername(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** Pseudo editor: live availability check then save through POST /api/username. */
export function UsernameForm({ currentUsername }: UsernameFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [savedUsername, setSavedUsername] = useState(currentUsername)
  const [username, setUsername] = useState(currentUsername)
  const [formatError, setFormatError] = useState<string | null>(null)
  const [availability, setAvailability] = useState<Availability>('unchanged')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (username === '') {
      setFormatError(null)
      setAvailability('idle')
      return
    }
    if (isSameUsername(username, savedUsername)) {
      setFormatError(null)
      setAvailability('unchanged')
      return
    }
    const parsed = usernameSchema.safeParse(username)
    if (!parsed.success) {
      setFormatError(parsed.error.issues[0]?.message ?? 'Pseudo invalide')
      setAvailability('idle')
      return
    }
    setFormatError(null)
    setAvailability('checking')
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/username/check?u=${encodeURIComponent(username)}`,
          { signal: controller.signal }
        )
        const data = availabilityResponseSchema.parse(await response.json())
        setAvailability(data.available ? 'available' : 'taken')
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setAvailability('idle')
      }
    }, 300)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [username, savedUsername])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = usernameSchema.safeParse(username)
    if (!parsed.success) {
      setFormatError(parsed.error.issues[0]?.message ?? 'Pseudo invalide')
      return
    }
    setIsSaving(true)
    const response = await fetch('/api/username', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: parsed.data }),
    })
    setIsSaving(false)
    if (response.status === 409) {
      setAvailability('taken')
      toast('Ce pseudo est déjà pris', 'error')
      return
    }
    if (!response.ok) {
      toast('Impossible de changer ton pseudo, réessaie', 'error')
      return
    }
    setSavedUsername(parsed.data)
    setAvailability('unchanged')
    toast('Pseudo mis à jour')
    router.refresh()
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
      <Field
        id="profile-username"
        label="Pseudo"
        value={username}
        onChange={setUsername}
        placeholder="Abraracourcix"
        maxLength={20}
        autoComplete="off"
        error={formatError}
      />
      {formatError === null ? <AvailabilityHint availability={availability} /> : null}
      <Button type="submit" disabled={isSaving || availability !== 'available'}>
        {isSaving ? 'Un instant…' : 'Enregistrer'}
      </Button>
    </form>
  )
}

function AvailabilityHint({ availability }: { availability: Availability }) {
  if (availability === 'checking') {
    return (
      <p className="m-0 text-xs" style={{ color: 'var(--ink-faint)' }}>
        Vérification…
      </p>
    )
  }
  if (availability === 'unchanged') {
    return (
      <p className="m-0 text-xs" style={{ color: 'var(--ink-faint)' }}>
        C&apos;est ton pseudo actuel.
      </p>
    )
  }
  if (availability === 'available') {
    return (
      <p className="m-0 text-xs font-semibold" style={{ color: 'var(--good)' }}>
        Pseudo disponible
      </p>
    )
  }
  if (availability === 'taken') {
    return (
      <p className="m-0 text-xs font-semibold" style={{ color: 'var(--bad)' }}>
        Ce pseudo est déjà pris
      </p>
    )
  }
  return null
}
