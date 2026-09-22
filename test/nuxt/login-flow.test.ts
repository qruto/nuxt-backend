import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'

const user = ref<Record<string, unknown> | null>(null)
const sessionRefetch = vi.fn(async () => {})

const client = {
  signOut: vi.fn(async () => ({})),
  emailOtp: { sendVerificationOtp: vi.fn(async () => ({})) },
  signIn: { emailOtp: vi.fn(async () => ({})), passkey: vi.fn(async () => ({})) },
  passkey: { addPasskey: vi.fn(async () => ({})) },
  changeEmail: vi.fn(async () => ({})),
  deleteUser: vi.fn(async () => ({})),
  admin: { checkRolePermission: vi.fn(() => false) },
}

vi.mock('nuxt-convex-module/better-auth/client', () => ({
  useBetterAuth: () => ({
    isLoading: computed(() => false),
    isAuthenticated: computed(() => user.value !== null),
    fetchAccessToken: vi.fn(async () => 'token'),
    client,
    session: ref({ data: null, isPending: false, refetch: sessionRefetch }),
    user: computed(() => user.value),
    authVersion: computed(() => null),
  }),
}))

// The content layer <AuthForm> reads its heading and logo from.
const backendConfig = {
  billing: { plans: [], packs: [], lowCreditsThreshold: 10 },
  brand: {} as { name?: string, logo?: string },
  labels: {} as { auth?: { title?: string } },
}
vi.mock('../../src/runtime/vue/composables/use-backend-config', () => ({ useBackendConfig: () => backendConfig }))

const { useLoginFlow } = await import('../../src/runtime/vue/composables/use-login-flow')
const { AuthForm } = await import('../../src/runtime/vue/components/auth-form')

function inSetup<T>(runner: () => T): T {
  let result: T
  mount(defineComponent({
    setup() {
      result = runner()
      return () => h('div')
    },
  }))
  return result!
}

beforeEach(() => {
  vi.clearAllMocks()
  user.value = null
  backendConfig.brand = {}
  backendConfig.labels = {}
})

describe('useLoginFlow', () => {
  it('walks the OTP happy path: request → verify → add-passkey → success', async () => {
    const onSuccess = vi.fn()
    const flow = inSetup(() => useLoginFlow({ onSuccess }))

    flow.goTo('request-code')
    flow.email.value = 'ada@example.com'
    flow.name.value = 'Ada'
    await flow.sendCode()
    expect(client.emailOtp.sendVerificationOtp).toHaveBeenCalledWith({ email: 'ada@example.com', type: 'sign-in' })
    expect(flow.step.value).toBe('verify-code')

    flow.otp.value = '123456'
    await flow.verifyCode()
    expect(client.signIn.emailOtp).toHaveBeenCalledWith({ email: 'ada@example.com', otp: '123456', name: 'Ada' })
    expect(sessionRefetch).toHaveBeenCalled()
    expect(flow.step.value).toBe('add-passkey')
    expect(onSuccess).not.toHaveBeenCalled()

    await flow.addPasskey()
    expect(client.passkey.addPasskey).toHaveBeenCalledWith({ context: undefined })
    expect(onSuccess).toHaveBeenCalledOnce()
  })

  it('completes directly after OTP when offerPasskey is false', async () => {
    const onSuccess = vi.fn()
    const flow = inSetup(() => useLoginFlow({ onSuccess, offerPasskey: false }))
    flow.email.value = 'ada@example.com'
    await flow.sendCode()
    flow.otp.value = '123456'
    await flow.verifyCode()
    expect(onSuccess).toHaveBeenCalledOnce()
    expect(flow.step.value).toBe('verify-code')
  })

  it('gates emails with validateEmail (custom message)', async () => {
    const flow = inSetup(() => useLoginFlow({
      validateEmail: value => value.endsWith('@resend.dev') || 'Use a test inbox.',
    }))
    flow.email.value = 'someone@gmail.com'
    await flow.sendCode()
    expect(flow.error.value).toBe('Use a test inbox.')
    expect(client.emailOtp.sendVerificationOtp).not.toHaveBeenCalled()

    flow.email.value = 'delivered@resend.dev'
    await flow.sendCode()
    expect(flow.error.value).toBeNull()
  })

  it('adds a passkey to the current session after OTP, surfacing auth errors', async () => {
    const onSuccess = vi.fn()
    const flow = inSetup(() => useLoginFlow({ onSuccess }))
    flow.goTo('request-code')
    flow.email.value = 'ada@example.com'
    await flow.sendCode()
    flow.otp.value = '123456'
    await flow.verifyCode()
    expect(flow.step.value).toBe('add-passkey')

    client.passkey.addPasskey.mockResolvedValueOnce({ error: { message: 'User cancelled' } })
    await flow.addPasskey()
    expect(flow.error.value).toBe('User cancelled')
    expect(flow.pending.value).toBe(false)
    expect(onSuccess).not.toHaveBeenCalled()
    // The passkey ceremony runs on the already-authenticated session — no
    // pre-auth account creation, so no sign-out dance.
    expect(client.signOut).not.toHaveBeenCalled()
  })

  it('reset returns to a clean choose step', async () => {
    const flow = inSetup(() => useLoginFlow())
    flow.goTo('request-code')
    flow.email.value = 'x@y.co'
    flow.otp.value = '1'
    flow.reset()
    expect(flow.step.value).toBe('choose')
    expect(flow.email.value).toBe('')
    expect(flow.otp.value).toBe('')
  })
})

