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
    mcp: {
      exchangeHandler: vi.fn(async () => Response.json({ token: 't' })),
    },
  }
}

function routeCalls(http: unknown): Array<{ path: string, method: string }> {
  return (http as { route: ReturnType<typeof vi.fn> }).route.mock.calls.map(([spec]) => spec as { path: string, method: string })
}

describe('registerBackendRoutes', () => {
  it('mounts auth, the guarded webhooks, the AI stream, and the agent exchange in one call with generic default paths', () => {
    const http = makeHttp()
    const options = makeOptions()

    registerBackendRoutes(http, options as never)

    expect(options.auth.authComponent.registerRoutes).toHaveBeenCalledWith(http, options.auth.createAuth)
    const calls = routeCalls(http)
    expect(calls).toContainEqual(expect.objectContaining({ path: '/billing/events', method: 'POST' }))
    expect(calls).toContainEqual(expect.objectContaining({ path: '/email/events', method: 'POST' }))
    expect(calls).toContainEqual(expect.objectContaining({ path: '/ai/stream', method: 'POST' }))
    expect(calls).toContainEqual(expect.objectContaining({ path: '/ai/stream', method: 'OPTIONS' }))
    expect(calls).toContainEqual(expect.objectContaining({ path: '/mcp/exchange', method: 'POST' }))
  })

  it('billing, email, ai, and mcp are optional', () => {
    const http = makeHttp()
    const options = makeOptions()

    registerBackendRoutes(http, { auth: options.auth } as never)

    expect(options.auth.authComponent.registerRoutes).toHaveBeenCalled()
    expect((http as { route: ReturnType<typeof vi.fn> }).route).not.toHaveBeenCalled()
  })

  it('the route paths are configurable', () => {
    const http = makeHttp()
    const options = makeOptions()

    registerBackendRoutes(http, { ...options, billingPath: '/hooks/billing', emailPath: '/hooks/email', aiPath: '/hooks/ai', mcpExchangePath: '/hooks/mcp' } as never)

    const calls = routeCalls(http)
    expect(calls).toContainEqual(expect.objectContaining({ path: '/hooks/billing', method: 'POST' }))
    expect(calls).toContainEqual(expect.objectContaining({ path: '/hooks/email' }))
    expect(calls).toContainEqual(expect.objectContaining({ path: '/hooks/ai', method: 'POST' }))
    expect(calls).toContainEqual(expect.objectContaining({ path: '/hooks/mcp', method: 'POST' }))
  })
})
