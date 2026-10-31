import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, effectScope, nextTick, ref, type EffectScope } from 'vue'
import { createMemoryHistory, createRouter, type RouteLocationNormalized, type Router } from 'vue-router'
import { flushPromises } from '@vue/test-utils'
import { useNuxtApp } from '#imports'

// The session-ended watch on a real vue-router and the test's own Nuxt app
// and hooks. Only the session underneath is a stand-in: a ref of what the
// auth server last answered (a session key, `null` for signed out,
// `undefined` while the answer is pending).

const { isAuthGuarded, onFirstGuardedPage } = await import('../../src/runtime/vue/utils/page-rules')
const { shareablePath, watchSessionEnd } = await import('../../src/runtime/vue/utils/session-end')
const { markLocalSignOut } = await import('../../src/runtime/vue/utils/local-sign-out')

const Page = defineComponent({ render: () => null })

/** The app's pages: guarded ones by their own meta or by a parent's. */
function appRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Page },
      { path: '/about', component: Page },
      { path: '/signin', component: Page },
      { path: '/account', component: Page, meta: { auth: true } },
      { path: '/oauth/consent', component: Page, meta: { auth: true } },
      { path: '/team', component: Page, meta: { middleware: ['onboarding'], auth: true }, children: [{ path: 'members', component: Page }] },
      // The named middleware is gone: a page that still names it is no guarded page.
      { path: '/open-by-rule', component: Page, meta: { middleware: 'auth' } },
      { path: '/guarded-by-rule', component: Page, meta: { auth: { workspace: true } } },
      { path: '/admin', component: Page, meta: { auth: { role: 'admin' } } },
      { path: '/workspace', component: Page, meta: { auth: {} }, children: [{ path: 'billing', component: Page }] },
    ] as never,
  })
}

const session = ref<string | null | undefined>('session-1')
let router: Router
let scope: EffectScope | undefined
let unhook: (() => void) | undefined

/** Open `path` signed in (or as `initially` says), then watch the session from there. */
async function start(path: string, initially: string | null | 'pending' = 'session-1'): Promise<void> {
  session.value = initially === 'pending' ? undefined : initially
  router = appRouter()
  await router.push(path)
  const nuxtApp = useNuxtApp()
  scope = effectScope()
  scope.run(() => watchSessionEnd(nuxtApp, { router, session: () => session.value, loginPath: '/signin' }))
}

async function settle(value: string | null | undefined): Promise<void> {
  session.value = value
  await nextTick()
  await flushPromises()
}

const here = () => router.currentRoute.value.fullPath

beforeEach(() => {
  markLocalSignOut(null)
})

afterEach(() => {
  scope?.stop()
  unhook?.()
  unhook = undefined
})

