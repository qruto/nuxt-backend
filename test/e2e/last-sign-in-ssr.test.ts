import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, createPage, setup, url } from '@nuxt/test-utils/e2e'
import type { Page } from 'playwright-core'
import { LAST_SIGN_IN_COOKIE } from '../../src/convex/constants'

// How this browser last signed in, in a real production build: the server
// render reads the request's cookie and hands it to the browser with the
// page, which hydrates without a mismatch. A page the server did not render
// for this request (here, from Nitro's `swr` cache, which renders without
// anyone's cookie) carries no method, or another visitor's; once hydrated,
// the browser reads its own cookie and follows it.
// test/nuxt/login-flow.test.ts holds the flow's opening step to the same.

const rootDir = fileURLToPath(new URL('../fixtures/last-sign-in-build', import.meta.url))

process.env.NUXT_TELEMETRY_DISABLED ||= '1'

await setup({
  rootDir,
  server: true,
  browser: true,
  // A cold production build; the margin is for slower CI runners.
  setupTimeout: 600_000,
})

const cookie = (method: string) => ({ cookie: `${LAST_SIGN_IN_COOKIE}=${method}` })

/** What the page shows, in the server's markup. */
const shown = (html: string) => /data-last-sign-in[^>]*>([^<]*)</.exec(html)?.[1]?.trim()

/** A browser page whose cookie says how it last signed in, and the hydration complaints it logs. */
async function browserThatSignedInWith(method: string): Promise<{ page: Page, complaints: string[] }> {
  const page = await createPage()
  await page.context().addCookies([{ name: LAST_SIGN_IN_COOKIE, value: method, url: url('/') }])
  const complaints: string[] = []
  page.on('console', (message) => {
    if (/hydrat|mismatch/i.test(message.text())) complaints.push(message.text())
  })
  page.on('pageerror', error => complaints.push(error.message))
  return { page, complaints }
}

describe('the last sign-in method, server-rendered', { timeout: 120_000 }, () => {
  it('renders the request\'s cookie, and only a method the package knows', async () => {
    expect(shown(await $fetch<string>('/', { headers: cookie('email-otp') }))).toBe('email-otp')
    expect(shown(await $fetch<string>('/', { headers: cookie('passkey') }))).toBe('passkey')
    expect(shown(await $fetch<string>('/'))).toBe('none')
    expect(shown(await $fetch<string>('/', { headers: cookie('github') }))).toBe('none')
  })

  it('hydrates a page rendered for this request as it is', async () => {
    const { page, complaints } = await browserThatSignedInWith('passkey')
    await page.goto(url('/'), { waitUntil: 'networkidle' })
    expect((await page.locator('[data-last-sign-in]').textContent())?.trim()).toBe('passkey')
    expect(complaints).toEqual([])
    await page.close()
  })

  it('follows this browser\'s own cookie on a page served from a cache', async () => {
    // The cache serves one render to everyone, made without the cookie.
    expect(shown(await $fetch<string>('/cached', { headers: cookie('email-otp') }))).toBe('none')

    const { page, complaints } = await browserThatSignedInWith('email-otp')
    await page.goto(url('/cached'), { waitUntil: 'networkidle' })
    await expect.poll(async () => (await page.locator('[data-last-sign-in]').textContent())?.trim()).toBe('email-otp')
    expect(complaints).toEqual([])
    await page.close()
  })
})
