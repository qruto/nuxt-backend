import { describe, expect, it } from 'vitest'
import { authOptionProblems, authProviderOf, baseAuthOverrides, configuredAuthOption, pagesOff } from '../../src/nuxt/auth-provider'
import { BACKEND_PAGE_DEFS } from '../../src/pages'

// Which auth an app runs, read the way the dependency phase and setup both
// read it, and what each provider asks of the base module.

describe('authProviderOf', () => {
  it('is Convex Auth only when the option says so', () => {
    expect(authProviderOf('convex-auth')).toBe('convex-auth')
    expect(authProviderOf('better-auth')).toBe('better-auth')
    expect(authProviderOf(undefined)).toBe('better-auth')
  })
})

describe('authOptionProblems', () => {
  it('accepts the two providers and no value', () => {
    expect([undefined, 'better-auth', 'convex-auth'].flatMap(authOptionProblems)).toEqual([])
  })

  it('names any other value, whatever its type', () => {
    expect(authOptionProblems('clerk')[0]).toContain('`"clerk"`')
    expect(authOptionProblems(() => {})[0]).toContain('`function`')
  })
})

describe('configuredAuthOption', () => {
  it('reads the inline option first, as Nuxt merges it over the config key', () => {
    expect(configuredAuthOption({ backend: { auth: 'better-auth' }, modules: [['nuxt-backend', { auth: 'convex-auth' }]] })).toBe('convex-auth')
  })

  it('falls back to the config key, past modules of other names and inline options without one', () => {
    expect(configuredAuthOption({ backend: { auth: 'convex-auth' }, modules: ['nuxt-backend', ['other', { auth: 'better-auth' }], ['nuxt-backend', {}]] })).toBe('convex-auth')
    expect(configuredAuthOption({})).toBeUndefined()
  })
})

describe('baseAuthOverrides', () => {
  const betterAuth = { authClient: '/client', loginPath: '/login' }

  it('keeps Better Auth with Polar, and Convex Auth off', () => {
    expect(baseAuthOverrides('better-auth', { betterAuth, loginPath: '/login' })).toEqual({ betterAuth, convexAuth: false, polar: true })
  })

  it('turns Convex Auth on at the sign-in path, with Better Auth and Polar off', () => {
    expect(baseAuthOverrides('convex-auth', { betterAuth, loginPath: '/sign-in' })).toEqual({ betterAuth: false, convexAuth: { loginPath: '/sign-in' }, polar: false })
  })
})

describe('pagesOff', () => {
  it('turns every ready-made page off', () => {
    expect(pagesOff()).toEqual(Object.fromEntries(BACKEND_PAGE_DEFS.map(def => [def.key, false])))
  })
})