describe('AuthForm', () => {
  it('renders the choose step with data-auth hooks', () => {
    const wrapper = mount(AuthForm)
    expect(wrapper.find('[data-auth="form"]').exists()).toBe(true)
    expect(wrapper.find('[data-auth="passkey-sign-in"]').exists()).toBe(true)
    expect(wrapper.find('[data-auth="otp-start"]').exists()).toBe(true)
    expect(wrapper.find('[data-auth="title"]').text()).toBe('Sign in')
  })

  it('hides flows per props', () => {
    const noPasskeys = mount(AuthForm, { props: { passkeys: false } })
    expect(noPasskeys.find('[data-auth="passkey-sign-in"]').exists()).toBe(false)
    expect(noPasskeys.find('[data-auth="divider"]').exists()).toBe(false)

    const noOtp = mount(AuthForm, { props: { otp: false } })
    expect(noOtp.find('[data-auth="otp-start"]').exists()).toBe(false)
  })

  it('walks to the OTP step and emits step + success', async () => {
    const wrapper = mount(AuthForm)
    await wrapper.find('[data-auth="otp-start"]').trigger('click')
    expect(wrapper.emitted('step')).toStrictEqual([['request-code']])

    await wrapper.find('[data-auth="input-email"]').setValue('ada@example.com')
    await wrapper.find('[data-auth="step-request-code"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-auth="step-verify-code"]').exists()).toBe(true))

    await wrapper.find('[data-auth="input-otp"]').setValue('123456')
    await wrapper.find('[data-auth="step-verify-code"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-auth="step-add-passkey"]').exists()).toBe(true))

    await wrapper.find('[data-auth="skip"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.emitted('success')).toHaveLength(1))
  })

  it('slot overrides receive the flow object', async () => {
    const wrapper = mount(AuthForm, {
      slots: {
        choose: `<template #choose="flow"><button id="custom" @click="flow.goTo('request-code')">go</button></template>`,
      },
    })
    expect(wrapper.find('#custom').exists()).toBe(true)
    await wrapper.find('#custom').trigger('click')
    expect(wrapper.find('[data-auth="step-request-code"]').exists()).toBe(true)
  })

  it('renders errors with role=alert and emits them', async () => {
    client.signIn.passkey.mockResolvedValueOnce({ error: { message: 'No passkey found' } })
    const wrapper = mount(AuthForm)
    await wrapper.find('[data-auth="passkey-sign-in"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-auth="error"]').text()).toBe('No passkey found'))
    expect(wrapper.emitted('error')).toStrictEqual([['No passkey found']])
  })

  it('is busy while a ceremony runs', async () => {
    let release!: () => void
    client.signIn.passkey.mockImplementationOnce(() => new Promise<object>((resolve) => {
      release = () => resolve({})
    }))
    const wrapper = mount(AuthForm)
    const form = () => wrapper.find('[data-auth="form"]').attributes('aria-busy')
    expect(form()).toBeUndefined()
    await wrapper.find('[data-auth="passkey-sign-in"]').trigger('click')
    expect(form()).toBe('true')
    release()
    await vi.waitFor(() => expect(form()).toBeUndefined())
  })

  it('announces the sent code as a polite status', async () => {
    const wrapper = mount(AuthForm)
    await wrapper.find('[data-auth="otp-start"]').trigger('click')
    await wrapper.find('[data-auth="input-email"]').setValue('ada@example.com')
    await wrapper.find('[data-auth="step-request-code"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-auth="sent-note"]').exists()).toBe(true))
    const note = wrapper.find('[data-auth="sent-note"]')
    expect(note.text()).toBe('We sent a code to ada@example.com.')
    expect(note.attributes('role')).toBe('status')
    expect(note.attributes('aria-live')).toBe('polite')
  })
})

