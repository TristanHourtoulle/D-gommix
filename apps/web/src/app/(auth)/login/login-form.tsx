'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { z } from 'zod'
import { authClient } from '@/lib/auth-client'
import { Field } from '@/components/ui/field'

const formSchema = z.object({
  email: z.email('Adresse email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

interface FormErrors {
  email?: string
  password?: string
  global?: string
}

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = formSchema.safeParse({ email, password })
    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      setErrors({
        email: flat.fieldErrors.email?.[0],
        password: flat.fieldErrors.password?.[0],
      })
      return
    }
    setErrors({})
    setIsSubmitting(true)
    const { error } = await authClient.signIn.email(parsed.data)
    setIsSubmitting(false)
    if (error) {
      setErrors({ global: 'Email ou mot de passe incorrect' })
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <section className="card flex flex-col gap-4 p-5">
      <h2 className="m-0 text-lg font-extrabold" style={{ fontFamily: 'var(--font-display)' }}>
        Connexion
      </h2>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <Field
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="toi@village.gaulois"
          autoComplete="email"
          error={errors.email}
        />
        <Field
          id="password"
          label="Mot de passe"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          error={errors.password}
        />
        {errors.global ? (
          <p className="field-error m-0" role="alert">
            {errors.global}
          </p>
        ) : null}
        <button className="cta" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
      <p className="m-0 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>
        Pas encore de compte ?{' '}
        <Link className="font-semibold underline" href="/register">
          Créer un compte
        </Link>
      </p>
    </section>
  )
}
