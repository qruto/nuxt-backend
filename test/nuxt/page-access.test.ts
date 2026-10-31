import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, onScopeDispose, ref } from 'vue'
import type { RouteLocationNormalized } from 'vue-router'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useNuxtApp, useRuntimeConfig } from '#imports'

// The page guard, `definePageMeta({ auth: { role, workspace, feature, hidden } })`:
// its rules read off the matched routes, the decision for a signed-in person,
// the 403 an error page renders, and the global middleware in the browser,
// on the test's own Nuxt app, with the session and the auth client standing
// in. The server's subject is checked here against a stubbed token and
// fetch; the server render's whole leg runs in the starter's production
// build (test/e2e/starter.test.ts).

/** The session the auth client holds, and the calls the guard makes on it. */
const session = ref<{ data: unknown, isPending: boolean }>({ data: null, isPending: false })
const getActiveMember = vi.fn(async (): Promise<{ data: unknown }> => ({ data: { role: 'member' } }))
const authClient = { organization: { getActiveMember } }
/** The session store's subscriptions still open: Better Auth's `useSession` drops one when its scope stops. */
let sessionListeners = 0
const useBetterAuth = vi.fn(() => {
  sessionListeners++
  onScopeDispose(() => sessionListeners--)
  return {
    session,
    user: computed(() => (session.value.data as { user?: unknown } | null)?.user ?? null),
    client: authClient,
  }
})
vi.mock('nuxt-convex-module/better-auth/client', () => ({ authClient, useBetterAuth }))

// The server's token for the request: what `backendAuth(event).getToken()` answers.
const getToken = vi.fn(async (): Promise<string | null> => null)
// The plan's features, as the deployment answers `billing:getFeatures` for the person.
const features = ref<{ benefits: Array<{ metadata?: Record<string, unknown> }> } | null>({ benefits: [] })
const fetchAuthQuery = vi.fn(async () => features.value)
vi.mock('nuxt-convex-module/better-auth/server', () => ({ convexAuth: () => ({ getToken, fetchAuthQuery }) }))
const convexQuery = vi.fn(async () => features.value)
vi.mock('nuxt-convex-module/client', async original => ({
  ...await original<Record<string, unknown>>(),
  useConvex: () => ({ query: convexQuery }),
}))

const { navigateTo } = vi.hoisted(() => ({ navigateTo: vi.fn((to: unknown) => to) }))
mockNuxtImport('navigateTo', () => navigateTo)

const { pageAccessRules } = await import('../../src/runtime/vue/utils/page-rules')
const { accessDenial, accessDeniedError, accessDeniedData, hiddenPageError, sitePath } = await import('../../src/runtime/vue/utils/page-access')
const { serverSubject, tokenClaims } = await import('../../src/runtime/vue/utils/page-guard')
const { default: middleware } = await import('../../src/runtime/vue/middleware/page-access')

/** A route as the router hands it to a middleware: the matched records' meta, a parent's first. */
function route(fullPath: string, ...metas: Array<Record<string, unknown>>): RouteLocationNormalized {
  const url = new URL(fullPath, 'http://route.invalid')
  return { path: url.pathname, fullPath, query: {}, hash: '', params: {}, name: undefined, meta: Object.assign({}, ...metas), matched: metas.map(meta => ({ meta })), redirectedFrom: undefined } as unknown as RouteLocationNormalized
}

/** A signed-in person with this role field (several comma-separated). */
const signedIn = (role?: string, extra: Record<string, unknown> = {}) => {
  session.value = { data: { session: { id: 's1' }, user: { id: 'u1', email: 'ada@example.com', ...(role === undefined ? {} : { role }), ...extra } }, isPending: false }
}

/** Run the middleware in the app's context, as the router would. */
const guard = (to: RouteLocationNormalized) => useNuxtApp().runWithContext(() => middleware(to, route('/')))

beforeEach(() => {
  vi.clearAllMocks()
  session.value = { data: null, isPending: false }
  getActiveMember.mockImplementation(async () => ({ data: { role: 'member' } }))
  features.value = { benefits: [] }
  const nuxtApp = useNuxtApp()
  nuxtApp.isHydrating = false
  const config = useRuntimeConfig().public as Record<string, unknown>
  config.backend = { ...(config.backend as object), pages: { login: '/signin' }, authRoute: '/api/auth' }
})

