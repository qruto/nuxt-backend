import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { $fetch, createPage, fetch, setup, url } from '@nuxt/test-utils/e2e'
import type { NuxtConfig } from '@nuxt/schema'
import type { Page } from 'playwright-core'
import type { BackendAppConfigInput } from '../../src/runtime/config'
import { startConvexStub } from './helpers/convex-stub'
import { prepareExampleApp } from './helpers/example-app'

// Full production build + serve of `examples/minimal` — the out-of-the-box
// app (`modules: ['nuxt-backend']`, scaffolded backend, no custom code) —
// against a stub deployment: the module's ready-made pages over SSR, the
// auth middleware, the Better Auth proxy, the agent (MCP) surface's OAuth
// gate and discovery documents, the Convex-aware CSP, and a browser leg that
// drives the passwordless sign-in form and a live query through the stub's
// sync WebSocket.

const rootDir = fileURLToPath(new URL('../../examples/minimal', import.meta.url))
const repoDir = fileURLToPath(new URL('../..', import.meta.url))

// Keep Nuxt's telemetry out of the build entirely (it is also disabled via
// config below) — a build must not touch the example app, and the run
// asserts exactly that.
process.env.NUXT_TELEMETRY_DISABLED ||= '1'

/**
 * The pricing catalog (`appConfig.backend.billing`) — names and prices
 * resolve live from `billing:getConfiguredProducts` (canned below).
 */
const CATALOG: BackendAppConfigInput = {
  billing: {
    plans: [{ key: 'pro', credits: 500, blurb: 'Everything, monthly', highlight: true }],
    packs: [{ key: 'credits500', credits: 500 }],
  },
}

/** Canned `billing:getConfiguredProducts` result, keyed like the catalog. */
const PRODUCTS = {
  pro: { id: 'prod_pro', name: 'Pro plan', prices: [{ priceAmount: 2900, priceCurrency: 'usd' }] },
  credits500: { id: 'prod_credits500', name: '500 credits', prices: [{ priceAmount: 2000, priceCurrency: 'usd' }] },
}

const stub = await startConvexStub({
  handlers: {
    'billing:getConfiguredProducts': () => PRODUCTS,
    // `useCredits()` subscribes unconditionally; signed out there is no balance.
    'billing:getCredits': () => null,
  },
})
const app = prepareExampleApp(rootDir)
afterAll(async () => {
  await stub.close()
  app.cleanup()
})

const gitStatus = () => execFileSync('git', ['status', '--porcelain', '--', 'examples/minimal'], { cwd: repoDir, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
// Snapshot before the build so the run can prove it wrote nothing into the app.
const statusBeforeBuild = gitStatus()

await setup({
  rootDir,
  server: true,
  browser: true,
  // The production build takes ~15s here; the margin is for slower CI runners.
  setupTimeout: 600_000,
  nuxtConfig: {
    telemetry: false,
    // Local-checkout artifact, not a consumer concern: `nuxt-convex-module`
    // is a `link:` dependency with its own isolated node_modules, so its
    // runtime resolves a second `better-auth` (and Nitro traces both
    // versions, linking only one at the top level — the server would then
    // miss this module's `better-auth/client/plugins`). Bundling the package
    // into the server build sidesteps the trace; a published install has one
    // `better-auth` and needs nothing here.
    build: { transpile: ['better-auth'] },
    backend: {
      url: stub.url,
      siteUrl: stub.url,
      autoEnv: false,
      scaffold: false,
      devtools: false,
    },
    // Widened through `unknown`: the override is typed as the *resolved* app
    // config, whose empty defaults narrow the catalog arrays to `never[]` —
    // `CATALOG` is checked against the module's input contract instead.
    appConfig: { backend: CATALOG } as unknown as NuxtConfig['appConfig'],
  },
})

const origin = () => new URL(url('/')).origin
const stubHost = new URL(stub.url).host

/**
 * `pageerror` events, error-level console output, and WebSocket failures,
 * collected from page creation on. `frames` keeps the sync traffic for
 * diagnostics.
 */
function collectBrowserErrors(page: Page): { errors: string[], frames: string[] } {
  const errors: string[] = []
  const frames: string[] = []
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
    else frames.push(`console.${message.type()}: ${message.text().slice(0, 200)}`)
  })
  page.on('websocket', (socket) => {
    frames.push(`open ${socket.url()}`)
    socket.on('framesent', frame => frames.push(`→ ${String(frame.payload).slice(0, 200)}`))
    socket.on('framereceived', frame => frames.push(`← ${String(frame.payload).slice(0, 200)}`))
    socket.on('socketerror', error => errors.push(`websocket: ${error}`))
    socket.on('close', () => frames.push('close'))
  })
  return { errors, frames }
}

