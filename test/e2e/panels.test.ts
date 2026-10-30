import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { $fetch, createPage, fetch, setup, url } from '@nuxt/test-utils/e2e'
import type { NuxtConfig } from '@nuxt/schema'
import type { BackendAppConfigInput } from '../../src/runtime/config'
import { axeViolations } from './helpers/axe'
import { startConvexStub } from './helpers/convex-stub'
import { prepareExampleApp } from './helpers/example-app'

// Full production build + serve of `templates/panels`, the tutorial's app,
// against a stub deployment, the way starter.test.ts builds the starter: the
// strips page behind sign-in, the public page of a link that no longer
// works, the pricing page with Panels' credit packs, and every page a
// signed-out visitor reaches checked with axe-core in both color schemes.

const rootDir = fileURLToPath(new URL('../../templates/panels', import.meta.url))
const repoDir = fileURLToPath(new URL('../..', import.meta.url))

process.env.NUXT_TELEMETRY_DISABLED ||= '1'

/** The pricing copy: the Studio plan and the 100-credit pack. */
const CATALOG: BackendAppConfigInput = {
  billing: {
    plans: [{ key: 'studio', blurb: 'Your strips start first', highlight: true }],
    packs: [{ key: 'credits100' }],
  },
}

/** Canned `billing:getPricing`: Studio by the month, and the pack. */
const PRICING = {
  plans: [{
    key: 'studio',
    name: 'Studio',
    description: null,
    retired: false,
    features: ['Your strips start drawing first'],
    prices: { month: { productId: 'prod_studio', amount: 1200, currency: 'usd', monthly: 1200, credits: { meter: 'credits', units: 400, rollover: false } } },
  }],
  packs: [{ key: 'credits100', productId: 'prod_credits100', name: '100 credits', description: null, amount: 500, currency: 'usd', credits: { meter: 'credits', units: 100, rollover: true }, isBestValue: false }],
}

const stub = await startConvexStub({
  handlers: {
    'billing:getPricing': () => PRICING,
    'billing:getConfiguredProducts': () => ({ studio: { id: 'prod_studio', name: 'Studio' }, credits100: { id: 'prod_credits100', name: '100 credits' } }),
    'billing:getCredits': () => null,
    // A token that opens nothing: revoked, rotated or never made.
    'strips:shared': () => null,
  },
})
const app = prepareExampleApp(rootDir)
afterAll(async () => {
  await stub.close()
  app.cleanup()
})

const gitStatus = () => execFileSync('git', ['status', '--porcelain', '--', 'templates/panels'], { cwd: repoDir, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
const statusBeforeBuild = gitStatus()

await setup({
  rootDir,
  server: true,
  browser: true,
  setupTimeout: 600_000,
  nuxtConfig: {
    telemetry: false,
    backend: { url: stub.url, devtools: false },
    convex: { siteUrl: stub.url },
    appConfig: { backend: CATALOG } as unknown as NuxtConfig['appConfig'],
  },
})

describe('templates/panels (production build)', { timeout: 60_000 }, () => {
  it('sends a signed-out visitor from the strips to sign in, with the way back', async () => {
    for (const path of ['/strips', '/strips/kd7a', '/notifications']) {
      const response = await fetch(path, { redirect: 'manual' })
      expect(response.status, path).toBe(302)
      const target = new URL(response.headers.get('location')!, url('/'))
      expect(target.pathname).toBe('/login')
      expect(target.searchParams.get('redirect')).toBe(path)
    }
  })

  it('says a share link that opens nothing no longer works, and keeps the page out of search', async () => {
    const html = await $fetch<string>('/s/not-a-token')
    expect(html).toContain('This link no longer works. Ask the author for a new one.')
    expect(html).toContain('<meta name="robots" content="noindex">')
    expect(html).toContain('<meta name="referrer" content="no-referrer">')
    // Read on the server, over one HTTP query.
    expect(stub.calls).toContainEqual(expect.objectContaining({ path: 'strips:shared', args: { token: 'not-a-token' }, transport: 'http' }))
  })

  it('renders the pricing page with Panels\' plan and pack', async () => {
    const html = await $fetch<string>('/pricing')
    expect(html).toContain('data-pricing="plan"')
    expect(html).toContain('Studio')
    expect(html).toContain('100 credits')
  })

  it('renders the landing page, which links to the strips by name', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('<h1>Panels</h1>')
    expect(html).toContain('href="/strips"')
  })

  it('writes nothing into the template', () => {
    expect(gitStatus()).toEqual(statusBeforeBuild)
  })
})

/** Every page a signed-out visitor reaches, and what shows once it is there. */
const AXE_STEPS = [
  { name: '/', path: '/', ready: 'h1' },
  { name: '/s/[token], a link that no longer works', path: '/s/not-a-token', ready: 'text=This link no longer works' },
  { name: '/pricing', path: '/pricing', ready: '[data-pricing="plan"]' },
  { name: '/login', path: '/login', ready: '[data-auth="step-choose"]' },
]

describe('templates/panels, checked by axe-core (WCAG 2.2 A and AA)', { timeout: 90_000 }, () => {
  const runs = AXE_STEPS.flatMap(step => (['light', 'dark'] as const).map(scheme => ({ ...step, scheme })))

  it.each(runs)('$name, $scheme', async ({ path, ready, scheme }) => {
    const page = await createPage()
    try {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.goto(url(path), { waitUntil: 'hydration' })
      await page.waitForSelector(ready, { timeout: 15_000 })
      expect(await axeViolations(page)).toEqual([])
    }
    finally {
      await page.close()
    }
  })
})