describe('the rules a page declares', () => {
  it('gathers every matched record\'s rules, a parent\'s first, and skips a page without', () => {
    expect(pageAccessRules(route('/about', {}))).toEqual([])
    expect(pageAccessRules(route('/team/admin', { auth: { workspace: 'owner' } }, {}, { auth: { role: 'admin' } }))).toEqual([{ workspace: 'owner' }, { role: 'admin' }])
    expect(pageAccessRules(route('/x', { auth: false }))).toEqual([])
  })

  it('fails closed on rules that are not an object: `true` asks for a sign-in, anything else refuses', async () => {
    expect(pageAccessRules(route('/x', { auth: true }))).toEqual([{}])
    const admin = { role: 'admin', banned: false, workspaceRole: async () => 'owner', hasFeature: async () => true }
    for (const auth of ['admin', 1, ['admin']]) {
      const rules = pageAccessRules(route('/x', { auth }))
      expect(rules).toHaveLength(1)
      expect(await accessDenial(rules, admin), JSON.stringify(auth)).toBe('role')
    }
  })
})

describe('the decision for a signed-in person', () => {
  const subject = (role: string, more: { banned?: boolean, workspaceRole?: string | null, features?: string[] } = {}) => {
    const workspaceRole = vi.fn(async () => more.workspaceRole ?? null)
    const hasFeature = vi.fn(async (feature: string) => (more.features ?? []).includes(feature))
    return { workspaceRole, hasFeature, value: { role, banned: more.banned ?? false, workspaceRole, hasFeature } }
  }

  it('lets in anyone signed in when the page names no rule', async () => {
    expect(await accessDenial([{}], subject('user').value)).toBeNull()
  })

  it('reads an app-wide role the way hasRole does: any of the page\'s, any of the person\'s', async () => {
    expect(await accessDenial([{ role: 'admin' }], subject('user').value)).toBe('role')
    expect(await accessDenial([{ role: 'admin' }], subject('admin').value)).toBeNull()
    expect(await accessDenial([{ role: ['editor', 'admin'] }], subject('user, editor').value)).toBeNull()
    expect(await accessDenial([{ role: [] }], subject('admin').value)).toBe('role')
  })

  it('reads the plan\'s features only for a page that asks for one, after the workspace', async () => {
    const { value, hasFeature } = subject('user', { workspaceRole: 'member', features: ['hd_export'] })
    expect(await accessDenial([{ role: 'user' }], value)).toBeNull()
    expect(hasFeature).not.toHaveBeenCalled()
    expect(await accessDenial([{ workspace: true, feature: 'hd_export' }], value)).toBeNull()
    expect(await accessDenial([{ feature: 'sso' }], value)).toBe('feature')
    expect(await accessDenial([{ feature: '' }], value)).toBe('feature')
    expect(await accessDenial([{ workspace: true, feature: 'hd_export' }], subject('user', { features: ['hd_export'] }).value)).toBe('workspace')
  })

  it('reads the workspace role only for a page that asks for one, and refuses without a workspace', async () => {
    const { value, workspaceRole } = subject('user', { workspaceRole: 'admin' })
    expect(await accessDenial([{ role: 'user' }], value)).toBeNull()
    expect(workspaceRole).not.toHaveBeenCalled()
    expect(await accessDenial([{ workspace: ['owner', 'admin'] }], value)).toBeNull()
    expect(await accessDenial([{ workspace: true }], value)).toBeNull()
    expect(await accessDenial([{ workspace: 'owner' }], value)).toBe('workspace')
    expect(await accessDenial([{ workspace: 'member' }], subject('user', { workspaceRole: null }).value)).toBe('workspace')
    expect(await accessDenial([{ workspace: true }], subject('user', { workspaceRole: null }).value)).toBe('workspace')
  })

  it('holds every matched record\'s rules: a parent\'s too', async () => {
    const { value } = subject('admin', { workspaceRole: 'member' })
    expect(await accessDenial([{ role: 'admin' }, { workspace: 'owner' }], value)).toBe('workspace')
    expect(await accessDenial([{ workspace: 'member' }, { role: 'editor' }], value)).toBe('role')
  })

  it('refuses a banned account any page with rules', async () => {
    expect(await accessDenial([{}], subject('admin', { banned: true }).value)).toBe('banned')
  })

  it('refuses a page whose rules name a key that is no rule, rather than open it to everyone signed in', async () => {
    // Development names the key in a warning.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { value } = subject('admin', { workspaceRole: 'owner' })
      for (const rules of [{ roles: 'admin' }, { workspaceRole: 'owner' }, { role: 'admin', permission: {} }]) {
        expect(await accessDenial([rules as never], value), JSON.stringify(rules)).toBe('role')
      }
      expect(await accessDenial([{}, { roles: 'admin' } as never], value)).toBe('role')
    }
    finally {
      warn.mockRestore()
    }
  })
})

