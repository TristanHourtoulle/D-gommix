import { expect, test, type BrowserContext } from '@playwright/test'
import { expectCounter, registerAndOnboard, shot } from './helpers'

const PASSWORD = 'motdepasse-123'
const J1 = { email: 'j1@degommix.test', username: 'Asterix' }
const J2 = { email: 'j2@degommix.test', username: 'Obelix' }

test('two-player 1v1 happy path (design §7.3)', async ({ browser }) => {
  let c1: BrowserContext | undefined
  let c2: BrowserContext | undefined
  try {
    c1 = await browser.newContext()
    c2 = await browser.newContext()
    const p1 = await c1.newPage()
    const p2 = await c2.newPage()

    // — Step 1: registration + pseudo onboarding —
    await p1.goto('/login')
    await shot(p1, '01-login')
    await p1.goto('/register')
    await p1.locator('#email').fill(J1.email)
    await p1.locator('#password').fill(PASSWORD)
    await shot(p1, '02-register')
    await p1.getByRole('button', { name: 'Créer mon compte' }).click()
    await p1.waitForURL('**/onboarding')
    await p1.locator('#username').fill(J1.username)
    await expect(p1.getByText('Pseudo disponible')).toBeVisible()
    await shot(p1, '03-onboarding')
    await p1.getByRole('button', { name: "C'est parti" }).click()
    await p1.waitForURL((url) => url.pathname === '/')

    await registerAndOnboard(p2, J2.email, PASSWORD, J2.username)

    // — Step 2: friend request J1 → J2, accepted by J2 —
    await p1.goto('/amis')
    await p1.getByLabel('Chercher un pseudo').fill(J2.username)
    await p1.getByRole('button', { name: 'Demander en ami' }).click()
    await expect(p1.getByText('Demande en attente')).toBeVisible()

    await p2.goto('/amis')
    await expect(p2.getByText('Demandes reçues')).toBeVisible()
    await shot(p2, '04-amis-pending')
    await p2.getByRole('button', { name: `Accepter la demande de ${J1.username}` }).click()
    await expect(p2.getByText(J1.username)).toBeVisible()

    // J1's list refreshes via friends:event.
    await expect(p1.getByRole('link', { name: new RegExp(J2.username) })).toBeVisible()

    // Presence round-trip: force offline → online so the upcoming invite is
    // guaranteed to reach the socket of the page J2 is currently on.
    await p2.goto('about:blank')
    await expect(p1.getByText('hors ligne')).toBeVisible()
    await p2.goto('/')
    await expect(p1.getByText('en ligne', { exact: true })).toBeVisible()
    await shot(p1, '05-amis-friend')

    // — Step 3: J1 creates a 1v1 lobby and invites J2 —
    await p1.goto('/jouer')
    await shot(p1, '06-jouer')
    await p1.getByRole('button', { name: 'Créer la partie' }).click()
    await p1.waitForURL(/\/lobby\//)
    const gameId = new URL(p1.url()).pathname.split('/').pop()
    if (!gameId) throw new Error('missing lobby gameId')

    await p1.getByRole('button', { name: 'Inviter' }).click()

    await expect(p2.getByText(`${J1.username} t’invite`)).toBeVisible()
    await shot(p2, '07-accueil-invite')
    await p2.getByRole('button', { name: 'Rejoindre' }).click()
    await p2.waitForURL(`**/lobby/${gameId}`)

    // — Step 4: character picks, then J1 starts —
    await p1.getByRole('button', { name: 'Astérix', exact: true }).click()
    await expect(p2.getByRole('button', { name: `Astérix, pris par ${J1.username}` })).toBeVisible()
    await p2.getByRole('button', { name: 'Obélix', exact: true }).click()
    await expect(p1.getByRole('button', { name: `Obélix, pris par ${J2.username}` })).toBeVisible()
    await shot(p1, '08-lobby')

    await p1.getByRole('button', { name: 'Lancer la partie' }).click()
    await p1.waitForURL(`**/partie/${gameId}`)
    await p2.waitForURL(`**/partie/${gameId}`)

    // Tab bar hidden, chrono running on both screens.
    await expect(p1.locator('.tabbar')).toHaveCount(0)
    await expect(p2.locator('.tabbar')).toHaveCount(0)
    await expect(p1.getByTestId('game-clock')).toHaveText(/\d+:\d{2}/)
    await expect(p2.getByTestId('game-clock')).toHaveText(/\d+:\d{2}/)

    // — Step 5: J1 logs two degommages, counters update on J2's screen —
    const tapTarget = p1.getByTestId('tap-zone').getByRole('button', { name: /Obelix/ })
    await tapTarget.click()
    await expectCounter(p1, J1.username, 1)
    await tapTarget.click()
    await expectCounter(p2, J1.username, 2)
    await expectCounter(p2, J2.username, 0)
    await shot(p1, '09-live')
    await p1.emulateMedia({ colorScheme: 'dark' })
    await shot(p1, '10-live-dark')
    await p1.emulateMedia({ colorScheme: 'light' })

    // — Step 6: J2 undoes the last degommage —
    await p2.getByRole('button', { name: 'Annuler la dernière action' }).click()
    await expect(p1.getByText(new RegExp(`${J2.username} a annulé`))).toBeVisible()
    await expect(p2.getByText(new RegExp(`${J2.username} a annulé`))).toBeVisible()
    await expectCounter(p1, J1.username, 1)
    await expectCounter(p2, J1.username, 1)

    // — Step 7: J2 requests village (designating self), J1 validates —
    await p2.getByRole('button', { name: 'Fin de partie' }).click()
    await shot(p2, '11-end-sheet')
    await p2.getByRole('button', { name: 'Village atteint' }).click()
    await p2
      .getByRole('dialog', { name: 'Fin de partie' })
      .getByRole('button', { name: new RegExp(`${J2.username}$`) })
      .click()
    await expect(p2.getByText(`Village atteint par ${J2.username}`)).toBeVisible()
    await p2.getByRole('button', { name: 'Confirmer' }).click()

    const hostModal = p1.getByRole('dialog', { name: 'Demande de fin de partie' })
    await expect(hostModal).toBeVisible()
    await expect(hostModal.getByText(`${J2.username} a atteint le village`)).toBeVisible()
    await shot(p1, '12-host-modal')
    await hostModal.getByRole('button', { name: 'Valider' }).click()

    // — Step 8a: summary on both screens, J2 winner, correct counters —
    await expect(p2.getByText('Résumé de partie')).toBeVisible()
    await expect(p2.getByText('Victoire')).toBeVisible()
    await expect(p2.getByTestId(`summary-row-${J2.username}`)).toContainText('vainqueur')
    await expect(p2.getByTestId(`summary-row-${J1.username}`)).toContainText('1')
    await expect(p1.getByText('Résumé de partie')).toBeVisible()
    await shot(p2, '13-resume')

    // — Step 8b: J1's leaderboard shows J2 ranked with 1 win —
    await p1.goto('/classement')
    await expect(p1.getByTestId(`ranking-row-${J2.username}`)).toContainText('1 v · 100%')
    await expect(p1.getByTestId(`ranking-row-${J1.username}`)).toContainText('0 v')
    await shot(p1, '14-classement')

    // — Step 8c: game detail shows the full journal —
    await p1.goto(`/parties/${gameId}`)
    await expect(
      p1.getByText(`${J1.username} a dégommé ${J2.username}`, { exact: true })
    ).toHaveCount(2)
    // « de Asterix » is elided to « d’Asterix » (see apps/web/src/lib/elision.ts).
    await expect(
      p1.getByText(`${J2.username} a annulé le dégommage d’${J1.username} sur ${J2.username}`)
    ).toBeVisible()
    await expect(p1.getByText(new RegExp(`village atteint par ${J2.username}`))).toBeVisible()
    await shot(p1, '15-detail', true)

    // Accueil with history, light + dark.
    await p1.goto('/')
    await expect(p1.getByText('Historique récent')).toBeVisible()
    await expect(p1.getByText(/1 dégommage/)).toBeVisible()
    await shot(p1, '16-accueil')
    await p1.emulateMedia({ colorScheme: 'dark' })
    await shot(p1, '17-accueil-dark')
  } finally {
    await c1?.close()
    await c2?.close()
  }
})
