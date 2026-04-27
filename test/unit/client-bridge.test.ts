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
  it('fails fast when SITE_URL is missing', () => {
    const previousSiteUrl = process.env.SITE_URL

    try {
      delete process.env.SITE_URL

      expect(() => clientBridge.createBetterAuth({} as never)).toThrow(
        'SITE_URL environment variable is required to configure Better Auth.',
      )
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
    expect(authSetup).toHaveProperty('authComponent')
    expect(authSetup).toHaveProperty('getCurrentUser')
  })
})
