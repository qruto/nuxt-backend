import { describe, expect, it, vi } from 'vitest'
import { registerBackendRoutes } from '../../src/convex/integrations/http'

function makeHttp() {
  return { route: vi.fn() } as never
}

function makeOptions() {
  return {
    auth: {
      authComponent: { registerRoutes: vi.fn() },
      createAuth: () => {},
    },
    billing: {
      webhookHandler: vi.fn(async () => new Response('accepted', { status: 202 })),
    },
    email: {
      webhookHandler: vi.fn(async () => new Response('ok')),
    },
    ai: {
      httpHandler: vi.fn(),
      corsOrigin: 'https://app.test',
    },
  }
}

function routeCalls(http: unknown): Array<{ path: string, method: string }> {
  return (http as { route: ReturnType<typeof vi.fn> }).route.mock.calls.map(([spec]) => spec as { path: string, method: string })
}

describe('registerBackendRoutes', () => {
  it('mounts auth, the guarded webhooks, and the AI stream in one call with generic default paths', () => {
    const http = makeHttp()
    const options = makeOptions()

    registerBackendRoutes(http, options)

    expect(options.auth.authComponent.registerRoutes).toHaveBeenCalledWith(http, options.auth.createAuth)
    const calls = routeCalls(http)
    expect(calls).toContainEqual(expect.objectContaining({ path: '/billing/events', method: 'POST' }))
    expect(calls).toContainEqual(expect.objectContaining({ path: '/email/events', method: 'POST' }))
    expect(calls).toContainEqual(expect.objectContaining({ path: '/ai/stream', method: 'POST' }))
    expect(calls).toContainEqual(expect.objectContaining({ path: '/ai/stream', method: 'OPTIONS' }))
    expect(calls).not.toContainEqual(expect.objectContaining({ path: '/mcp/exchange' }))
  })

  it('takes every part: one left out is a type error, and a named one before anything mounts', () => {
    const http = makeHttp()
    const { auth } = makeOptions()
    // @ts-expect-error billing, email and ai are required
    expect(() => registerBackendRoutes(http, { auth })).toThrow('registerBackendRoutes is missing billing (from setupBilling), email (from setupEmail), ai (from setupAi).')
    expect(auth.authComponent.registerRoutes).not.toHaveBeenCalled()
    expect(routeCalls(http)).toEqual([])
  })

  // An import cycle leaves an export undefined while http.ts loads: the part
  // is passed, and still missing.
  it('names a part that arrived undefined, such as an auth.ts without its authComponent', () => {
    const options = makeOptions()
    expect(() => registerBackendRoutes(makeHttp(), { ...options, auth: { ...options.auth, authComponent: undefined as never } }))
      .toThrow(/missing auth \(setupAuth's authComponent and createAuth\)\. /)
    expect(() => registerBackendRoutes(makeHttp(), { ...options, email: undefined as never }))
      .toThrow(/missing email \(from setupEmail\)\. .*import cycle/)
  })

  it('the route paths are configurable', () => {
    const http = makeHttp()
    const options = makeOptions()

    registerBackendRoutes(http, { ...options, billingPath: '/hooks/billing', emailPath: '/hooks/email', aiPath: '/hooks/ai' })

    const calls = routeCalls(http)
    expect(calls).toContainEqual(expect.objectContaining({ path: '/hooks/billing', method: 'POST' }))
    expect(calls).toContainEqual(expect.objectContaining({ path: '/hooks/email' }))
    expect(calls).toContainEqual(expect.objectContaining({ path: '/hooks/ai', method: 'POST' }))
  })
})
