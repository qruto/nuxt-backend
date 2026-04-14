import { afterEach, describe, expect, it } from 'vitest'
import { defineBackendAuthConfig } from '../../src/convex-component/authConfig'

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

  it('uses a custom auth route when provided', () => {
    process.env.CONVEX_SITE_URL = 'https://example.convex.site'

    const authConfig = defineBackendAuthConfig({
      basePath: '/internal/auth',
    })

    expect(authConfig.providers[0]).toMatchObject({
      jwks: 'https://example.convex.site/internal/auth/convex/jwks',
    })
  })
})
