import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

// The ready-made /login page around the real <AuthForm> and login flow: only
// the auth client underneath and the router are stand-ins. The page must not
// leave while the form is mid-sign-in, or the passkey offer after a code is
// never seen.

const user = ref<Record<string, unknown> | null>(null)
const signedIn = async () => {
  user.value = { id: 'u1', name: 'Ada', email: 'ada@example.com' }
  return {}
}
const client = {
  emailOtp: { sendVerificationOtp: vi.fn(async () => ({})) },
  signIn: { emailOtp: vi.fn(signedIn), passkey: vi.fn(signedIn) },
  passkey: { addPasskey: vi.fn(async () => ({})) },
}

vi.mock('nuxt-convex-module/better-auth/client', () => ({
  useBetterAuth: () => ({
    isLoading: computed(() => false),
    isAuthenticated: computed(() => user.value !== null),
    fetchAccessToken: vi.fn(async () => 'token'),
    client,
    session: ref({ data: null, isPending: false, refetch: vi.fn(async () => {}) }),
    user: computed(() => user.value),
    authVersion: computed(() => null),
  }),
}))
vi.mock('../../src/runtime/vue/composables/use-backend-config', () => ({
  useBackendConfig: () => ({ billing: { plans: [], packs: [], lowCreditsThreshold: 10 }, brand: {}, labels: {} }),
}))

const { navigateTo, useHead, route } = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  useHead: vi.fn(),
  route: { query: {} as Record<string, string> },
}))
mockNuxtImport('navigateTo', () => navigateTo)
mockNuxtImport('useHead', () => useHead)
mockNuxtImport('useRoute', () => () => route)

const { default: LoginPage } = await import('../../src/runtime/vue/pages/login')

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
  user.value = null
  route.query = { redirect: '/app' }
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
    expect(user.value).not.toBeNull()
    expect(page.find('[data-auth="step-add-passkey"]').exists()).toBe(true)
    expect(navigateTo).not.toHaveBeenCalled()

    await page.find('[data-auth="skip"]').trigger('click')
    await flushPromises()
    expect(navigateTo).toHaveBeenCalledOnce()
    expect(navigateTo).toHaveBeenCalledWith('/app', { external: false })
  })

  it('leaves once after a passkey sign-in, though the session and the form both report it', async () => {
    const page = mount(LoginPage)
    await flushPromises()

    await page.find('[data-auth="passkey-sign-in"]').trigger('click')
    await flushPromises()
    expect(navigateTo).toHaveBeenCalledOnce()
    expect(navigateTo).toHaveBeenCalledWith('/app', { external: false })
  })

  it('goes past the passkey offer where the browser has no WebAuthn', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined)
    const page = mount(LoginPage)
    await flushPromises()
    expect(page.find('[data-auth="passkey-sign-in"]').exists()).toBe(false)

    await signInWithCode(page)
    expect(navigateTo).toHaveBeenCalledOnce()
    expect(navigateTo).toHaveBeenCalledWith('/app', { external: false })
    expect(client.passkey.addPasskey).not.toHaveBeenCalled()
  })

  it('sends a visitor who is signed in already straight on, to a same-site path only', async () => {
    user.value = { id: 'u1', name: 'Ada', email: 'ada@example.com' }
    route.query = { redirect: '//evil.example/steal' }
    mount(LoginPage)
    await flushPromises()
    expect(navigateTo).toHaveBeenCalledOnce()
    expect(navigateTo).toHaveBeenCalledWith('/', { external: false })
  })
})
