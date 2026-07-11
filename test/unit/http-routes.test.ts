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
      polar: { registerRoutes: vi.fn() },
      webhookEvents: {} as never,
    },
    email: {
      webhookHandler: vi.fn(async () => new Response('ok')),
    },
  }
}

describe('registerBackendRoutes', () => {
  it('mounts auth, billing, and email in one call', () => {
    const http = makeHttp()
    const options = makeOptions()

    registerBackendRoutes(http, options as never)

    expect(options.auth.authComponent.registerRoutes).toHaveBeenCalledWith(http, options.auth.createAuth)
    expect(options.billing.polar.registerRoutes).toHaveBeenCalledWith(http, { events: options.billing.webhookEvents })
    expect((http as { route: ReturnType<typeof vi.fn> }).route).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/resend-webhook', method: 'POST' }),
    )
  })

  it('billing and email are optional', () => {
    const http = makeHttp()
    const options = makeOptions()

    registerBackendRoutes(http, { auth: options.auth } as never)

    expect(options.auth.authComponent.registerRoutes).toHaveBeenCalled()
    expect((http as { route: ReturnType<typeof vi.fn> }).route).not.toHaveBeenCalled()
  })

  it('the email route path is configurable', () => {
    const http = makeHttp()
    const options = makeOptions()

    registerBackendRoutes(http, { ...options, emailPath: '/hooks/resend' } as never)

    expect((http as { route: ReturnType<typeof vi.fn> }).route).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/hooks/resend' }),
    )
  })
})
