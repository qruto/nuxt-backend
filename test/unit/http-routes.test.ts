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
      provider: { registerRoutes: vi.fn() },
      webhookEvents: {} as never,
    },
    email: {
      webhookHandler: vi.fn(async () => new Response('ok')),
    },
  }
}

describe('registerBackendRoutes', () => {
  it('mounts auth, billing, and email in one call with generic default paths', () => {
    const http = makeHttp()
    const options = makeOptions()

    registerBackendRoutes(http, options as never)

    expect(options.auth.authComponent.registerRoutes).toHaveBeenCalledWith(http, options.auth.createAuth)
    expect(options.billing.provider.registerRoutes).toHaveBeenCalledWith(http, {
      path: '/billing/events',
      events: options.billing.webhookEvents,
    })
    expect((http as { route: ReturnType<typeof vi.fn> }).route).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/email/events', method: 'POST' }),
    )
  })

  it('billing and email are optional', () => {
    const http = makeHttp()
    const options = makeOptions()

    registerBackendRoutes(http, { auth: options.auth } as never)

    expect(options.auth.authComponent.registerRoutes).toHaveBeenCalled()
    expect((http as { route: ReturnType<typeof vi.fn> }).route).not.toHaveBeenCalled()
  })

  it('the webhook route paths are configurable', () => {
    const http = makeHttp()
    const options = makeOptions()

    registerBackendRoutes(http, { ...options, billingPath: '/hooks/billing', emailPath: '/hooks/email' } as never)

    expect(options.billing.provider.registerRoutes).toHaveBeenCalledWith(http, {
      path: '/hooks/billing',
      events: options.billing.webhookEvents,
    })
    expect((http as { route: ReturnType<typeof vi.fn> }).route).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/hooks/email' }),
    )
  })
})
