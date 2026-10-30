import { execFileSync } from 'node:child_process'
import { request as httpRequest } from 'node:http'
import { gunzipSync, gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { $fetch, createPage, fetch, setup, url } from '@nuxt/test-utils/e2e'
import type { NuxtConfig } from '@nuxt/schema'
import type { Page } from 'playwright-core'
import type { BackendAppConfigInput } from '../../src/runtime/config'
import { axeViolations } from './helpers/axe'
import { startConvexStub } from './helpers/convex-stub'
import { prepareExampleApp } from './helpers/example-app'

// Full production build + serve of `templates/starter` — the out-of-the-box
// app (`modules: ['nuxt-backend']`, scaffolded backend, no custom code) —
// against a stub deployment: the module's ready-made pages over SSR, the
// auth middleware, the Better Auth proxy, the Convex-aware CSP, and a browser leg that
// drives the passwordless sign-in form and a live query through the stub's
// sync WebSocket, then checks each step a signed-out visitor reaches with
// axe-core, in the light and the dark scheme.

const rootDir = fileURLToPath(new URL('../../templates/starter', import.meta.url))
const repoDir = fileURLToPath(new URL('../..', import.meta.url))

// Keep Nuxt's telemetry out of the build entirely (it is also disabled via
// config below) — a build must not touch the example app, and the run
// asserts exactly that.
process.env.NUXT_TELEMETRY_DISABLED ||= '1'

/**
 * The pricing copy (`appConfig.backend.billing`) — names, prices and
 * credits resolve live from `billing:getPricing` (canned below).
 */
const CATALOG: BackendAppConfigInput = {
  billing: {
    plans: [{ key: 'pro', blurb: 'Everything, monthly', highlight: true }],
    packs: [{ key: 'credits500' }],
  },
}

/** Canned `billing:getPricing` result: Pro by the month and the year, and one pack. */
const PRICING = {
  plans: [{
    key: 'pro',
    name: 'Pro plan',
    description: null,
    retired: false,
    features: ['Priority support'],
    prices: {
      month: { productId: 'prod_pro', amount: 2900, currency: 'usd', monthly: 2900, credits: { meter: 'credits', units: 500, rollover: false } },
      year: { productId: 'prod_pro_year', amount: 29000, currency: 'usd', monthly: 29000 / 12, savings: 16, credits: { meter: 'credits', units: 6000, rollover: false } },
    },
  }],
  packs: [{ key: 'credits500', productId: 'prod_credits500', name: '500 credits', description: null, amount: 2000, currency: 'usd', credits: { meter: 'credits', units: 500, rollover: true }, isBestValue: false }],
}

const stub = await startConvexStub({
  handlers: {
    'billing:getPricing': () => PRICING,
    // `useBilling()` still reads the products by key.
    'billing:getConfiguredProducts': () => ({ pro: { id: 'prod_pro', name: 'Pro plan' }, credits500: { id: 'prod_credits500', name: '500 credits' } }),
    // `useCredits()` subscribes unconditionally; signed out there is no balance.
    'billing:getCredits': () => null,
  },
})

// The page guard: a page the starter does not ship, mounted behind one rule
// of each kind: /members-only (`role: 'admin'`), /subscribers-only
// (`feature: 'priority-support'`, which the admin's plan includes) and
// /owners-only (`workspace: 'owner'`). The starter has no error.vue, so
// the module's own error page renders the 403 with <AccessDenied>. A session
// cookie names who is signed in, and the stub answers the token, the
// session, the active workspace's member and the plan's features for it;
// every other request stays signed out, as the rest of this file expects.
const GUARDED_PAGE = fileURLToPath(new URL('../fixtures/access/members-only.vue', import.meta.url))
const SIGNED_IN = { member: 'user', admin: 'admin' } as const
/** Who a request's session cookie signs in, if anyone. */
const whoIs = (cookie: string | string[] | undefined): keyof typeof SIGNED_IN | undefined =>
  String(cookie ?? '').match(/better-auth\.session_token=(member|admin)\b/)?.[1] as keyof typeof SIGNED_IN | undefined
const accountOf = (who: keyof typeof SIGNED_IN) => ({ id: `user_${who}`, name: 'Ada Lovelace', email: 'ada@example.com', emailVerified: true, image: null, role: SIGNED_IN[who], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' })
/** An unsigned JWT with the claims the auth server puts on a session's token. */
function sessionToken(who: keyof typeof SIGNED_IN): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const { id, image: _image, ...claims } = accountOf(who)
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: id, ...claims, exp: Math.floor(Date.now() / 1000) + 3600 })}.`
}
stub
  .route('GET /api/auth/convex/token', (request) => {
    const who = whoIs(request.headers.cookie)
    return { body: { token: who ? sessionToken(who) : null } }
  })
  .route('GET /api/auth/get-session', (request) => {
    const who = whoIs(request.headers.cookie)
    return { body: who ? { user: accountOf(who), session: { id: `session_${who}`, userId: `user_${who}`, expiresAt: '2099-01-01T00:00:00.000Z' } } : null }
  })
  // The admin owns the active workspace; the member is a member of it.
  .route('GET /api/auth/organization/get-active-member', (request) => {
    const who = whoIs(request.headers.cookie)
    return { body: who ? { id: `member_${who}`, organizationId: 'org_1', userId: `user_${who}`, role: who === 'admin' ? 'owner' : 'member' } : null }
  })
  // Both belong to the one workspace: the switcher lists it.
  .route('GET /api/auth/organization/list', (request) => {
    const who = whoIs(request.headers.cookie)
    return { body: who ? [{ id: 'org_1', name: 'Acme', slug: 'acme', createdAt: '2026-01-01T00:00:00.000Z' }] : [] }
  })
  // The browser reports its time zone after a sign-in, for the email sending rules.
  .on('email:recordTimeZone', () => null)
  // The admin's plan includes priority support; the member's includes nothing.
  .on('billing:getFeatures', (_args, call) => {
    const subject = call.token ? JSON.parse(Buffer.from(call.token.split('.')[1] ?? '', 'base64url').toString('utf8')).sub : undefined
    return { benefits: subject === 'user_admin' ? [{ benefitId: 'benefit_priority', metadata: { key: 'priority-support' } }] : [] }
  })
const app = prepareExampleApp(rootDir)
afterAll(async () => {
  await stub.close()
  app.cleanup()
})

const gitStatus = () => execFileSync('git', ['status', '--porcelain', '--', 'templates/starter'], { cwd: repoDir, encoding: 'utf8' })
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
    backend: {
      url: stub.url,
      devtools: false,
    },
    // The stub answers both the client and the HTTP routes, so the site origin is its own.
    convex: { siteUrl: stub.url },
    // Widened through `unknown`: the override is typed as the *resolved* app
    // config, whose empty defaults narrow the catalog arrays to `never[]` —
    // `CATALOG` is checked against the module's input contract instead.
    appConfig: { backend: CATALOG } as unknown as NuxtConfig['appConfig'],
    hooks: {
      'pages:extend'(pages) {
        pages.push(
          { name: 'members-only', path: '/members-only', file: GUARDED_PAGE, meta: { auth: { role: 'admin' } } },
          { name: 'subscribers-only', path: '/subscribers-only', file: GUARDED_PAGE, meta: { auth: { feature: 'priority-support' } } },
          { name: 'owners-only', path: '/owners-only', file: GUARDED_PAGE, meta: { auth: { workspace: 'owner' } } },
        )
      },
    },
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

describe('templates/starter (production build)', { timeout: 60_000 }, () => {
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

  it('server-renders the pricing page with its prices in the HTML, and its meta description', async () => {
    const html = await $fetch<string>('/pricing?utm_source=newsletter')
    expect(html).toContain('data-pricing="page"')
    expect(html).toContain('data-pricing="table"')
    expect(html).toContain('data-pricing="header"')
    // The pricing is read on the server (one HTTP query) and rendered: a
    // visitor and a crawler get the plans, not a loading state.
    expect(html).not.toContain('data-pricing="loading"')
    expect(html).toContain('data-pricing="plan"')
    expect(html).toContain('Pro plan')
    expect(html).toContain('$29')
    expect(html).toContain('data-pricing="interval"')
    expect(html).toContain('500 credits / month')
    // The sign-in link returns to this very address, campaign included.
    expect(html).toContain('href="/login?redirect=%2Fpricing%3Futm_source%3Dnewsletter"')
    expect(html).toContain('<meta name="description" content="Plans and prices.">')
    // No SEO module in the starter: no Open Graph tags, no structured data.
    expect(html).not.toContain('application/ld+json')
    expect(stub.calls.some(call => call.path === 'billing:getPricing' && call.transport === 'http')).toBe(true)
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

  it('answers a signed-in person who fails a page\'s rules with a 403 that renders <AccessDenied>', async () => {
    // A browser's request: an HTML page, not the JSON error a script gets.
    const response = await fetch('/members-only?tab=roles', { headers: { cookie: 'better-auth.session_token=member', accept: 'text/html' } })
    expect(response.status).toBe(403)
    const html = await response.text()
    expect(html).toContain('data-access="root"')
    expect(html).toContain('data-access="reason"')
    expect(html).not.toContain('data-members-only')
    // The error's data, in the payload, carries the rule failed and the page
    // asked for (with its slash escaped): where another account returns to.
    expect(html).toContain('"reason":')
    expect(html).toContain('members-only?tab=roles')
  })

  it('opens a page with rules to a person who passes them, and keeps the render out of every cache', async () => {
    const response = await fetch('/members-only', { headers: { cookie: 'better-auth.session_token=admin' } })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.text()).toContain('data-members-only')
  })

  it.each([
    { page: '/subscribers-only', rule: 'a plan feature, read from the deployment as the person', workspace: false },
    { page: '/owners-only', rule: 'a workspace role, read from the auth route with the request\'s cookies', workspace: true },
  ])('decides $rule on a server render', async ({ page, workspace }) => {
    const refused = await fetch(page, { headers: { cookie: 'better-auth.session_token=member', accept: 'text/html' } })
    expect(refused.status).toBe(403)
    const html = await refused.text()
    expect(html).toContain('data-access="root"')
    // Only a workspace refusal offers the workspace switcher.
    expect(html.includes('data-access="switch-workspace"')).toBe(workspace)
    expect(html).not.toContain('data-members-only')
    const opened = await fetch(page, { headers: { cookie: 'better-auth.session_token=admin' } })
    expect(opened.status).toBe(200)
    expect(await opened.text()).toContain('data-members-only')
  })

  it('sends a signed-out visitor from a page with rules to sign in, with the way back', async () => {
    const response = await fetch('/members-only', { redirect: 'manual' })
    expect(response.status).toBe(302)
    const target = new URL(response.headers.get('location')!, origin())
    expect(target.pathname).toBe('/login')
    expect(target.searchParams.get('redirect')).toBe('/members-only')
  })

  it('serves no agent endpoint and no OAuth discovery: the end-user MCP waits for the next release', async () => {
    for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-authorization-server']) {
      expect((await fetch(path)).status, path).toBe(404)
    }
    const response = await fetch('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '0.0.0' } } }),
    })
    expect(response.status).toBe(404)
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
    expect(forwarded!.headers['x-better-auth-forwarded-host']).toBe(new URL(origin()).host)
    expect(forwarded!.headers['x-better-auth-forwarded-proto']).toBe('http')
  })

  // Issue #19: 0.1.0 relayed a deployment's gzip-encoded auth response as
  // plain bytes still labelled `content-encoding: gzip`, and the browser
  // failed every sign-in with ERR_CONTENT_DECODING_FAILED. Read raw, with no
  // client that decodes for us, the header and the bytes have to agree.
  it('relays a compressed auth response with no stale content-encoding', async () => {
    const answer = { token: 'session-token', user: { id: 'user_1', email: 'ada@example.com' } }
    stub.route('POST /api/auth/sign-in/email-otp', () => ({
      // Compressed whatever the request accepted, as a deployment may.
      headers: { 'Content-Encoding': 'gzip', 'Set-Cookie': 'better-auth.session_token=abc; Path=/; HttpOnly' },
      raw: gzipSync(JSON.stringify(answer)),
    }))
    const relayed = await new Promise<{ status: number, headers: Record<string, string | string[] | undefined>, bytes: Buffer }>((resolve, reject) => {
      const outgoing = httpRequest(url('/api/auth/sign-in/email-otp'), { method: 'POST', headers: { 'content-type': 'application/json', 'accept-encoding': 'gzip, deflate, br' } }, (incoming) => {
        const chunks: Buffer[] = []
        incoming.on('data', chunk => chunks.push(chunk as Buffer))
        incoming.on('end', () => resolve({ status: incoming.statusCode ?? 0, headers: incoming.headers, bytes: Buffer.concat(chunks) }))
        incoming.on('error', reject)
      })
      outgoing.on('error', reject)
      outgoing.end(JSON.stringify({ email: 'ada@example.com', otp: '123456' }))
    })
    expect(relayed.status).toBe(200)
    const encoding = relayed.headers['content-encoding']
    expect([undefined, 'identity', 'gzip'], `content-encoding: ${encoding}`).toContain(encoding)
    // Whatever the relay says the bytes are, they are: decoded with what it names, they are the answer.
    const decoded = encoding === 'gzip' ? gunzipSync(relayed.bytes) : relayed.bytes
    expect(JSON.parse(decoded.toString('utf8'))).toEqual(answer)
    const length = relayed.headers['content-length']
    if (length !== undefined) expect(Number(length)).toBe(relayed.bytes.length)
    expect(String(relayed.headers['set-cookie'])).toContain('better-auth.session_token=abc')
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

describe('templates/starter in a browser', { timeout: 90_000 }, () => {
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

    // The server's read rides in the payload; the page then stays live over the socket.
    const pricingCalls = stub.calls.filter(c => c.path === 'billing:getPricing' && c.transport === 'ws')
    expect(pricingCalls.length).toBeGreaterThan(0)
    expect(pricingCalls[0]!.kind).toBe('query')

    expect(errors).toEqual([])
    await page.close()
  })
})

/** Sign a browser page in as `who`, through the session cookie the stub reads. */
const signInAs = (page: Page, who: keyof typeof SIGNED_IN) => page.context().addCookies([{ name: 'better-auth.session_token', value: who, url: origin() }])

describe('the page guard in a browser', { timeout: 90_000 }, () => {
  it('shows <AccessDenied> for a navigation its rules refuse, keeping the page\'s path', async () => {
    const page = await createPage()
    const { errors } = collectBrowserErrors(page)
    await signInAs(page, 'member')
    await page.goto(url('/'), { waitUntil: 'hydration' })
    // The navigation rejects with the 403, as a <NuxtLink> would swallow it.
    await page.evaluate(() => (document.querySelector('#__nuxt') as unknown as { __vue_app__: { config: { globalProperties: { $router: { push: (to: string) => Promise<unknown> } } } } })
      .__vue_app__.config.globalProperties.$router.push('/members-only').catch(() => {}))
    await page.waitForSelector('[data-access="root"]', { timeout: 15_000 })
    expect(new URL(page.url()).pathname).toBe('/members-only')
    expect(await page.textContent('[data-access="account"]')).toContain('ada@example.com')
    expect(await page.$('[data-members-only]')).toBeNull()
    expect(errors).toEqual([])
    await page.close()
  })
})

/**
 * Every module page a signed-out visitor reaches, at each step that changes
 * its markup, for the axe smoke below. A pull request that adds a module
 * page adds its line here: where it is, how to get to the step, and what
 * shows once it is there.
 */
const AXE_STEPS: Array<{ name: string, path: string, ready: string, as?: keyof typeof SIGNED_IN, act?: (page: Page) => Promise<void> }> = [
  { name: '/login, choosing a way in', path: '/login', ready: '[data-auth="step-choose"]' },
  {
    name: '/login, asking for a code',
    path: '/login',
    ready: '[data-auth="step-request-code"]',
    act: page => page.click('[data-auth="otp-start"]'),
  },
  {
    name: '/login, entering the code',
    path: '/login',
    ready: '[data-auth="step-verify-code"]',
    act: async (page) => {
      await page.click('[data-auth="otp-start"]')
      await page.fill('[data-auth="input-email"]', 'ada@example.com')
      await page.click('[data-auth="submit"]')
    },
  },
  { name: '/pricing', path: '/pricing', ready: '[data-pricing="plan"]' },
  // The page guard's 403, signed in: <AccessDenied> in the module's error page.
  { name: '/members-only, refused', path: '/members-only', ready: '[data-access="switch-account"]', as: 'member' },
]

describe('templates/starter, checked by axe-core (WCAG 2.2 A and AA)', { timeout: 90_000 }, () => {
  const runs = AXE_STEPS.flatMap(step => (['light', 'dark'] as const).map(scheme => ({ ...step, scheme })))

  it.each(runs)('$name, $scheme', async ({ path, ready, as, act, scheme }) => {
    const page = await createPage()
    try {
      if (as) await signInAs(page, as)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.goto(url(path), { waitUntil: 'hydration' })
      await act?.(page)
      await page.waitForSelector(ready, { timeout: 15_000 })
      expect(await axeViolations(page)).toEqual([])
    }
    finally {
      await page.close()
    }
  })
})
