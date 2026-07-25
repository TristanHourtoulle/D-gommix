import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { OnboardingForm } from './onboarding-form'

export default async function OnboardingPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.user.username) redirect('/')
  return <OnboardingForm />
}
