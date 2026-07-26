'use client'

import { CrashScreen } from '@/components/error/crash-screen'

export default function SegmentError({ error }: { error: Error & { digest?: string } }) {
  return <CrashScreen error={error} />
}
