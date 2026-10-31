import { afterEach, describe, expect, it } from 'vitest'
import { defineBackendAuthConfig } from '../../src/convex/auth.config'

const originalConvexSiteUrl = process.env.CONVEX_SITE_URL

afterEach(() => {
  if (originalConvexSiteUrl === undefined) {
    delete process.env.CONVEX_SITE_URL
    return
  }

  process.env.CONVEX_SITE_URL = originalConvexSiteUrl
})

describe('defineBackendAuthConfig', () => {
  it('uses the default auth route', () => {
    process.env.CONVEX_SITE_URL = 'https://example.convex.site'

    const authConfig = defineBackendAuthConfig()

    expect(authConfig.providers).toHaveLength(1)
    expect(authConfig.providers[0]).toMatchObject({
      type: 'customJwt',
      issuer: 'https://example.convex.site',
      applicationID: 'convex',
      algorithm: 'RS256',
      jwks: 'https://example.convex.site/api/auth/convex/jwks',
    })
  })

  it('serves the JWKS under the auth route of the generated paths', () => {
    process.env.CONVEX_SITE_URL = 'https://example.convex.site'

    const authConfig = defineBackendAuthConfig({
      paths: { authRoute: '/internal/auth' },
    })

    expect(authConfig.providers[0]).toMatchObject({
      jwks: 'https://example.convex.site/internal/auth/convex/jwks',
    })
  })

  it('refuses the removed basePath, and a path that is not one', () => {
    expect(() => defineBackendAuthConfig({ basePath: '/auth' } as never)).toThrow(/backend\.authRoute/)
    expect(() => defineBackendAuthConfig({ paths: { authRoute: 'auth' } })).toThrow(/paths\.authRoute is "auth"/)
  })
})
