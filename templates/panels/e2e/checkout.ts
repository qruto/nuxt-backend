import { expect, type Page } from '@playwright/test'

/**
 * Pays on Polar's sandbox checkout with its test card: 4242 4242 4242 4242,
 * any future expiry and any CVC. Polar owns the page, and its fields can
 * change between its releases: this one helper follows them.
 */
export async function payWithTestCard(page: Page) {
  await page.waitForURL(/sandbox\.polar\.sh/)
  // The card fields sit in the payment processor's frame.
  const card = page.frameLocator('iframe[title*="payment"]').first()
  await card.getByLabel('Card number').fill('4242 4242 4242 4242')
  await card.getByLabel(/Expiration/).fill('12 / 34')
  await card.getByLabel('Security code').fill('123')
  await page.getByRole('button', { name: /^(Pay|Subscribe)/ }).click()
  // Back in the app once the payment went through.
  await page.waitForURL(/localhost:3000/, { timeout: 60_000 })
  await expect(page).not.toHaveURL(/polar\.sh/)
}
