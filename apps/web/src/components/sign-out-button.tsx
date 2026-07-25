'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'

export function SignOutButton() {
  const router = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleSignOut() {
    setIsSigningOut(true)
    await authClient.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button className="cta ghost" type="button" onClick={handleSignOut} disabled={isSigningOut}>
      {isSigningOut ? 'Déconnexion…' : 'Se déconnecter'}
    </button>
  )
}