describe('the 403', () => {
  it('is fatal, so the error page renders on a navigation too, and names the rule and the page, never the role', () => {
    const error = accessDeniedError('role', '/admin?tab=users')
    expect(error.statusCode).toBe(403)
    expect(error.fatal).toBe(true)
    expect(error.data).toEqual({ reason: 'role', path: '/admin?tab=users' })
  })

  it('reads back from an error page\'s error, as an object or as the JSON a server render may hand over', () => {
    expect(accessDeniedData({ data: { reason: 'workspace', path: '/team' } })).toEqual({ reason: 'workspace', path: '/team' })
    expect(accessDeniedData({ data: JSON.stringify({ reason: 'banned', path: '/x' }) })).toEqual({ reason: 'banned', path: '/x' })
    expect(accessDeniedData({ statusCode: 403 })).toBeUndefined()
    expect(accessDeniedData({ data: { reason: 'admin', path: '/x' } })).toBeUndefined()
    expect(accessDeniedData({ data: '{not json' })).toBeUndefined()
    expect(accessDeniedData(null)).toBeUndefined()
  })

  it('keeps the way back on this site', () => {
    expect(accessDeniedData({ data: { reason: 'role', path: 'https://evil.example/' } })?.path).toBe('/')
    expect(accessDeniedData({ data: { reason: 'role', path: '//evil.example/' } })?.path).toBe('/')
    // A browser reads a backslash as a slash: `/\\evil.example` is `//evil.example`.
    expect(accessDeniedData({ data: { reason: 'role', path: '/\\evil.example/' } })?.path).toBe('/')
    expect(accessDeniedData({ data: { reason: 'role', path: '/\\/evil.example/' } })?.path).toBe('/')
    expect(accessDeniedData({ data: { reason: 'role', path: '/admin?tab=users#top' } })?.path).toBe('/admin?tab=users#top')
    expect(sitePath('/a\\b')).toBe('/a\\b')
    expect(sitePath('admin')).toBeUndefined()
  })
})

