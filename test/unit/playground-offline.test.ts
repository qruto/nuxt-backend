import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { $fetch } from 'ofetch'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isLocalSite, PROBE_TIMEOUT_MS, probeBackend } from '../../website/shared/backend-probe'
import { backendPresent, forgetPresence, OFFLINE_PATH, offlineRedirect, PRESENT_TTL_MS, returnPath } from '../../website/shared/playground-offline'

// A playground build whose deployment is not there (a stopped local
// deployment) degrades to the offline page instead of answering 500 on the
// server: the offline middleware asks the deployment first. A deployment
// elsewhere that is slow or failing for a moment is no reason to turn
// visitors away, so only nothing listening counts there.

const LOCAL = 'http://127.0.0.1:3211'
const REMOTE = 'https://happy-otter-123.convex.site'

/** A failed fetch as ofetch reports it: `<no response>` ← `fetch failed` ← the socket's error. */
function noResponse(code: string): Error {
  const socket = Object.assign(new Error(`connect ${code}`), { code })
  return new Error('[GET] "/api/auth/ok": <no response> fetch failed', { cause: new TypeError('fetch failed', { cause: socket }) })
}

/** A response with an error status, as ofetch reports it. */
const answered = (status: number) => Object.assign(new Error(`[GET] "/api/auth/ok": ${status}`), { statusCode: status, response: { status } })