describe('the session-ended watch', () => {
  it('sends a person on a guarded page to sign in, with the way back', async () => {
    await start('/account?tab=keys')
    await settle(null)
    expect(router.currentRoute.value.path).toBe('/signin')
    expect(router.currentRoute.value.query.redirect).toBe('/account?tab=keys')
  })

  it('reads a parent\'s guard, and never a page that only names the old middleware', async () => {
    await start('/team/members')
    await settle(null)
    expect(router.currentRoute.value.query.redirect).toBe('/team/members')

    scope?.stop()
    await start('/guarded-by-rule')
    await settle(null)
    expect(router.currentRoute.value.query.redirect).toBe('/guarded-by-rule')

    scope?.stop()
    await start('/open-by-rule')
    await settle(null)
    expect(here()).toBe('/open-by-rule')
  })

  it('reads a page\'s own access rules as a guard, a parent\'s included', async () => {
    await start('/admin')
    await settle(null)
    expect(router.currentRoute.value.query.redirect).toBe('/admin')

    scope?.stop()
    await start('/workspace/billing')
    await settle(null)
    expect(router.currentRoute.value.query.redirect).toBe('/workspace/billing')
  })

  it('never copies the consent page\'s one-time code into the redirect', async () => {
    await start('/oauth/consent?consent_code=secret&client_id=agent-1')
    await settle(null)
    expect(router.currentRoute.value.query.redirect).toBe('/oauth/consent?client_id=agent-1')
    expect(here()).not.toContain('secret')
  })

  it('leaves a public page alone', async () => {
    await start('/about')
    await settle(null)
    expect(here()).toBe('/about')
  })

  it('leaves a sign-out this tab made to the app: sign out, then navigateTo(\'/\') ends on \'/\'', async () => {
    await start('/account')
    const visited: string[] = []
    router.afterEach(to => visited.push(to.fullPath))
    // What useAuth().signOut does before it calls the auth client.
    markLocalSignOut('session-1')
    await settle(null)
    await router.push('/')
    await flushPromises()
    expect(here()).toBe('/')
    // Never through the sign-in page with the last person's private path.
    expect(visited).toEqual(['/'])
  })

  it('leaves an end that lands while a navigation is under way to the next page', async () => {
    await start('/account')
    let release: (() => void) | undefined
    router.beforeEach(() => new Promise<void>((resolve) => {
      release = resolve
    }))
    const leaving = router.push('/')
    await vi.waitFor(() => expect(release).toBeDefined())
    await settle(null)
    release!()
    await leaving
    await flushPromises()
    expect(here()).toBe('/')
  })

  it('acts on a settled answer only: a pending one while hydrating or refreshing is no end', async () => {
    // Pending, then signed in: nothing ended.
    await start('/account', 'pending')
    await settle('session-1')
    expect(here()).toBe('/account')
    // Signed in, then pending (a token refresh that failed reads signed out
    // until the server answers), then signed in again: nothing ended.
    await settle(undefined)
    await settle('session-1')
    expect(here()).toBe('/account')
    // Signed in, then pending, then signed out: the session did end.
    await settle(undefined)
    await settle(null)
    expect(router.currentRoute.value.query.redirect).toBe('/account')
  })

  it('does nothing for someone who was never signed in', async () => {
    await start('/account', 'pending')
    await settle(null)
    expect(here()).toBe('/account')
  })

  it('lets a backend:session-ended hook send the person elsewhere', async () => {
    const seen: string[] = []
    unhook = useNuxtApp().hook('backend:session-ended', (context) => {
      seen.push(context.route.fullPath)
      context.to = '/about'
    })
    await start('/account')
    await settle(null)
    expect(seen).toEqual(['/account'])
    expect(here()).toBe('/about')
  })

  it('lets a backend:session-ended hook keep the person on the page', async () => {
    unhook = useNuxtApp().hook('backend:session-ended', context => context.preventDefault())
    await start('/account')
    await settle(null)
    expect(here()).toBe('/account')
  })
})

describe('isAuthGuarded', () => {
  const resolved = (path: string) => appRouter().resolve(path) as RouteLocationNormalized

  it('reads definePageMeta({ auth }) alone, a parent\'s included', () => {
    expect(isAuthGuarded(resolved('/account'))).toBe(true)
    expect(isAuthGuarded(resolved('/team/members'))).toBe(true)
    expect(isAuthGuarded(resolved('/about'))).toBe(false)
    expect(isAuthGuarded(resolved('/guarded-by-rule'))).toBe(true)
    expect(isAuthGuarded(resolved('/open-by-rule'))).toBe(false)
  })
})

describe('shareablePath', () => {
  it('drops the consent code and keeps the rest', () => {
    expect(shareablePath({ fullPath: '/oauth/consent?consent_code=x&scope=openid#top' })).toBe('/oauth/consent?scope=openid#top')
    expect(shareablePath({ fullPath: '/account' })).toBe('/account')
  })
})

// The plugin loads the auth client for the watch only from here: a public
// page never pays for it.
describe('onFirstGuardedPage', () => {
  it('starts at once on a guarded page, and only once', async () => {
    const start = vi.fn()
    const app = appRouter()
    await app.push('/account')
    onFirstGuardedPage(app, start)
    await app.push('/team')
    expect(start).toHaveBeenCalledOnce()
  })

  it('waits on public pages for the first completed navigation to a guarded one, then stops listening', async () => {
    const start = vi.fn()
    const app = appRouter()
    await app.push('/about')
    const afterEach = vi.spyOn(app, 'afterEach')
    onFirstGuardedPage(app, start)
    await app.push('/open-by-rule')
    expect(start).not.toHaveBeenCalled()

    // An aborted navigation to a guarded page is no start.
    const refuse = app.beforeEach(to => to.path !== '/account')
    await app.push('/account')
    expect(start).not.toHaveBeenCalled()
    refuse()

    await app.push('/guarded-by-rule')
    expect(start).toHaveBeenCalledOnce()
    expect(afterEach).toHaveBeenCalledOnce()
    await app.push('/account')
    expect(start).toHaveBeenCalledOnce()
  })
})