describe('examples/minimal (production build)', { timeout: 60_000 }, () => {
  it('server-renders the ready-made login page with the passwordless form', async () => {
    const response = await fetch('/login')
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('data-auth="page"')
    expect(html).toContain('data-auth="form"')
    // The first step offers both passwordless routes.
    expect(html).toContain('data-auth="passkey-sign-in"')
    expect(html).toContain('data-auth="otp-start"')
  })

  it('server-renders the pricing page from the catalog; products arrive live after hydration', async () => {
    const html = await $fetch<string>('/pricing')
    expect(html).toContain('data-pricing="page"')
    expect(html).toContain('data-pricing="table"')
    expect(html).toContain('data-pricing="header"')
    // Live queries subscribe after hydration (no server WebSocket), so SSR
    // carries the empty state — the browser leg below asserts the cards.
    expect(html).toContain('data-pricing="empty"')
  })

  it('redirects signed-out visitors from a protected page to the login page with a return path', async () => {
    const response = await fetch('/settings', { redirect: 'manual' })
    expect(response.status).toBe(302)
    const location = response.headers.get('location')
    expect(location).toBeTruthy()
    const target = new URL(location!, origin())
    expect(target.origin).toBe(origin())
    expect(target.pathname).toBe('/login')
    expect(target.searchParams.get('redirect')).toBe('/settings')
    // The guard asked the deployment for the session token — through the site URL.
    expect(stub.requests.some(r => r.url === '/api/auth/convex/token')).toBe(true)
  })

  it('serves RFC 9728 protected-resource metadata pointing at the auth proxy', async () => {
    const response = await fetch('/.well-known/oauth-protected-resource')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    const metadata = await response.json() as Record<string, unknown>
    expect(metadata.resource).toBe(origin())
    expect(metadata.authorization_servers).toEqual([`${origin()}/api/auth`])
    expect(metadata.bearer_methods_supported).toEqual(['header'])
  })

  it('proxies RFC 8414 authorization-server metadata from the deployment', async () => {
    const response = await fetch('/.well-known/oauth-authorization-server')
    expect(response.status).toBe(200)
    const metadata = await response.json() as Record<string, unknown>
    expect(metadata.issuer).toBe(stub.url)
    expect(metadata.token_endpoint).toBe(`${stub.url}/api/auth/mcp/token`)
    // Fetched from the site URL directly, not through the app's own proxy.
    expect(stub.requests.some(r => r.url === '/api/auth/.well-known/oauth-authorization-server')).toBe(true)
  })

  it('challenges an unauthenticated MCP request with the resource-metadata pointer', async () => {
    const response = await fetch('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '0.0.0' } } }),
    })
    expect(response.status).toBe(401)
    const challenge = response.headers.get('www-authenticate')
    expect(challenge).toContain('Bearer')
    expect(challenge).toContain(`resource_metadata="${origin()}/.well-known/oauth-protected-resource"`)
    const body = await response.json() as { error: { code: number, message: string } }
    expect(body.error.code).toBe(-32000)
    expect(body.error.message).toContain('authentication required')
  })

  it('proxies /api/auth/** to the site URL with the Better Auth forwarding headers', async () => {
    const before = stub.requests.length
    const response = await fetch('/api/auth/get-session', {
      headers: { cookie: 'better-auth.session_token=xyz' },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toBeNull()

    const forwarded = stub.requests.slice(before).find(r => r.url === '/api/auth/get-session')
    expect(forwarded).toBeDefined()
    expect(forwarded!.method).toBe('GET')
    expect(forwarded!.headers.cookie).toBe('better-auth.session_token=xyz')
    expect(forwarded!.headers.host).toBe(stubHost)
    expect(forwarded!.headers['x-forwarded-host']).toBe(new URL(origin()).host)
    expect(forwarded!.headers['x-forwarded-proto']).toBe('http')
    expect(forwarded!.headers['x-better-auth-forwarded-host']).toBe(new URL(origin()).host)
    expect(forwarded!.headers['x-better-auth-forwarded-proto']).toBe('http')
  })

  it('applies the Convex-aware CSP: connect-src carries the deployment over HTTP and WebSocket', async () => {
    const response = await fetch('/login')
    const csp = response.headers.get('content-security-policy')
    expect(csp).toBeTruthy()
    const connectSrc = csp!.split(';').map(d => d.trim()).find(d => d.startsWith('connect-src'))
    expect(connectSrc).toBeDefined()
    expect(connectSrc).toContain(`http://${stubHost}`)
    expect(connectSrc).toContain(`ws://${stubHost}`)
    expect(csp).toMatch(new RegExp(`img-src[^;]*http://${stubHost.replace('.', '\\.')}`))
  })

  it('writes nothing into the example app (zero scaffold writes)', () => {
    const status = gitStatus()
    expect(status).toEqual(statusBeforeBuild)
    // Only the generated api the test itself provisions may show up.
    expect(status.filter(line => !line.includes('backend/_generated'))).toEqual([])
  })
})

describe('examples/minimal in a browser', { timeout: 90_000 }, () => {
  it('signs in with an email code: the form advances once the deployment accepted the OTP request', async () => {
    const page = await createPage()
    const { errors } = collectBrowserErrors(page)
    await page.goto(url('/login'), { waitUntil: 'hydration' })

    await page.click('[data-auth="otp-start"]')
    await page.fill('[data-auth="input-email"]', 'ada@example.com')
    const before = stub.requests.length
    await page.click('[data-auth="submit"]')
    await page.waitForSelector('[data-auth="step-verify-code"]')

    expect(await page.textContent('[data-auth="sent-note"]')).toContain('ada@example.com')
    const otpRequests = stub.requests.slice(before).filter(r => r.url === '/api/auth/email-otp/send-verification-otp')
    expect(otpRequests).toHaveLength(1)
    expect(otpRequests[0]!.method).toBe('POST')
    expect(JSON.parse(otpRequests[0]!.body)).toMatchObject({ email: 'ada@example.com', type: 'sign-in' })
    // The browser talks to the app origin; the proxy stamps the forwarding headers.
    expect(otpRequests[0]!.headers['x-better-auth-forwarded-host']).toBe(new URL(origin()).host)

    expect(errors).toEqual([])
    await page.close()
  })

  it('renders live pricing from the deployment over the sync WebSocket', async () => {
    const page = await createPage()
    const { errors, frames } = collectBrowserErrors(page)
    await page.goto(url('/pricing'), { waitUntil: 'hydration' })

    const rendered = await page.waitForSelector('[data-pricing="plan"]', { timeout: 15_000 }).then(() => true, () => false)
    const state = await page.evaluate(() => {
      interface NuxtAppLike {
        $config?: { public?: { convex?: unknown } }
        $convex?: { connectionState?: () => unknown }
        vueApp?: { _context?: { provides?: object } }
      }
      const app = (window as unknown as { useNuxtApp?: () => NuxtAppLike }).useNuxtApp?.()
      return {
        publicConvex: app?.$config?.public?.convex,
        connection: app?.$convex?.connectionState?.(),
        provides: Object.getOwnPropertySymbols(app?.vueApp?._context?.provides ?? {}).map(symbol => symbol.description),
        html: document.querySelector('[data-pricing="page"]')?.outerHTML.slice(0, 600) ?? document.body.innerHTML.slice(0, 600),
      }
    })
    // Everything needed to tell a stub, transport, or hydration problem apart.
    const diagnostics = `browser errors: ${JSON.stringify(errors)}\nbrowser log: ${JSON.stringify(frames, null, 1)}\nstub calls: ${JSON.stringify(stub.calls)}\nstate: ${JSON.stringify(state, null, 1)}`
    expect(rendered, diagnostics).toBe(true)
    expect(await page.textContent('[data-pricing="plan-name"]')).toContain('Pro plan')
    expect(await page.textContent('[data-pricing="plan-price"]')).toContain('29')
    expect(await page.textContent('[data-pricing="pack-name"]')).toContain('500 credits')
    // Signed out: the plan action is a sign-in link that returns here.
    const signIn = await page.getAttribute('[data-pricing="plan-action"][data-intent="sign-in"]', 'href')
    expect(signIn).toBe('/login?redirect=%2Fpricing')

    const productCalls = stub.calls.filter(c => c.path === 'billing:getConfiguredProducts' && c.transport === 'ws')
    expect(productCalls.length).toBeGreaterThan(0)
    expect(productCalls[0]!.kind).toBe('query')

    expect(errors).toEqual([])
    await page.close()
  })
})
