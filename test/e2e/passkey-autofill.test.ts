import { createHmac } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import vue from '@vitejs/plugin-vue'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { STORAGE_COOKIE } from '../../src/convex/consent-rules'
import { LAST_SIGN_IN_COOKIE } from '../../src/convex/constants'
import { authFlow, SECRET } from '../helpers/auth-flow'

// Passkey autofill (WebAuthn conditional mediation) in a real Chromium,
// against real Better Auth: the packaged <AuthForm> and auth client, built
// for the browser (test/fixtures/passkey-autofill), on one origin with the
// auth routes. Chromium's virtual authenticator holds the passkey, and with
// its UI off it answers a conditional request as soon as one is made, the
// way a person picking the passkey from the field's autofill would. WebKit
// has no virtual authenticator: real Safari and iOS stay a manual check.

const fixture = (file: string) => fileURLToPath(new URL(`../fixtures/passkey-autofill/${file}`, import.meta.url))
const ADA = 'ada@example.com'
const addressKey = (address: string) => createHmac('sha256', SECRET).update(`client-address:${address}`).digest('hex')

type Flow = Awaited<ReturnType<typeof authFlow>>
type PageClient = { backend: { client: { passkey: { addPasskey: (options: { name: string }) => Promise<{ error: unknown }> }, signOut: () => Promise<unknown> }, signedIn: number } }

let server: Server
let origin: string
let flow: Flow
let script: string
let browser: Browser

/** One Node request as a fetch `Request`, and the handler's answer back, every `Set-Cookie` kept. */
async function serveAuth(request: IncomingMessage, response: ServerResponse) {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') headers.set(name, value)
  }
  const answer = await flow.auth.handler(new Request(`${origin}${request.url}`, { method: request.method, headers, body }))
  response.statusCode = answer.status
  answer.headers.forEach((value, name) => {
    if (name !== 'set-cookie') response.setHeader(name, value)
  })
  response.setHeader('set-cookie', answer.headers.getSetCookie())
  response.end(Buffer.from(await answer.arrayBuffer()))
}

beforeAll(async () => {
  const output = await build({
    configFile: false,
    logLevel: 'error',
    root: fixture('.'),
    plugins: [vue()],
    resolve: {
      alias: [
        { find: '#imports', replacement: fixture('imports.ts') },
        { find: 'nuxt-convex-module/better-auth/client', replacement: fixture('base-auth.ts') },
      ],
    },
    build: {
      write: false,
      minify: false,
      rollupOptions: { input: fixture('entry.ts'), output: { format: 'es', codeSplitting: false } },
    },
  }) as { output: Array<{ type: string, code?: string }> } | Array<{ output: Array<{ type: string, code?: string }> }>
  const chunks = (Array.isArray(output) ? output[0]! : output).output
  script = chunks.find(chunk => chunk.type === 'chunk')!.code!

  server = createServer((request, response) => {
    if (request.url?.startsWith('/api/auth/')) {
      serveAuth(request, response).catch((error: unknown) => {
        response.statusCode = 500
        response.end(String(error))
      })
      return
    }
    if (request.url === '/app.js') {
      response.setHeader('content-type', 'text/javascript')
      response.end(script)
      return
    }
    response.setHeader('content-type', 'text/html')
    response.end('<!doctype html><html lang="en"><body><div id="app"></div><script type="module" src="/app.js"></script></body></html>')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  // `localhost`, not the address: WebAuthn takes the relying party from a
  // host name, and a secure context from localhost.
  origin = `http://localhost:${(server.address() as AddressInfo).port}`
  flow = await authFlow({ build: { authOptions: { baseURL: origin } } })
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  if (server) await new Promise(resolve => server.close(resolve))
  vi.unstubAllEnvs()
})

/** A browser context with a virtual authenticator that holds discoverable passkeys and answers without a person. */
async function withAuthenticator(): Promise<{ context: BrowserContext, page: Page }> {
  const context = await browser.newContext()
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable', { enableUI: false })
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  })
  return { context, page }
}

