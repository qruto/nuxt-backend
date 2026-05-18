import { describe, expect, it, vi } from 'vitest'
import type { AnyComponents } from 'convex/server'
import * as clientBridge from '../../src/convex/client'

const fakeComponent = {
  adapter: {
    findOne: {} as never,
    updateOne: {} as never,
  },
} as never

const fakeAppComponent = fakeComponent as unknown as AnyComponents[string]

describe('Convex component client bridge', () => {
  it('creates Better Auth options without requiring runtime env at import time', () => {
    const previousSiteUrl = process.env.SITE_URL

    try {
      delete process.env.SITE_URL

      const options = clientBridge.createBetterAuthOptions({} as never)
      expect(options.database).toBeDefined()
      expect(options.basePath).toBe('/api/auth')
    }
    finally {
      if (previousSiteUrl === undefined) {
        delete process.env.SITE_URL
      }
      else {
        process.env.SITE_URL = previousSiteUrl
      }
    }
  })

  it('exposes a ready-made auth API remount helper', () => {
    const queryBuilder = vi.fn(definition => definition)

    const authApi = clientBridge.makeAuthApi(fakeAppComponent, queryBuilder as never)

    expect(queryBuilder).toHaveBeenCalledTimes(1)
    expect(queryBuilder).toHaveBeenCalledWith(expect.objectContaining({ args: {} }))
    expect(authApi).toHaveProperty('getCurrentUser')
  })

  it('keeps setupAuth as the convenience composition of the client patterns', () => {
    const queryBuilder = vi.fn(definition => definition)

    const authSetup = clientBridge.setupAuth(fakeAppComponent, queryBuilder as never)

    expect(typeof authSetup.createAuth).toBe('function')
    expect(typeof authSetup.createAuthOptions).toBe('function')
    expect(authSetup).toHaveProperty('options')
    expect(authSetup).toHaveProperty('authComponent')
    expect(authSetup).toHaveProperty('getCurrentUser')
  })
})
