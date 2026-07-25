import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, type Page } from '@playwright/test'

const SCREENSHOT_DIR =
  process.env.E2E_SCREENSHOT_DIR ?? fileURLToPath(new URL('./screenshots', import.meta.url))

/** Saves a named viewport screenshot into the QA directory. */
export async function shot(page: Page, name: string, fullPage = false): Promise<void> {
  await mkdir(SCREENSHOT_DIR, { recursive: true })
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage })
}

/** Registers an account (email + password) then completes the pseudo onboarding. */
export async function registerAndOnboard(
  page: Page,
  email: string,
  password: string,
  username: string
): Promise<void> {
  await page.goto('/register')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Créer mon compte' }).click()
  await page.waitForURL('**/onboarding')
  await page.locator('#username').fill(username)
  await expect(page.getByText('Pseudo disponible')).toBeVisible()
  await page.getByRole('button', { name: "C'est parti" }).click()
  await page.waitForURL((url) => url.pathname === '/')
}

/** Asserts the sword tally shown on a player's live roster card. */
export async function expectCounter(page: Page, username: string, count: number): Promise<void> {
  await expect(
    page.getByTestId(`player-card-${username}`).getByTestId('degommage-count')
  ).toHaveText(String(count))
}
