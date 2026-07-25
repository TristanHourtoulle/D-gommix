import { Playground } from './playground'

export const metadata = { title: 'Dégommix — Animations' }

/**
 * Hidden animations playground, reached by long-pressing the avatar block of
 * /profil. Outside the `(tabs)` group on purpose: no tab bar. No session check
 * and no env gate — it renders nothing but mock data (see
 * `plans/014-dev-animations-menu.md`).
 */
export default function DevAnimationsPage() {
  return <Playground />
}
