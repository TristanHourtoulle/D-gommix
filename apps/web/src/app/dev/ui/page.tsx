import { notFound } from 'next/navigation'
import { Styleguide } from './styleguide'

export const metadata = { title: 'Dégommix — Styleguide' }

/**
 * Internal design-system showcase. Hidden in production unless
 * ALLOW_DEV_UI=1 is set (used for visual QA against a production build).
 */
export default function DevUiPage() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_UI !== '1') {
    notFound()
  }

  return <Styleguide />
}
