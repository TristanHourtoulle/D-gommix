'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { Field } from '@/components/ui/field'

const usernameSchema = z
  .string()
  .min(1, 'Choisis un pseudo')
  .max(20, '20 caractères maximum')
  .regex(/^[a-zA-Z0-9_.-]+$/, 'Lettres, chiffres, point, tiret et underscore uniquement')

type Availability = 'idle' | 'checking' | 'available' | 'taken'

const availabilityResponseSchema = z.object({ available: z.boolean() })

export function OnboardingForm() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [formatError, setFormatError] = useState<string | null>(null)
  const [availability, setAvailability] = useState<Availability>('idle')
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (username === '') {
      setFormatError(null)
      setAvailability('idle')
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
  }, [username])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = usernameSchema.safeParse(username)
    if (!parsed.success) {
      setFormatError(parsed.error.issues[0]?.message ?? 'Pseudo invalide')
      return
    }
    setGlobalError(null)
    setIsSubmitting(true)
    const response = await fetch('/api/username', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: parsed.data }),
    })
    setIsSubmitting(false)
    if (response.status === 409) {
      setAvailability('taken')
      setGlobalError('Ce pseudo est déjà pris')
      return
    }
    if (!response.ok) {
      setGlobalError('Une erreur est survenue, réessaie')
      return
    }
    router.push('/')
    router.refresh()
  }

  const initial = username.trim().charAt(0).toUpperCase() || '?'

  return (
    <section className="card flex flex-col gap-4 p-5">
      <h2 className="m-0 text-lg font-extrabold" style={{ fontFamily: 'var(--font-display)' }}>
        Choisis ton pseudo
      </h2>
      <div className="flex items-center gap-3">
        <span className="avatar-ring" aria-hidden>
          {initial}
        </span>
        <p className="m-0 text-sm" style={{ color: 'var(--ink-soft)' }}>
          C&apos;est lui que tes amis verront dans les parties.
        </p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <Field
          id="username"
          label="Pseudo"
          value={username}
          onChange={setUsername}
          placeholder="Abraracourcix"
          maxLength={20}
          autoComplete="off"
          error={formatError}
        />
        {formatError === null && availability === 'checking' ? (
          <p className="m-0 text-xs" style={{ color: 'var(--ink-faint)' }}>
            Vérification…
          </p>
        ) : null}
        {formatError === null && availability === 'available' ? (
          <p className="m-0 text-xs font-semibold" style={{ color: 'var(--good)' }}>
            Pseudo disponible
          </p>
        ) : null}
        {formatError === null && availability === 'taken' ? (
          <p className="m-0 text-xs font-semibold" style={{ color: 'var(--bad)' }}>
            Ce pseudo est déjà pris
          </p>
        ) : null}
        {globalError ? (
          <p className="field-error m-0" role="alert">
            {globalError}
          </p>
        ) : null}
        <button
          className="cta"
          type="submit"
          disabled={isSubmitting || availability !== 'available'}
        >
          {isSubmitting ? 'Un instant…' : "C'est parti"}
        </button>
      </form>
    </section>
  )
}
