import { Simulator } from './simulator'

export const metadata = { title: 'Dégommix — Simulation' }

/**
 * Fake-game simulator, reached from the hidden dev menu (`/dev/animations`).
 * Outside the `(tabs)` group on purpose: no tab bar. No session check and no
 * env gate — it renders a locally generated game and never talks to the server
 * (see `plans/038-simulateur-de-partie.md`).
 */
export default function DevSimulationPage() {
  return <Simulator />
}
