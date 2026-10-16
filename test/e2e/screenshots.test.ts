import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { createPage, setup, url } from '@nuxt/test-utils/e2e'
import type { NuxtConfig } from '@nuxt/schema'
import { BACKEND_PAGE_DEFS, resolvedBackendPages } from '../../src/pages'
import type { BackendAppConfigInput } from '../../src/runtime/config'
import { startConvexStub } from './helpers/convex-stub'
import { prepareExampleApp } from './helpers/example-app'

// Every page the module mounts, photographed: the production build of
// `templates/starter` against a stub deployment, signed in for the pages
// behind the auth middleware, at a phone and a desktop width, in the light
// and the dark scheme. The screenshots land in `.qa/module-pages/` (CI uploads them
// as the `module-page-screenshots` artifact), so a pull request that changes
// how a packaged page looks can be compared with main by eye.
//
// `pnpm qa:screenshots` runs this file alone.

const rootDir = fileURLToPath(new URL('../../templates/starter', import.meta.url))
const outDir = fileURLToPath(new URL('../../.qa/module-pages/', import.meta.url))

process.env.NUXT_TELEMETRY_DISABLED ||= '1'

const WIDTHS = [390, 1280] as const
const SCHEMES = ['light', 'dark'] as const

const USER = { id: 'user_ada', name: 'Ada Lovelace', email: 'ada@example.com', emailVerified: true, image: null, role: 'user', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
const SESSION = { id: 'session_1', userId: USER.id, token: 'session-token', expiresAt: '2099-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', userAgent: 'Mozilla/5.0 (Macintosh) Chrome/140', activeOrganizationId: 'org_acme' }
const WORKSPACE = { id: 'org_acme', name: 'Acme', slug: 'acme', createdAt: '2026-01-01T00:00:00.000Z', members: [{ id: 'member_1', userId: USER.id, organizationId: 'org_acme', role: 'owner', user: USER }], invitations: [] }

/** An unsigned JWT the Convex client can read the expiry of; the stub accepts any token. */
function convexToken(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: USER.id, iss: 'stub', aud: 'convex', exp: Math.floor(Date.now() / 1000) + 3600 })}.`
}

const CATALOG: BackendAppConfigInput = {
  billing: {
    plans: [{ key: 'pro', credits: 500, blurb: 'Everything, monthly', highlight: true }],
    packs: [{ key: 'credits500', credits: 500 }],
  },
}

const stub = await startConvexStub({
  handlers: {
    'auth:getAuthUser': () => USER,
    'auth:listWorkspaces': () => [{ id: WORKSPACE.id, name: WORKSPACE.name, slug: WORKSPACE.slug, role: 'owner', active: true }],
    'auth:listWorkspaceMembers': () => WORKSPACE.members,
    'auth:listSessions': () => [{ id: SESSION.id, userAgent: SESSION.userAgent, createdAt: Date.parse(SESSION.createdAt), updatedAt: Date.parse(SESSION.updatedAt), expiresAt: Date.parse(SESSION.expiresAt), current: true }],
    'billing:getConfiguredProducts': () => ({
      pro: { id: 'prod_pro', name: 'Pro plan', prices: [{ priceAmount: 2900, priceCurrency: 'usd' }] },
      credits500: { id: 'prod_credits500', name: '500 credits', prices: [{ priceAmount: 2000, priceCurrency: 'usd' }] },
    }),
    'billing:getCurrentSubscription': () => null,
    'billing:listAllSubscriptions': () => [],
    'billing:getCredits': () => ({ meters: [{ key: 'credits', name: 'credits', balance: 120, creditedUnits: 500, consumedUnits: 380 }] }),
    'billing:getFeatures': () => ({ features: [] }),
    'billing:getReceivedGifts': () => [],
    // Anything else a page subscribes to answers empty rather than failing.
    '*': () => null,
  },
})

/** The login page is shown signed out (signed in, it sends the visitor on); every other page signed in. */
let signedIn = true

stub
  .route('GET /api/auth/get-session', () => ({ body: signedIn ? { session: SESSION, user: USER } : null }))
  .route('GET /api/auth/convex/token', () => ({ body: { token: signedIn ? convexToken() : null } }))
  .route('GET /api/auth/organization/list', () => ({ body: [WORKSPACE] }))
  .route('GET /api/auth/organization/get-full-organization', () => ({ body: WORKSPACE }))
  .route('GET /api/auth/passkey/list-user-passkeys', () => ({ body: [] }))
  .route('GET /api/auth/list-sessions', () => ({ body: [SESSION] }))
  .route('GET /api/auth/organization/get-invitation', () => ({ body: { id: 'inv_1', organizationName: 'Acme', inviterEmail: 'grace@example.com', role: 'member', status: 'pending' } }))
  // The agent consent page reads the request the server stored for it.
  .route('POST /api/auth/agent-consent/request', () => ({ body: { clientId: 'client_claude', clientName: 'Claude Code', redirectHost: 'localhost:33418', scopes: ['openid', 'profile', 'email', 'billing:read', 'workspace:read'], expiresAt: Date.now() + 600_000 } }))

const app = prepareExampleApp(rootDir)

afterAll(async () => {
  await stub.close()
  app.cleanup()
})

await setup({
  rootDir,
  server: true,
  browser: true,
  setupTimeout: 600_000,
  nuxtConfig: {
    telemetry: false,
    backend: { url: stub.url, siteUrl: stub.url, autoEnv: false, scaffold: false, devtools: false },
    appConfig: { backend: CATALOG } as unknown as NuxtConfig['appConfig'],
  },
})

const pages = resolvedBackendPages(undefined)

/** What each page renders once its data arrived: a component that failed renders its title alone. */
const READY: Record<string, string> = {
  login: '[data-auth="form"]',
  pricing: '[data-pricing="plan"]',
  settings: '[data-settings="section-credits"]',
  profile: '[data-profile="root"]',
  security: '[data-security="session"]',
  acceptInvitation: '[data-invitation="ready"]',
  agentConsent: '[data-consent="ready"]',
}
const shots = BACKEND_PAGE_DEFS.flatMap(def => WIDTHS.flatMap(width => SCHEMES.map(scheme => ({ key: def.key, path: pages[def.key], width, scheme }))))

describe('module pages, photographed', { timeout: 120_000 }, () => {
  mkdirSync(outDir, { recursive: true })

  it.each(shots)('$key at $width px, $scheme', async ({ key, path, width, scheme }) => {
    signedIn = key !== 'login'
    const page = await createPage()
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    const query = key === 'acceptInvitation' ? '?id=inv_1' : ''
    const response = await page.goto(url(`${path}${query}`), { waitUntil: 'hydration' })
    // Nothing redirects: the protected pages see a session, the login page none.
    expect(new URL(page.url()).pathname, `${key} redirected`).toBe(path)
    expect(response?.status(), key).toBeLessThan(500)
    await page.waitForSelector(READY[key] ?? 'main', { timeout: 15_000 })
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: `${outDir}${key}-${width}-${scheme}.png`, fullPage: true })
    await page.close()
  })
})
