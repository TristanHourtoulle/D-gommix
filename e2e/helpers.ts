import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

const SCREENSHOT_DIR =
  process.env.E2E_SCREENSHOT_DIR ?? fileURLToPath(new URL('./screenshots', import.meta.url))

/**
 * A browser context with the opening sequence already marked as seen. The
 * splash covers the whole viewport for up to 4.6 s on a fresh session, which
 * would swallow the first clicks of every spec. Setting the flag from the test
 * side (rather than adding a `navigator.webdriver` escape hatch to the app)
 * keeps production code free of test-only branches. `storageState` cannot do
 * this: it persists `localStorage` only, never `sessionStorage`.
 */
export async function newAppContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    try {
      // The key is duplicated on purpose: `addInitScript` serialises this
      // function to the browser, so it cannot close over an import, and `e2e/`
      // does not depend on `@degommix/web`. Source of truth:
      // apps/web/src/components/splash/splash-gate.ts (SPLASH_SEEN_KEY).
      window.sessionStorage.setItem('degommix.splash.seen', '1')
    } catch {
      /* storage blocked: the splash is harmless anyway */
    }
  })
  return context
}

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