/** A timeout, as ofetch reports it. */
const timedOut = () => new Error('[GET] "/api/auth/ok": <no response> [TimeoutError]', { cause: Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError', code: 23 }) })

const failing = (error: Error) => vi.fn(async () => {
  throw error
})

beforeEach(() => {
  forgetPresence()
})

describe('probeBackend', () => {
  it('reads a deployment that answers Better Auth\'s ok route as live', async () => {
    const fetcher = vi.fn(async () => ({ ok: true }))
    expect(await probeBackend(REMOTE, fetcher)).toBe('live')
    expect(fetcher).toHaveBeenCalledWith('/api/auth/ok', { baseURL: REMOTE, timeout: PROBE_TIMEOUT_MS, retry: 0 })
  })

  it('reads a deployment elsewhere as absent only when nothing listens or the name does not resolve', async () => {
    expect(await probeBackend(REMOTE, failing(noResponse('ECONNREFUSED')))).toBe('absent')
    expect(await probeBackend(REMOTE, failing(noResponse('ENOTFOUND')))).toBe('absent')
    // Slow, failing or empty for a moment: its pages handle that themselves.
    expect(await probeBackend(REMOTE, failing(timedOut()))).toBe('unsure')
    expect(await probeBackend(REMOTE, failing(answered(503)))).toBe('unsure')
    expect(await probeBackend(REMOTE, failing(noResponse('ECONNRESET')))).toBe('unsure')
    expect(await probeBackend(REMOTE, async () => ({ ok: false }))).toBe('unsure')
  })

  it('reads a deployment on this machine or its network as absent whenever it is not live', async () => {
    for (const site of [LOCAL, 'https://site.nuxt-backend.localhost', 'https://site.nuxt-backend.local', 'http://localhost:3211']) {
      expect(isLocalSite(site), site).toBe(true)
      expect(await probeBackend(site, failing(timedOut())), site).toBe('absent')
      expect(await probeBackend(site, failing(answered(502))), site).toBe('absent')
      expect(await probeBackend(site, async () => ({ ok: false })), site).toBe('absent')
    }
    expect(isLocalSite(REMOTE)).toBe(false)
    expect(isLocalSite('https://nuxt-backend.localhost.evil.com')).toBe(false)
  })

  it('reads a port nothing listens on as absent, through the real fetch', async () => {
    const server = createServer()
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
    const { port } = server.address() as AddressInfo
    await new Promise(done => server.close(done))
    expect(await probeBackend(`http://127.0.0.1:${port}`, $fetch as never)).toBe('absent')
  })
})

describe('backendPresent', () => {
  it('asks once per window, a shorter one while the deployment is absent', async () => {
    const down = failing(noResponse('ECONNREFUSED'))
    expect(await backendPresent(REMOTE, down, 0)).toBe(false)
    await backendPresent(REMOTE, down, PRESENT_TTL_MS.absent - 1)
    expect(down).toHaveBeenCalledTimes(1)
    const up = vi.fn(async () => ({ ok: true }))
    expect(await backendPresent(REMOTE, up, PRESENT_TTL_MS.absent)).toBe(true)
    await backendPresent(REMOTE, up, PRESENT_TTL_MS.absent + PRESENT_TTL_MS.present - 1)
    expect(up).toHaveBeenCalledTimes(1)
    // Another deployment is asked on its own.
    await backendPresent(LOCAL, up, PRESENT_TTL_MS.absent + 1)
    expect(up).toHaveBeenCalledTimes(2)
  })

  it('keeps a slow deployment elsewhere present', async () => {
    expect(await backendPresent(REMOTE, failing(timedOut()), 0)).toBe(true)
  })
})

/** A route as the router hands it to the middleware. */
const route = (fullPath: string) => {
  const url = new URL(fullPath, 'http://site')
  return { path: url.pathname, fullPath, query: Object.fromEntries(url.searchParams) }
}

describe('offlineRedirect', () => {
  const server = (present: boolean, siteUrl = LOCAL) => ({ client: false, hydrating: false, siteUrl, present: vi.fn(async () => present) })

  it('sends a server render to the offline page when the deployment is not there, with the page to go back to', async () => {
    const context = server(false)
    expect(await offlineRedirect(route('/playground/saas/settings?tab=plan'), context)).toBe(`${OFFLINE_PATH}?from=${encodeURIComponent('/playground/saas/settings?tab=plan')}`)
    expect(context.present).toHaveBeenCalledWith(LOCAL)
    // On the offline page already: it stays.
    expect(await offlineRedirect(route(`${OFFLINE_PATH}?from=%2Fplayground`), context)).toBeNull()
  })

  it('lets a server render through when the deployment is there, and sends the offline page back where it came from', async () => {
    expect(await offlineRedirect(route('/playground/saas/settings'), server(true))).toBeNull()
    expect(await offlineRedirect(route(`${OFFLINE_PATH}?from=${encodeURIComponent('/playground/client/queries')}`), server(true))).toBe('/playground/client/queries')
  })

  it('sends a build without a deployment to the offline page, asking nothing', async () => {
    // The runtime config holds an empty string when the build names none.
    const context = server(true, '')
    expect(await offlineRedirect(route('/playground'), context)).toBe(OFFLINE_PATH)
    expect(context.present).not.toHaveBeenCalled()
  })

  it('leaves the rest of the site alone', async () => {
    const context = server(false)
    expect(await offlineRedirect(route('/docs/start'), context)).toBeNull()
    expect(await offlineRedirect(route('/playgrounds'), context)).toBeNull()
    expect(context.present).not.toHaveBeenCalled()
  })

  it('trusts the server\'s answer while hydrating, and never asks from the browser', async () => {
    const present = vi.fn(async () => false)
    expect(await offlineRedirect(route(OFFLINE_PATH), { client: true, hydrating: true, siteUrl: LOCAL, present })).toBeNull()
    expect(await offlineRedirect(route('/playground/saas/settings'), { client: true, hydrating: false, siteUrl: LOCAL, present })).toBeNull()
    // A client navigation to the offline page of a build with a deployment goes back.
    expect(await offlineRedirect(route(OFFLINE_PATH), { client: true, hydrating: false, siteUrl: LOCAL, present })).toBe('/playground')
    expect(present).not.toHaveBeenCalled()
  })

  it('goes back only to a playground page of this site', () => {
    expect(returnPath('/playground/saas/settings?tab=plan')).toBe('/playground/saas/settings?tab=plan')
    expect(returnPath('/playground')).toBe('/playground')
    for (const from of [undefined, ['/playground/a'], 'https://evil.example/playground', '//evil.example/playground', '/docs/start', '/playgrounds', OFFLINE_PATH, `${OFFLINE_PATH}?from=x`]) {
      expect(returnPath(from), String(from)).toBe('/playground')
    }
  })
})

const MIDDLEWARE = new URL('../../website/middleware/playground-offline.global.ts', import.meta.url).href

describe('the offline middleware', () => {
  const navigateTo = vi.fn((path: string, options: unknown) => ({ redirectedTo: path, options }))
  let fetcher: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    navigateTo.mockClear()
    fetcher = vi.fn()
    vi.stubGlobal('defineNuxtRouteMiddleware', (middleware: unknown) => middleware)
    vi.stubGlobal('useNuxtApp', () => ({ isHydrating: false, payload: { serverRendered: true } }))
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { convex: { siteUrl: LOCAL } } }))
    vi.stubGlobal('navigateTo', navigateTo)
    vi.stubGlobal('$fetch', fetcher)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function render(fullPath: string) {
    // Imported by URL: the middleware reads Nuxt's auto-imports as globals, which this
    // test stubs and the root type check (no website .nuxt) does not know.
    const module = await import(/* @vite-ignore */ MIDDLEWARE) as { default: (to: ReturnType<typeof route>) => Promise<unknown> }
    const middleware = module.default
    return await middleware(route(fullPath))
  }

  it('redirects a server render to the offline page when the local deployment refuses the connection', async () => {
    fetcher.mockRejectedValue(noResponse('ECONNREFUSED'))
    expect(await render('/playground/platform/billing')).toEqual({ redirectedTo: `${OFFLINE_PATH}?from=${encodeURIComponent('/playground/platform/billing')}`, options: { replace: true } })
    expect(fetcher).toHaveBeenCalledWith('/api/auth/ok', expect.objectContaining({ baseURL: LOCAL }))
  })

  it('renders the page when the deployment answers', async () => {
    fetcher.mockResolvedValue({ ok: true })
    expect(await render('/playground/platform/billing')).toBeUndefined()
    expect(navigateTo).not.toHaveBeenCalled()
  })
})
