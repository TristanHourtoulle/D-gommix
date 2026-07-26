import { requireOnboardedSession } from '@/lib/session'
import { getAlmanach } from '@/lib/queries/almanach'
import {
  formatFrenchDecimal,
  formatFrenchNumber,
  formatTableTime,
  METERS_PER_MENHIR,
  METERS_PER_PAS,
  PAS_PER_DEGOMMAGE,
} from '@/lib/almanach'
import { CHARACTER_META } from '@/lib/characters'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionTitle } from '@/components/ui/section-title'
import { AlmanachCard, type AlmanachRow } from '@/components/stats/almanach-card'

export const dynamic = 'force-dynamic'

/** How many players each ranking card lists under its hero figure. */
const RANKING_LIMIT = 6

/**
 * The pas-to-metre constant, printed in full. `formatFrenchDecimal` keeps a
 * single decimal (it exists for the dégommages-per-minute rate) and would
 * round 0.75 to « 0,8 », which makes the derivation stop reproducing its own
 * result — the one thing plan 036 decision 2 forbids.
 */
const METERS_PER_PAS_LABEL = METERS_PER_PAS.toLocaleString('fr-FR')

/**
 * « L'Almanach » — five circle-scoped, all-time statistics in absurd units,
 * every one of them arithmetic on real rows (plan 036). Reached from the
 * Lauriers screen through the « Tout voir » idiom; like /parties it is not a
 * tab-bar destination, so a plain force-dynamic server render (no TanStack
 * cache) keeps it consistent with its neighbors. Rendering server-side also
 * keeps every `Intl` call off the client, so no hydration mismatch is possible.
 */
export default async function AlmanachPage() {
  const { user } = await requireOnboardedSession()
  const almanach = await getAlmanach(user.id)

  const isEmpty =
    almanach.distance === null &&
    almanach.tableTime === null &&
    almanach.carnage === null &&
    almanach.fidelity.length === 0 &&
    almanach.badFaith.length === 0

  if (isEmpty) {
    return (
      <main className="tab-page">
        <SectionTitle sub="Registre officiel du village">L&apos;Almanach</SectionTitle>
        <EmptyState
          icon="trophy"
          title="Registre vierge"
          description="Le druide attend vos premières parties pour homologuer quoi que ce soit."
        />
      </main>
    )
  }

  const topFidelity = almanach.fidelity[0]
  const fidelityRows: AlmanachRow[] = almanach.fidelity.slice(1, RANKING_LIMIT).map((row) => ({
    label: `${row.username} — ${CHARACTER_META[row.character].label}`,
    value: `${row.share} %`,
  }))

  const topBadFaith = almanach.badFaith[0]
  const badFaithRows: AlmanachRow[] = almanach.badFaith.slice(1, RANKING_LIMIT).map((row) => ({
    label: row.username,
    value: `${row.index} %`,
  }))

  return (
    <main className="tab-page">
      <SectionTitle sub="Registre officiel du village">L&apos;Almanach</SectionTitle>

      <AlmanachCard
        testId="almanach-distance"
        icon="pawn"
        title="Distance de pions renvoyés"
        value={almanach.distance === null ? null : formatFrenchNumber(almanach.distance.menhirs)}
        unit="menhirs"
        derivation={
          almanach.distance === null
            ? undefined
            : `${formatFrenchNumber(almanach.distance.degommages)} dégommages × ${PAS_PER_DEGOMMAGE} pas gaulois × ${METERS_PER_PAS_LABEL} m, divisés par ${METERS_PER_MENHIR} m de menhir couché — soit ${formatFrenchNumber(almanach.distance.meters)} m de retraite romaine`
        }
      />

      <AlmanachCard
        testId="almanach-table-time"
        icon="timer"
        title="Temps passé à table"
        value={almanach.tableTime === null ? null : formatTableTime(almanach.tableTime.seconds)}
        derivation={
          almanach.tableTime === null
            ? undefined
            : `Somme des durées de ${formatFrenchNumber(almanach.tableTime.games)} parties terminées, abandons compris ; les parties clôturées automatiquement après 24 h sont écartées, le druide refuse de compter le sommeil`
        }
      />

      <AlmanachCard
        testId="almanach-carnage"
        icon="sword"
        title="Rythme du carnage"
        value={almanach.carnage === null ? null : formatFrenchDecimal(almanach.carnage.perMinute)}
        unit="dégommages / minute"
        derivation={
          almanach.carnage === null
            ? undefined
            : `Record sur une seule partie : ${formatFrenchNumber(almanach.carnage.degommages)} dégommages en ${formatTableTime(almanach.carnage.durationSec)} ; seules les parties d'au moins deux minutes concourent, une bagarre de trois secondes n'est pas un rythme`
        }
      />

      <AlmanachCard
        testId="almanach-fidelity"
        icon="users"
        title="Fidélité au camp"
        value={topFidelity === undefined ? null : `${topFidelity.share} %`}
        derivation={
          topFidelity === undefined
            ? undefined
            : `${topFidelity.username} a tenu ${CHARACTER_META[topFidelity.character].label} sur ${formatFrenchNumber(topFidelity.played)} de ses ${formatFrenchNumber(topFidelity.totalPlayed)} parties`
        }
        rows={fidelityRows}
      />

      <AlmanachCard
        testId="almanach-bad-faith"
        icon="undo"
        title="Indice de mauvaise foi"
        value={topBadFaith === undefined ? null : `${topBadFaith.index} %`}
        derivation={
          topBadFaith === undefined
            ? undefined
            : `${topBadFaith.username} a réclamé ${formatFrenchNumber(topBadFaith.undos)} annulations pour ${formatFrenchNumber(topBadFaith.taken)} pions perdus`
        }
        rows={badFaithRows}
      />

      <p className="helper-text">* Calculs homologués par le druide.</p>
    </main>
  )
}