describe('the server token\'s claims', () => {
  const encode = (value: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  it('reads the payload of a JWT, non-ASCII names included', () => {
    expect(tokenClaims(`h.${encode({ role: 'admin', banned: false, name: 'Zoë Ådahl ✓' })}.s`)).toEqual({ role: 'admin', banned: false, name: 'Zoë Ådahl ✓' })
  })

  it('reads nothing from what is not one', () => {
    expect(tokenClaims('opaque')).toEqual({})
    expect(tokenClaims('h.%%%.s')).toEqual({})
    expect(tokenClaims(`h.${encode(['role'])}.s`)).toEqual({})
  })
})

describe('the signed-in person on a server render', () => {
  /** An unsigned JWT with these claims, as the auth server's token carries them. */
  const jwt = (claims: Record<string, unknown>) => `h.${btoa(JSON.stringify(claims)).replace(/=+$/, '')}.s`
  const fetched: string[] = []
  const context = (member: unknown = { role: 'member' }) => ({
    loginPath: '/signin',
    authRoute: '/api/auth',
    event: {} as never,
    fetch: vi.fn(async (url: string) => {
      fetched.push(url)
      if (member instanceof Error) throw member
      return member
    }),
  })

  beforeEach(() => {
    fetched.length = 0
  })

  it('is no one without a request, or without a token for it', async () => {
    expect(await serverSubject({ ...context(), event: undefined })).toBeNull()
    expect(getToken).not.toHaveBeenCalled()
    getToken.mockResolvedValueOnce(null)
    expect(await serverSubject(context())).toBeNull()
  })

  it('reads the role and the ban from the token the server fetched, and the features from the deployment as the person', async () => {
    getToken.mockResolvedValueOnce(jwt({ sub: 'u1', role: 'user, moderator', banned: false }))
    const person = (await serverSubject(context()))!
    expect(person).toMatchObject({ role: 'user, moderator', banned: false })
    expect(await accessDenial([{ role: 'moderator' }], person)).toBeNull()
    expect(await accessDenial([{ role: 'admin' }], person)).toBe('role')
    expect(await accessDenial([{ feature: 'hd_export' }], person)).toBe('feature')
    features.value = { benefits: [{ metadata: { key: 'hd_export' } }] }
    expect(await accessDenial([{ feature: 'hd_export' }], person)).toBeNull()
    expect(fetchAuthQuery).toHaveBeenCalled()
    // Features that cannot be read grant none.
    fetchAuthQuery.mockRejectedValueOnce(new Error('offline'))
    expect(await accessDenial([{ feature: 'hd_export' }], person)).toBe('feature')

    getToken.mockResolvedValueOnce(jwt({ sub: 'u2', role: 'admin', banned: true }))
    expect(await accessDenial([{}], (await serverSubject(context()))!)).toBe('banned')
    // No role claim reads as the default role.
    getToken.mockResolvedValueOnce(jwt({ sub: 'u3' }))
    expect((await serverSubject(context()))!.role).toBe('user')
  })

  it('asks the auth route for the active workspace\'s member, with the request\'s fetch, only for a workspace rule', async () => {
    getToken.mockResolvedValue(jwt({ sub: 'u1', role: 'user' }))
    try {
      const owner = context({ role: 'owner' })
      const person = (await serverSubject(owner))!
      expect(await accessDenial([{ role: 'user' }], person)).toBeNull()
      expect(fetched).toEqual([])
      expect(await accessDenial([{ workspace: 'owner' }], person)).toBeNull()
      expect(fetched).toEqual(['/api/auth/organization/get-active-member'])
      expect(owner.fetch).toHaveBeenCalledTimes(1)
      // No active workspace answers null; a failed read is no role at all.
      expect(await accessDenial([{ workspace: 'owner' }], (await serverSubject(context(null)))!)).toBe('workspace')
      expect(await accessDenial([{ workspace: 'owner' }], (await serverSubject(context(new Error('502'))))!)).toBe('workspace')
    }
    finally {
      getToken.mockReset()
      getToken.mockResolvedValue(null)
    }
  })

  it('fails the render when the token cannot be fetched, rather than decide without it', async () => {
    getToken.mockRejectedValueOnce(new Error('auth server down'))
    await expect(serverSubject(context())).rejects.toThrow('auth server down')
  })
})

describe('the page guard in the browser', () => {
  it('passes a page without rules without touching the session', async () => {
    expect(await guard(route('/about', {}))).toBeUndefined()
    expect(useBetterAuth).not.toHaveBeenCalled()
  })

  it('sends a signed-out visitor to sign in, with the way back and no one-time code', async () => {
    const result = await guard(route('/oauth/admin?consent_code=secret&tab=keys', { auth: { role: 'admin' } }))
    expect(navigateTo).toHaveBeenCalledWith({ path: '/signin', query: { redirect: '/oauth/admin?tab=keys' } })
    expect(result).toEqual({ path: '/signin', query: { redirect: '/oauth/admin?tab=keys' } })
  })

  it('waits for a pending session before it decides', async () => {
    session.value = { data: null, isPending: true }
    const deciding = guard(route('/admin', { auth: { role: 'admin' } }))
    await nextTick()
    expect(navigateTo).not.toHaveBeenCalled()
    signedIn('admin')
    expect(await deciding).toBeUndefined()
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('answers a signed-in person who fails a rule with the 403', async () => {
    signedIn('user')
    const result = await guard(route('/admin', { auth: { role: 'admin' } }))
    expect(result).toMatchObject({ statusCode: 403, fatal: true, data: { reason: 'role', path: '/admin' } })
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('reads the active workspace\'s role fresh, for a page that asks for one', async () => {
    signedIn('user')
    expect(await guard(route('/team/settings', { auth: { workspace: 'owner' } }))).toMatchObject({ statusCode: 403, data: { reason: 'workspace' } })
    getActiveMember.mockImplementation(async () => ({ data: { role: 'owner' } }))
    expect(await guard(route('/team/settings', { auth: { workspace: 'owner' } }))).toBeUndefined()
    expect(getActiveMember).toHaveBeenCalledTimes(2)
    // A failed read is no role at all.
    getActiveMember.mockImplementation(async () => {
      throw new Error('offline')
    })
    expect(await guard(route('/team/settings', { auth: { workspace: 'owner' } }))).toMatchObject({ data: { reason: 'workspace' } })
  })

  it('reads the plan\'s features once the session is known to the deployment, and refuses a banned account', async () => {
    signedIn('user')
    expect(await guard(route('/export', { auth: { feature: 'hd_export' } }))).toMatchObject({ statusCode: 403, data: { reason: 'feature' } })
    features.value = { benefits: [{ metadata: { key: 'hd_export' } }] }
    expect(await guard(route('/export', { auth: { feature: 'hd_export' } }))).toBeUndefined()
    expect(convexQuery).toHaveBeenCalledTimes(2)
    signedIn('admin', { banned: true })
    expect(await guard(route('/moderation', { auth: true }))).toMatchObject({ data: { reason: 'banned' } })
  })

  it('answers a hidden page with the 404 of a page that does not exist: to a refused person, and to a signed-out visitor', async () => {
    signedIn('user')
    expect(await guard(route('/admin/featured', { auth: { role: 'admin', hidden: true } }))).toMatchObject({ statusCode: 404, fatal: true })
    signedIn('admin')
    expect(await guard(route('/admin/featured', { auth: { role: 'admin', hidden: true } }))).toBeUndefined()
    session.value = { data: null, isPending: false }
    expect(await guard(route('/admin/featured', { auth: { role: 'admin', hidden: true } }))).toMatchObject({ statusCode: 404 })
    expect(navigateTo).not.toHaveBeenCalled()
    expect(hiddenPageError('/x').data).toEqual({ path: '/x' })
  })

  it('hides the admin console\'s tab from everyone the console refuses, with no rule on the tab itself', async () => {
    // A tab is a child of the console (`hidden: true`, the role `admin`) and says only `adminTab`.
    const tab = () => route('/admin/featured', { auth: { role: 'admin', hidden: true } }, { adminTab: { label: 'Featured' } })
    signedIn('user')
    expect(await guard(tab())).toMatchObject({ statusCode: 404, fatal: true })
    session.value = { data: null, isPending: false }
    expect(await guard(tab())).toMatchObject({ statusCode: 404 })
    signedIn('admin')
    expect(await guard(tab())).toBeUndefined()
  })

  it('leaves the page the server rendered to the server\'s decision while it hydrates', async () => {
    const nuxtApp = useNuxtApp()
    nuxtApp.isHydrating = true
    nuxtApp.payload.serverRendered = true
    nuxtApp.payload.path = '/admin/?tab=users'
    try {
      expect(await guard(route('/admin?tab=users', { auth: { role: 'admin' } }))).toBeUndefined()
      expect(useBetterAuth).not.toHaveBeenCalled()
    }
    finally {
      nuxtApp.isHydrating = false
      nuxtApp.payload.path = undefined
    }
  })

  it('decides a page the server did not render, even while hydrating: a client-only redirect, or a prerendered payload', async () => {
    signedIn('user')
    const nuxtApp = useNuxtApp()
    nuxtApp.isHydrating = true
    nuxtApp.payload.serverRendered = true
    try {
      // A client-only plugin sends the person on from the page the server rendered.
      nuxtApp.payload.path = '/'
      expect(await guard(route('/admin', { auth: { role: 'admin' } }))).toMatchObject({ statusCode: 403, data: { reason: 'role' } })
      // A prerendered payload was rendered for no one.
      nuxtApp.payload.path = '/admin'
      nuxtApp.payload.prerenderedAt = Date.now()
      expect(await guard(route('/admin', { auth: { role: 'admin' } }))).toMatchObject({ statusCode: 403 })
    }
    finally {
      nuxtApp.isHydrating = false
      nuxtApp.payload.path = undefined
      nuxtApp.payload.prerenderedAt = undefined
    }
  })

  it('leaves no subscription on the session behind, a navigation after another', async () => {
    signedIn('admin')
    for (let turn = 0; turn < 3; turn++) expect(await guard(route('/admin', { auth: { role: 'admin' } }))).toBeUndefined()
    expect(sessionListeners).toBe(0)
    session.value = { data: null, isPending: true }
    const deciding = guard(route('/admin', { auth: { role: 'admin' } }))
    // While the session loads, the guard holds one subscription to it.
    await vi.waitFor(() => expect(sessionListeners).toBe(1))
    signedIn('admin')
    await deciding
    expect(useBetterAuth).toHaveBeenCalledTimes(4)
    expect(sessionListeners).toBe(0)
  })
})
