import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAuthOptions } from '../../src/convex/client/better-auth-options'
import { isLocalOrigin } from '../../src/convex/local-origins'

// A development BACKEND_ENVIRONMENT trusts the origins a dev
// server on this machine answers on: loopback on any port, and the
// `.localhost` names a local HTTPS proxy serves (`pnpm try` runs the
// playground at https://nuxt-backend.localhost), over https only, since a
// name under .localhost could reach a resolver. Nothing else, whatever it
// looks like.

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isLocalOrigin', () => {
  it.each([
    'http://localhost:3000',
    'https://localhost',
    'http://127.0.0.1:4000',
    'http://[::1]:3000',
    'https://nuxt-backend.localhost',
    'https://starter.localhost',
    'https://api.nuxt-backend.localhost',
    'https://my-app.localhost:1355',
    'https://Nuxt-Backend.LOCALHOST',
  ])('trusts %s', (origin) => {
    expect(isLocalOrigin(origin)).toBe(true)
  })

  it.each([
    '',
    'null',
    'https://example.com',
    'https://localhost.example.com',
    'https://evil.com/.localhost',
    'https://nuxt-backend.localhost.evil.com',
    'https://nuxt-backend.local',
    'https://app.localhost/path',
    'ftp://app.localhost',
    'https://-bad.localhost',
    'https://a..b.localhost',
    'https://.localhost',
    'http://127.0.0.2:3000',
    'https://nuxt-backend.localhost:123456',
    // A name under .localhost over plain http: only a certificate proves it is this machine.
    'http://nuxt-backend.localhost',
    'http://my-app.localhost:1355',
  ])('refuses %j', (origin) => {
    expect(isLocalOrigin(origin)).toBe(false)
  })
})

/** The trusted origins auth builds for one request's Origin header. */
async function trustedFor(origin: string): Promise<string[]> {
  const trusted = buildAuthOptions({} as never, { authOptions: { trustedOrigins: ['https://app.example.com'] } }).trustedOrigins
  if (typeof trusted !== 'function') return trusted ?? []
  return await trusted(new Request('https://app.example.com/api/auth/ok', { headers: { origin } })) as string[]
}

describe('auth trusted origins', () => {
  it('adds a .localhost origin of the request only on a development BACKEND_ENVIRONMENT', async () => {
    expect(await trustedFor('https://nuxt-backend.localhost')).toEqual(['https://app.example.com'])
    vi.stubEnv('BACKEND_ENVIRONMENT', 'development')
    expect(await trustedFor('https://nuxt-backend.localhost')).toEqual(['https://app.example.com', 'https://nuxt-backend.localhost'])
    expect(await trustedFor('http://localhost:3000')).toEqual(['https://app.example.com', 'http://localhost:3000'])
  })

  it('never adds an origin that is not local, with the switch on', async () => {
    vi.stubEnv('BACKEND_ENVIRONMENT', 'development')
    expect(await trustedFor('https://nuxt-backend.localhost.evil.com')).toEqual(['https://app.example.com'])
    expect(await trustedFor('https://nuxt-backend.local')).toEqual(['https://app.example.com'])
  })
})
