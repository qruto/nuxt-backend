import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useRuntimeConfig } from '#imports'
import { createBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import LoginPage from '../../src/runtime/vue/pages/login.vue'
import { registerComponents } from '../helpers/register-components'

await registerComponents('page:login')

// The ready-made /login page around the real <AuthForm>, login flow and
// session, over the backend mock (nuxt-backend/test-utils): only the router
// is a stand-in. The page must not leave while the form is mid-sign-in, or
// the passkey offer after a code is never seen.

let backend: BackendMock

const { navigateTo, useHead, route } = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  useHead: vi.fn(),
  route: { query: {} as Record<string, string> },
}))
mockNuxtImport('navigateTo', () => navigateTo)
mockNuxtImport('useHead', () => useHead)
mockNuxtImport('useRoute', () => () => route)

/** Where the module option `redirects.afterSignIn` lands: the public runtime config. */
function setAfterSignIn(path: string) {
  const config = useRuntimeConfig().public as Record<string, unknown>
  config.backend = { ...(config.backend as object), redirects: { afterSignIn: path } }
}

async function signInWithCode(page: VueWrapper): Promise<void> {
  await page.find('[data-auth="otp-start"]').trigger('click')
  await page.find('[data-auth="input-email"]').setValue('ada@example.com')
  await page.find('[data-auth="step-request-code"]').trigger('submit')
  await flushPromises()
  await page.find('[data-auth="input-otp"]').setValue('123456')
  await page.find('[data-auth="step-verify-code"]').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  backend = createBackendMock()
  route.query = { redirect: '/app' }
  setAfterSignIn('/')
  vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
})

// A page left mounted would still watch the shared session.
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the login page', () => {
  it('stays while the form offers a passkey after a code, then leaves once', async () => {
    const page = mount(LoginPage)
    await flushPromises()

    await signInWithCode(page)
    expect(backend.state.user).toMatchObject({ email: 'ada@example.com' })
    expect(backend.callsTo('signIn.emailOtp')).toEqual([{ email: 'ada@example.com', otp: '123456' }])
    expect(page.find('[data-auth="step-add-passkey"]').exists()).toBe(true)
    expect(navigateTo).not.toHaveBeenCalled()

    await page.find('[data-auth="skip"]').trigger('click')
    await flushPromises()
    expect(navigateTo).toHaveBeenCalledOnce()
    expect(navigateTo).toHaveBeenCalledWith('/app')
  })

  it('leaves once after a passkey sign-in, though the session and the form both report it', async () => {
    const page = mount(LoginPage)
    await flushPromises()

    await page.find('[data-auth="passkey-sign-in"]').trigger('click')
    await flushPromises()
    expect(navigateTo).toHaveBeenCalledOnce()
    expect(navigateTo).toHaveBeenCalledWith('/app')
  })

  it('goes past the passkey offer where the browser has no WebAuthn', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined)
    const page = mount(LoginPage)
    await flushPromises()
    expect(page.find('[data-auth="passkey-sign-in"]').exists()).toBe(false)

    await signInWithCode(page)
    expect(navigateTo).toHaveBeenCalledOnce()
    expect(navigateTo).toHaveBeenCalledWith('/app')
    expect(backend.callsTo('passkey.addPasskey')).toEqual([])
  })

  it('sends a visitor who is signed in already straight on, to a same-site path only', async () => {
    backend.signIn()
    route.query = { redirect: '//evil.example/steal' }
    mount(LoginPage)
    await flushPromises()
    expect(navigateTo).toHaveBeenCalledOnce()
    expect(navigateTo).toHaveBeenCalledWith('/')
  })

  // Every way a ?redirect= can name another site: none of them is followed.
  it.each([
    '//evil.example/steal',
    '/\\evil.example/steal',
    '/.//evil.example/steal',
    'https://evil.example/steal',
    'javascript:alert(1)',
  ])('never follows ?redirect=%s off the site', async (redirect) => {
    setAfterSignIn('/dashboard')
    backend.signIn()
    route.query = { redirect }
    mount(LoginPage)
    await flushPromises()
    expect(navigateTo).toHaveBeenCalledOnce()
    expect(navigateTo).toHaveBeenCalledWith('/dashboard')
  })

  it('sends a visitor without a usable ?redirect= to redirects.afterSignIn', async () => {
    setAfterSignIn('/dashboard')
    route.query = { redirect: 'https://evil.example/steal' }
    const page = mount(LoginPage)
    await flushPromises()
    await page.find('[data-auth="passkey-sign-in"]').trigger('click')
    await flushPromises()
    expect(navigateTo).toHaveBeenCalledOnce()
    expect(navigateTo).toHaveBeenCalledWith('/dashboard')

    navigateTo.mockClear()
    backend.signOut()
    route.query = {}
    mount(LoginPage)
    backend.signIn()
    await flushPromises()
    expect(navigateTo).toHaveBeenCalledWith('/dashboard')
  })
})
