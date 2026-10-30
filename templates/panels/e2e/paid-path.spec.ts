import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { payWithTestCard } from './checkout'

// Sign in, buy credits and draw a strip: a real sign-in, a real checkout on
// Polar's sandbox, and a real strip. The code comes from the dev inbox.
const address = `delivered+e2e-${Date.now()}@resend.dev`

/** The latest sign-in code the address received, read from the dev inbox as JSON. */
function latestCode(to: string): string | null {
  return JSON.parse(execFileSync('npx', ['nuxt-backend', 'inbox', to, '--json'], { encoding: 'utf8' })).code
}

test('sign in, buy credits and draw a strip', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Continue with email code' }).click()
  await page.getByLabel('Email').fill(address)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await expect.poll(() => latestCode(address), { timeout: 30_000 }).toBeTruthy()
  await page.getByLabel('Verification code').fill(latestCode(address)!)
  await page.getByRole('button', { name: 'Verify' }).click()
  // The form offers a passkey where the browser supports them.
  await page.getByRole('button', { name: 'Skip for now' }).click({ timeout: 10_000 }).catch(() => {})
  await expect(page).not.toHaveURL(/\/login/)

  await page.goto('/pricing')
  await page.getByRole('article').filter({ hasText: '100 credits' }).getByRole('button', { name: 'Top up' }).click()
  await payWithTestCard(page)
  await expect(page.getByRole('link', { name: /credits$/ })).toContainText('130', { timeout: 30_000 })

  await page.goto('/strips')
  await page.getByLabel('Idea for a new strip').fill('A cat learns to surf')
  await page.getByRole('button', { name: 'Start a strip' }).click()
  await page.getByRole('button', { name: 'Draw this strip for 30 credits' }).click()
  await expect(page.getByText('AI-generated')).toBeVisible({ timeout: 180_000 })
})
