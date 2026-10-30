import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import backendUrlPlugin from '../../src/runtime/server/backend-url'

// The server render's auth-token prefetch needs the HTTP routes' origin
// ("Failed to prefetch auth token for SSR" without it). A server that
// starts with only NUXT_PUBLIC_BACKEND_URL gets both of the base module's
// URLs from it.

const NAMES = ['NUXT_PUBLIC_BACKEND_URL', 'NUXT_PUBLIC_CONVEX_URL', 'NUXT_PUBLIC_CONVEX_SITE_URL']

beforeEach(() => {
  for (const name of NAMES) vi.stubEnv(name, undefined)
})

afterEach(() => vi.unstubAllEnvs())

describe('the backend URL plugin', () => {
  it('derives the client URL and the .site twin from NUXT_PUBLIC_BACKEND_URL alone', () => {
    vi.stubEnv('NUXT_PUBLIC_BACKEND_URL', 'https://happy-otter-123.convex.cloud/')
    backendUrlPlugin()
    expect(process.env.NUXT_PUBLIC_CONVEX_URL).toBe('https://happy-otter-123.convex.cloud')
    expect(process.env.NUXT_PUBLIC_CONVEX_SITE_URL).toBe('https://happy-otter-123.convex.site')
  })

  it('keeps a name the base module owns: a custom domain in front of the HTTP routes wins', () => {
    vi.stubEnv('NUXT_PUBLIC_BACKEND_URL', 'https://happy-otter-123.convex.cloud')
    vi.stubEnv('NUXT_PUBLIC_CONVEX_URL', 'https://api.example.com')
    vi.stubEnv('NUXT_PUBLIC_CONVEX_SITE_URL', 'https://auth.example.com')
    backendUrlPlugin()
    expect(process.env.NUXT_PUBLIC_CONVEX_URL).toBe('https://api.example.com')
    expect(process.env.NUXT_PUBLIC_CONVEX_SITE_URL).toBe('https://auth.example.com')
  })

  it('derives the site from the base module\'s client URL when only that one is set', () => {
    vi.stubEnv('NUXT_PUBLIC_CONVEX_URL', 'https://calm-fox-9.convex.cloud')
    backendUrlPlugin()
    expect(process.env.NUXT_PUBLIC_CONVEX_SITE_URL).toBe('https://calm-fox-9.convex.site')
  })

  it('sets no site URL for a client URL it cannot map: a self-hosted backend names its own', () => {
    vi.stubEnv('NUXT_PUBLIC_BACKEND_URL', 'https://convex.internal.example')
    backendUrlPlugin()
    expect(process.env.NUXT_PUBLIC_CONVEX_URL).toBe('https://convex.internal.example')
    expect(process.env.NUXT_PUBLIC_CONVEX_SITE_URL).toBeUndefined()
  })

  it('sets nothing without a URL', () => {
    backendUrlPlugin()
    for (const name of NAMES) expect(process.env[name], name).toBeUndefined()
  })
})