/** The page's own state: how often the form said it signed in. */
const signedIn = (page: Page) => page.evaluate(() => (window as unknown as PageClient).backend.signedIn)

describe('passkey autofill in Chromium', () => {
  it('signs in with the passkey the field offers, records it, and marks it "Last used" next time', async () => {
    const { context, page } = await withAuthenticator()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))

    // An account with a session, which saves a passkey on this browser's
    // authenticator, in a browser that allowed preferences storage, so the
    // sign-in may remember its method.
    const ada = await flow.signedIn(ADA)
    await context.addCookies([
      ...ada.cookie.split('; ').map((pair) => {
        const at = pair.indexOf('=')
        return { name: pair.slice(0, at), value: pair.slice(at + 1), url: origin }
      }),
      { name: STORAGE_COOKIE, value: 'preferences', url: origin },
    ])
    await page.goto(origin)
    const saved = await page.evaluate(() => (window as unknown as PageClient).backend.client.passkey.addPasskey({ name: 'Laptop' }))
    expect(saved.error).toBeNull()
    expect(flow.db.passkey).toHaveLength(1)
    await page.evaluate(() => (window as unknown as PageClient).backend.client.signOut())

    // Signed out, on the sign-in form: the first step has no field, so
    // nothing is asked until the person moves to the email step.
    await page.reload()
    await page.locator('[data-auth="otp-start"]').waitFor()
    expect(flow.limiter.total('passkeySignInGlobal')).toBe(0)
    await page.locator('[data-auth="otp-start"]').click()
    await expect.poll(() => page.locator('[data-auth="input-email"]').getAttribute('autocomplete')).toBe('username webauthn')

    // The field's autofill answers with the passkey: signed in, no code, no prompt.
    await expect.poll(() => signedIn(page)).toBe(1)
    expect(flow.db.user!.find(row => row.email === ADA)).toMatchObject({ lastLoginMethod: 'passkey' })
    const cookies = await context.cookies(origin)
    expect(cookies.find(cookie => cookie.name === LAST_SIGN_IN_COOKIE)).toMatchObject({ value: 'passkey', httpOnly: false })
    // One challenge, keyed by an HMAC of the address Better Auth read (the
    // loopback here), then the deployment's ceiling.
    expect(flow.limiter.limit.mock.calls.filter(([, name]) => String(name).startsWith('passkeySignIn')).map(([, name, options]) => [name, options?.key]))
      .toEqual([['passkeySignIn', addressKey('127.0.0.1')], ['passkeySignInGlobal', undefined]])

    // Next time: the form opens on the passkey button, marked, and a tap
    // there signs in through the prompt.
    await page.evaluate(() => (window as unknown as PageClient).backend.client.signOut())
    await page.reload()
    const button = page.locator('[data-auth="passkey-sign-in"]')
    await expect.poll(() => button.locator('[data-auth="last-used"]').textContent()).toBe('Last used')
    expect(await button.getAttribute('aria-describedby')).toBe(await button.locator('[data-auth="last-used"]').getAttribute('id'))
    await button.click()
    await expect.poll(() => signedIn(page)).toBe(1)
    expect(flow.limiter.total('passkeySignInGlobal')).toBe(2)

    // A passkey removed from the account but still on the device: the
    // field offers it, the person picks it, and the form says it did not
    // work, where they are, rather than ending quietly.
    await page.evaluate(() => (window as unknown as PageClient).backend.client.signOut())
    flow.db.passkey!.splice(0)
    await page.reload()
    await page.locator('[data-auth="otp-start"]').click()
    await expect.poll(() => page.locator('[data-auth="error"]').textContent()).toBe('That passkey didn\'t work. Try again, or continue with an email code.')
    expect(await page.locator('[data-auth="input-email"]').isVisible()).toBe(true)
    expect(await signedIn(page)).toBe(0)

    expect(errors).toEqual([])
    await context.close()
  })
})
