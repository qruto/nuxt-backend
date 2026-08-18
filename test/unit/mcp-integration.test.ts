import { describe, expect, it, vi } from 'vitest'
import { setupMcp } from '../../src/convex/integrations/mcp'
import { tables } from '../../src/convex/components/backend/schema'

const ctx = {} as never

interface FakeAuthState {
  session?: { userId?: string | null, clientId?: string | null, scopes?: string | null } | null
  user?: Record<string, unknown> | null
  membership?: { organizationId?: string } | null
}

function fakeAuth(state: FakeAuthState) {
  const signJWT = vi.fn(async (_args: { body: { payload: Record<string, unknown> } }) => ({ token: 'jwt-token' }))
  const auth = {
    api: {
      getMcpSession: vi.fn(async () => state.session ?? null),
      signJWT,
    },
    $context: Promise.resolve({
      adapter: {
        findOne: vi.fn(async ({ model }: { model: string }) => {
          if (model === 'user') return state.user ?? null
          if (model === 'member') return state.membership ?? null
          return null
        }),
      },
    }),
  }
  return { auth, signJWT }
}

function exchangeRequest(token?: string) {
  return new Request('https://site.test/mcp/exchange', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

describe('setupMcp token exchange', () => {
  const validState: FakeAuthState = {
    session: { userId: 'user-1', clientId: 'client-1', scopes: 'openid profile billing:read' },
    user: { name: 'Ada', email: 'ada@example.com', emailVerified: true, role: 'admin' },
    membership: { organizationId: 'org-1' },
  }

  it('mints a five-minute convex JWT with session-aligned claims', async () => {
    const previousSiteUrl = process.env.CONVEX_SITE_URL
    process.env.CONVEX_SITE_URL = 'https://deployment.test.site'
    try {
      const { auth, signJWT } = fakeAuth(validState)
      const { exchangeHandler } = setupMcp({ createAuth: () => auth })

      const response = await exchangeHandler(ctx, exchangeRequest('opaque'))

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      const body = await response.json() as { token: string, expiresIn: number, session: Record<string, unknown> }
      expect(body.token).toBe('jwt-token')
      expect(body.expiresIn).toBe(300)
      expect(body.session).toEqual({
        userId: 'user-1',
        clientId: 'client-1',
        scopes: ['openid', 'profile', 'billing:read'],
      })

      const payload = signJWT.mock.calls[0]![0].body.payload
      expect(payload.sub).toBe('user-1')
      expect(payload.aud).toBe('convex')
      expect(payload.iss).toBe('https://deployment.test.site')
      expect(payload.activeOrganizationId).toBe('org-1')
      expect(payload.email).toBe('ada@example.com')
      expect(payload.role).toBe('admin')
      expect(payload.scopes).toEqual(['openid', 'profile', 'billing:read'])
      expect((payload.exp as number) - (payload.iat as number)).toBe(300)
    }
    finally {
      if (previousSiteUrl === undefined) delete process.env.CONVEX_SITE_URL
      else process.env.CONVEX_SITE_URL = previousSiteUrl
    }
  })

  it('rejects a missing or unknown bearer with a 401 challenge', async () => {
    const { auth } = fakeAuth({ session: null })
    const { exchangeHandler } = setupMcp({ createAuth: () => auth })

    const missing = await exchangeHandler(ctx, exchangeRequest())
    expect(missing.status).toBe(401)
    expect(missing.headers.get('WWW-Authenticate')).toBe('Bearer error="invalid_token"')

    const unknown = await exchangeHandler(ctx, exchangeRequest('nope'))
    expect(unknown.status).toBe(401)
    expect(await unknown.json()).toEqual({ error: 'invalid_token' })
  })

  it('treats tokens of deleted or banned accounts as invalid', async () => {
    const { auth } = fakeAuth({ ...validState, user: null })
    const { exchangeHandler } = setupMcp({ createAuth: () => auth })
    expect((await exchangeHandler(ctx, exchangeRequest('opaque'))).status).toBe(401)

    const banned = fakeAuth({ ...validState, user: { ...validState.user, banned: true } })
    const { exchangeHandler: bannedHandler } = setupMcp({ createAuth: () => banned.auth })
    expect((await bannedHandler(ctx, exchangeRequest('opaque'))).status).toBe(401)
  })

  it('rate limits per client+user through the mcp named limit', async () => {
    const { auth } = fakeAuth(validState)
    const limit = vi.fn(async () => ({ ok: false, retryAfter: 2500 }))
    const { exchangeHandler } = setupMcp({ createAuth: () => auth, rateLimiter: { limit } })

    const response = await exchangeHandler(ctx, exchangeRequest('opaque'))

    expect(limit).toHaveBeenCalledWith(ctx, 'mcp', { key: 'client-1:user-1' })
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('3')
  })

  it('answers 404 when the provider is disabled', async () => {
    const { auth } = fakeAuth(validState)
    const { exchangeHandler } = setupMcp({ createAuth: () => auth, enabled: false })

    const response = await exchangeHandler(ctx, exchangeRequest('opaque'))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'mcp_disabled' })
  })
})

describe('oidc provider tables parity', () => {
  it('matches the field lists better-auth derives for the default plugin set', async () => {
    // Same derivation path as the component adapter (adapter.ts): the mcp
    // plugin's OIDC schema decides the tables; this pins ours to it.
    const { getAuthTables } = await import('better-auth/db')
    const { passkey } = await import('@better-auth/passkey')
    const { admin, emailOTP, jwt, mcp, organization } = await import('better-auth/plugins')
    const { convex } = await import('@convex-dev/better-auth/plugins')
    const derived = getAuthTables({
      rateLimit: { storage: 'database' },
      plugins: [
        convex({ authConfig: { providers: [{ applicationID: 'convex', domain: '' }] } }),
        emailOTP({ sendVerificationOTP: async () => {} }),
        passkey(),
        admin(),
        organization(),
        mcp({ loginPage: '/login' }),
        jwt(),
      ],
    }) as Record<string, { fields: Record<string, unknown> }>

    for (const model of ['oauthApplication', 'oauthAccessToken', 'oauthConsent'] as const) {
      const table = tables[model] as unknown as { validator: { fields: Record<string, unknown> } }
      expect(Object.keys(table.validator.fields).sort(), `${model} fields`).toEqual(
        Object.keys(derived[model]!.fields).sort(),
      )
    }
  })

  it('indexes the adapter lookups the OAuth flows make', () => {
    const indexNames = (model: 'oauthApplication' | 'oauthAccessToken' | 'oauthConsent') =>
      (tables[model] as unknown as { export: () => { indexes: Array<{ indexDescriptor: string }> } })
        .export().indexes.map(index => index.indexDescriptor)

    // getMcpSession resolves opaque bearers by accessToken; the token grant
    // rotates by refreshToken; clients resolve by clientId.
    expect(indexNames('oauthAccessToken')).toEqual(expect.arrayContaining(['accessToken', 'refreshToken', 'clientId', 'userId']))
    expect(indexNames('oauthApplication')).toEqual(expect.arrayContaining(['clientId']))
    expect(indexNames('oauthConsent')).toEqual(expect.arrayContaining(['clientId_userId']))
  })
})