describe('useLoginFlow rate limits', () => {
  /** What better-fetch hands back for the package's 429: the JSON body spread next to the status. */
  const limited = (retryAfter?: number) => ({
    error: {
      message: 'Too many verification requests. Please try again in a moment.',
      status: 429,
      statusText: 'Too Many Requests',
      ...(retryAfter === undefined ? {} : { retryAfter }),
    },
  })

  it('a 429 with retryAfter says when to retry, exposes the seconds and keeps the step', async () => {
    client.emailOtp.sendVerificationOtp.mockResolvedValueOnce(limited(4200))
    const flow = inSetup(() => useLoginFlow())
    flow.goTo('request-code')
    flow.email.value = 'ada@example.com'
    await flow.sendCode()
    // Rounded up — a countdown from the floor would let the user retry early.
    expect(flow.error.value).toBe('Too many attempts. Try again in 5 seconds.')
    expect(flow.retryAfter.value).toBe(5)
    expect(flow.step.value).toBe('request-code')
    expect(flow.pending.value).toBe(false)

    // The next attempt starts clean.
    await flow.sendCode()
    expect(flow.error.value).toBeNull()
    expect(flow.retryAfter.value).toBeNull()
    expect(flow.step.value).toBe('verify-code')
  })

  it('a one-second wait reads in the singular', async () => {
    client.emailOtp.sendVerificationOtp.mockResolvedValueOnce(limited(800))
    const flow = inSetup(() => useLoginFlow())
    flow.email.value = 'ada@example.com'
    await flow.sendCode()
    expect(flow.error.value).toBe('Too many attempts. Try again in 1 second.')
    expect(flow.retryAfter.value).toBe(1)
  })

  it('a 429 without retryAfter (Better Auth\'s own limiter) says "in a moment"', async () => {
    // The built-in limiter's body has only a message; its X-Retry-After
    // header never reaches the client's error object.
    client.signIn.emailOtp.mockResolvedValueOnce({ error: { message: 'Too many requests. Please try again later.', status: 429, statusText: 'Too Many Requests' } })
    const flow = inSetup(() => useLoginFlow())
    flow.email.value = 'ada@example.com'
    await flow.sendCode()
    flow.otp.value = '123456'
    await flow.verifyCode()
    expect(flow.error.value).toBe('Too many attempts. Try again in a moment.')
    expect(flow.retryAfter.value).toBeNull()
    expect(flow.step.value).toBe('verify-code')
    expect(sessionRefetch).not.toHaveBeenCalled()
  })

  it('a non-429 error is unchanged', async () => {
    client.signIn.emailOtp.mockResolvedValueOnce({ error: { message: 'Invalid code', status: 400, statusText: 'Bad Request', retryAfter: 4200 } })
    const flow = inSetup(() => useLoginFlow())
    flow.email.value = 'ada@example.com'
    await flow.sendCode()
    flow.otp.value = '000000'
    await flow.verifyCode()
    expect(flow.error.value).toBe('Invalid code')
    expect(flow.retryAfter.value).toBeNull()
    expect(flow.step.value).toBe('verify-code')
  })

  it('goTo clears the wait with the error', async () => {
    client.emailOtp.sendVerificationOtp.mockResolvedValueOnce(limited(4200))
    const flow = inSetup(() => useLoginFlow())
    flow.email.value = 'ada@example.com'
    await flow.sendCode()
    expect(flow.retryAfter.value).toBe(5)
    flow.goTo('choose')
    expect(flow.error.value).toBeNull()
    expect(flow.retryAfter.value).toBeNull()
  })
})

describe('AuthForm heading', () => {
  // props ?? appConfig.backend.labels.auth.title ?? "Sign in to {brand}" ?? "Sign in"
  const heading = () => mount(AuthForm).find('[data-auth="title"]')

  it('brands the default heading when a brand name is configured', () => {
    backendConfig.brand = { name: 'Acme' }
    expect(heading().text()).toBe('Sign in to Acme')
  })

  it('prefers labels.auth.title over the brand', () => {
    backendConfig.brand = { name: 'Acme' }
    backendConfig.labels = { auth: { title: 'Welcome back' } }
    expect(heading().text()).toBe('Welcome back')
  })

  it('the title prop wins, and an empty one hides the heading', () => {
    backendConfig.labels = { auth: { title: 'Welcome back' } }
    expect(mount(AuthForm, { props: { title: 'Members' } }).find('[data-auth="title"]').text()).toBe('Members')
    expect(mount(AuthForm, { props: { title: '' } }).find('[data-auth="title"]').exists()).toBe(false)
  })

  it('renders the brand logo above the heading', () => {
    backendConfig.brand = { name: 'Acme', logo: '/acme.svg' }
    const wrapper = mount(AuthForm)
    const logo = wrapper.find('[data-auth="logo"]')
    expect(logo.attributes('src')).toBe('/acme.svg')
    expect(logo.attributes('alt')).toBe('Acme')
    // Logo first, then the heading — the brand's mark over the page's title.
    expect(wrapper.find('[data-auth="form"]').element.firstElementChild).toBe(logo.element)
    // …and nothing is rendered when no logo is configured.
    backendConfig.brand = { name: 'Acme' }
    expect(mount(AuthForm).find('[data-auth="logo"]').exists()).toBe(false)
  })
})
