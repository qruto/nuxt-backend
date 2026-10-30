import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { clearNuxtState, useNuxtApp } from '#imports'

const user = ref<Record<string, unknown> | null>(null)
const sessionRefetch = vi.fn(async () => {})

// The auth client's answers as better-fetch shapes them: `{ data, error }`.
type Answer = { data?: unknown, error?: Record<string, unknown> | null }
const ok = (data: unknown = { success: true }): Answer => ({ data, error: null })
const ada = { id: 'u1', name: 'Ada', email: 'ada@example.com' }

const client = {
  signOut: vi.fn(async (): Promise<Answer> => ok()),
  emailOtp: { sendVerificationOtp: vi.fn(async (): Promise<Answer> => ok()) },
  signIn: {
    emailOtp: vi.fn(async (): Promise<Answer> => ok({ token: 't', user: ada })),
    passkey: vi.fn(async (): Promise<Answer> => ok({ session: { id: 's1' }, user: ada })),
  },
  passkey: { addPasskey: vi.fn(async (): Promise<Answer> => ok({ id: 'pk1', createdAt: '2026-10-01' })) },
  deleteUser: vi.fn(async (): Promise<Answer> => ok()),
  admin: { checkRolePermission: vi.fn(() => false) },
  // The package's own routes: the recovery sign-in.
  $fetch: vi.fn(async (_path: string, _options?: unknown): Promise<Answer> => ok({ token: 't', user: ada, recoveryCode: 'NEW00-CODE0-AAAAA-BBBBB' })),
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
  labels: {} as { auth?: Record<string, string> },
}
vi.mock('../../src/runtime/vue/composables/use-backend-config', () => ({ useBackendConfig: () => backendConfig }))

const { useLoginFlow } = await import('../../src/runtime/vue/composables/use-login-flow')
type UseLoginFlowReturn = import('../../src/runtime/vue/composables/use-login-flow').UseLoginFlowReturn
const { registerComponents } = await import('../helpers/register-components')
await registerComponents('AuthForm')
const { default: AuthForm } = await import('../../src/runtime/vue/components/auth/AuthForm.vue')
const { AUTOFILL_RENEW_MS } = await import('../../src/runtime/vue/passkey-client')

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

/** The cookie a sign-in sets, saying how this browser signed in last. */
const LAST_USED = 'better-auth.last_used_login_method'

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  user.value = null
  backendConfig.brand = {}
  backendConfig.labels = {}
  // Every test starts in a browser that never signed in.
  document.cookie = `${LAST_USED}=; max-age=0; path=/`
  clearNuxtState('backend:last-sign-in-method')
})

describe('useLoginFlow, sign-in security', () => {
  it('skips the passkey offer in a browser with no passkey provider', async () => {
    vi.stubGlobal('PublicKeyCredential', Object.assign(function PublicKeyCredential() {}, {
      getClientCapabilities: async () => ({ passkeyPlatformAuthenticator: false, hybridTransport: false, conditionalGet: false }),
    }))
    const onSuccess = vi.fn()
    const flow = inSetup(() => useLoginFlow({ onSuccess }))
    flow.goTo('request-code')
    flow.email.value = 'ada@example.com'
    await flow.sendCode()
    flow.otp.value = '123456'
    await flow.verifyCode()
    expect(flow.step.value).toBe('verify-code')
    expect(onSuccess).toHaveBeenCalledOnce()
  })

  it('recovers a passkey-only account, then requires the new passkey before anything else', async () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
    const onSuccess = vi.fn()
    const flow = inSetup(() => useLoginFlow({ onSuccess }))
    flow.goTo('recover')
    flow.email.value = 'ada@example.com'
    flow.recoveryCode.value = 'OLD00-CODE0-AAAAA-BBBBB'
    await flow.recover()
    expect(client.$fetch).toHaveBeenCalledWith('/sign-in/recovery-code', { method: 'POST', body: { email: 'ada@example.com', recoveryCode: 'OLD00-CODE0-AAAAA-BBBBB' } })
    expect(flow.step.value).toBe('passkey-offer')
    expect(flow.passkeyRequired.value).toBe(true)
    // The new code, shown once.
    expect(flow.recoveryCode.value).toBe('NEW00-CODE0-AAAAA-BBBBB')

    // No way around the passkey.
    await flow.skipPasskey()
    flow.goTo('choose')
    flow.reset()
    expect(flow.step.value).toBe('passkey-offer')
    expect(onSuccess).not.toHaveBeenCalled()

    await flow.addPasskey()
    expect(client.passkey.addPasskey).toHaveBeenCalled()
    expect(flow.passkeyRequired.value).toBe(false)
    expect(onSuccess).toHaveBeenCalledOnce()
  })

  it('stays on recover with the reason when the recovery code is refused', async () => {
    client.$fetch.mockResolvedValueOnce({ data: null, error: { code: 'invalid_input', field: 'recoveryCode', message: 'That recovery code isn\'t right, or it was used already.', status: 400, statusText: 'BAD_REQUEST' } })
    const flow = inSetup(() => useLoginFlow())
    flow.goTo('recover')
    await flow.recover()
    expect(flow.step.value).toBe('recover')
    expect(flow.error.value).toMatchObject({ code: 'invalid_input', data: { field: 'recoveryCode' } })
    expect(flow.passkeyRequired.value).toBe(false)
  })

  it('tells the browser of a passkey the server does not know', async () => {
    const signalUnknownCredential = vi.fn(async () => {})
    vi.stubGlobal('PublicKeyCredential', Object.assign(function PublicKeyCredential() {}, { signalUnknownCredential }))
    client.signIn.passkey.mockImplementationOnce((async (options?: { fetchOptions?: { onRequest?: (context: { body: unknown }) => void } }) => {
      options?.fetchOptions?.onRequest?.({ body: JSON.stringify({ response: { id: 'cred-gone' } }) })
      return { data: null, error: { code: 'PASSKEY_NOT_FOUND', message: 'Passkey not found', status: 401, statusText: 'UNAUTHORIZED' } }
    }) as never)
    const flow = inSetup(() => useLoginFlow())
    await flow.signInWithPasskey()
    expect(signalUnknownCredential).toHaveBeenCalledWith({ rpId: window.location.hostname, credentialId: 'cred-gone' })
    expect(flow.error.value).toMatchObject({ code: 'invalid_input', data: { field: 'passkey' } })
  })
})

describe('useLoginFlow', () => {
  it('walks the OTP happy path: request → verify → passkey-offer → success', async () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
    const onSuccess = vi.fn()
    const flow = inSetup(() => useLoginFlow({ onSuccess }))

    flow.goTo('request-code')
    flow.email.value = 'ada@example.com'
    await flow.sendCode()
    expect(client.emailOtp.sendVerificationOtp).toHaveBeenCalledWith({ email: 'ada@example.com', type: 'sign-in' })
    expect(flow.step.value).toBe('verify-code')

    flow.otp.value = '123456'
    await flow.verifyCode()
    expect(client.signIn.emailOtp).toHaveBeenCalledWith({ email: 'ada@example.com', otp: '123456' })
    expect(sessionRefetch).toHaveBeenCalled()
    expect(flow.step.value).toBe('passkey-offer')
    expect(onSuccess).not.toHaveBeenCalled()

    await flow.addPasskey()
    expect(client.passkey.addPasskey).toHaveBeenCalledWith({ context: undefined })
    expect(onSuccess).toHaveBeenCalledOnce()
  })

  it('moves an address the provider suppressed to the undeliverable step, with no error, and back to the email step', async () => {
    const flow = inSetup(() => useLoginFlow())
    flow.goTo('request-code')
    flow.email.value = 'suppressed@resend.dev'
    client.emailOtp.sendVerificationOtp.mockResolvedValueOnce({ data: null, error: { status: 503, statusText: 'Service Unavailable', code: 'unavailable', service: 'email', reason: 'suppressed', message: 'unavailable' } } as never)
    await flow.sendCode()
    expect(flow.step.value).toBe('undeliverable')
    expect(flow.error.value).toBeNull()
    expect(flow.isPending.value).toBe(false)

    flow.goTo('request-code')
    expect(flow.step.value).toBe('request-code')
    expect(flow.email.value).toBe('suppressed@resend.dev')
  })

  it('keeps any other refusal of a code as an error on the email step', async () => {
    const flow = inSetup(() => useLoginFlow())
    flow.goTo('request-code')
    flow.email.value = 'ada@example.com'
    client.emailOtp.sendVerificationOtp.mockResolvedValueOnce({ data: null, error: { status: 503, statusText: 'Service Unavailable', code: 'unavailable', service: 'email', reason: 'test_mode', message: 'unavailable' } } as never)
    await flow.sendCode()
    expect(flow.step.value).toBe('request-code')
    expect(flow.error.value?.data).toMatchObject({ service: 'email', reason: 'test_mode' })
  })

  it('gates emails with validateEmail (custom message)', async () => {
    const flow = inSetup(() => useLoginFlow({
      validateEmail: value => value.endsWith('@resend.dev') || 'Use a test inbox.',
    }))
    flow.email.value = 'someone@gmail.com'
    await flow.sendCode()
    expect(flow.error.value).toEqual({ code: 'invalid_input', data: { field: 'email', message: 'Use a test inbox.' }, message: 'Use a test inbox.' })
    expect(client.emailOtp.sendVerificationOtp).not.toHaveBeenCalled()

    flow.email.value = 'delivered@resend.dev'
    await flow.sendCode()
    expect(flow.error.value).toBeNull()
  })

  it('adds a passkey to the current session after OTP, surfacing auth errors', async () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
    const onSuccess = vi.fn()
    const flow = inSetup(() => useLoginFlow({ onSuccess }))
    flow.goTo('request-code')
    flow.email.value = 'ada@example.com'
    await flow.sendCode()
    flow.otp.value = '123456'
    await flow.verifyCode()
    expect(flow.step.value).toBe('passkey-offer')

    client.passkey.addPasskey.mockResolvedValueOnce({ data: null, error: { message: 'User cancelled', status: 400, statusText: 'Bad Request' } })
    await expect(flow.addPasskey()).resolves.toBeUndefined()
    expect(flow.error.value?.message).toBe('User cancelled')
    expect(flow.isPending.value).toBe(false)
    expect(onSuccess).not.toHaveBeenCalled()
    // The passkey ceremony runs on the already-authenticated session — no
    // pre-auth account creation, so no sign-out dance.
    expect(client.signOut).not.toHaveBeenCalled()
  })

  // A double click on Skip, or a passkey prompt that resolves after it, must
  // not hand the person on twice.
  it('finishes once, however often the last step is reached', async () => {
    const onSuccess = vi.fn()
    const flow = inSetup(() => useLoginFlow({ onSuccess }))
    flow.goTo('passkey-offer')
    await Promise.all([flow.skipPasskey(), flow.skipPasskey()])
    await flow.addPasskey()
    expect(onSuccess).toHaveBeenCalledOnce()

    // A new sign-in after reset finishes again.
    flow.reset()
    flow.goTo('passkey-offer')
    await flow.skipPasskey()
    expect(onSuccess).toHaveBeenCalledTimes(2)
  })

  // A navigation that failed, or a write the app awaits there, is no hand-off:
  // the person is still on the offer, and the next press tries again.
  it('tries a hand-off that failed again on the next press', async () => {
    const onSuccess = vi.fn(async () => {}).mockRejectedValueOnce(new Error('navigation failed'))
    const flow = inSetup(() => useLoginFlow({ onSuccess }))
    flow.goTo('passkey-offer')
    await flow.skipPasskey()
    expect(flow.error.value).toMatchObject({ code: 'unavailable', data: { reason: 'unexpected' } })
    expect(flow.step.value).toBe('passkey-offer')

    await flow.skipPasskey()
    expect(onSuccess).toHaveBeenCalledTimes(2)
    expect(flow.error.value).toBeNull()
    // Done now: a later press hands nothing on again.
    await flow.addPasskey()
    expect(onSuccess).toHaveBeenCalledTimes(2)
  })

  it('counts a passkey this device already holds as saved', async () => {
    const onSuccess = vi.fn()
    const flow = inSetup(() => useLoginFlow({ onSuccess }))
    flow.goTo('passkey-offer')
    client.passkey.addPasskey.mockResolvedValueOnce({ data: null, error: { code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED', message: 'Already registered', status: 400, statusText: 'Bad Request' } })
    await flow.addPasskey()
    expect(flow.error.value).toBeNull()
    expect(onSuccess).toHaveBeenCalledOnce()
  })

  it('reads a banned account\'s refusal as forbidden, reason banned, and stays on the code step', async () => {
    client.signIn.emailOtp.mockResolvedValueOnce({
      data: null,
      error: { code: 'BANNED_USER', message: 'You have been banned from this application', status: 403, statusText: 'Forbidden' },
    })
    const flow = inSetup(() => useLoginFlow())
    flow.email.value = 'ada@example.com'
    await flow.sendCode()
    flow.otp.value = '123456'
    await expect(flow.verifyCode()).resolves.toBeUndefined()
    expect(flow.error.value).toEqual({ code: 'forbidden', data: { reason: 'banned' }, message: 'This account is banned.' })
    expect(flow.step.value).toBe('verify-code')
    expect(sessionRefetch).not.toHaveBeenCalled()
  })

  it('is pending while a step runs', async () => {
    let release!: () => void
    client.emailOtp.sendVerificationOtp.mockImplementationOnce(() => new Promise<Answer>((resolve) => {
      release = () => resolve(ok())
    }))
    const flow = inSetup(() => useLoginFlow())
    flow.email.value = 'ada@example.com'
    const sending = flow.sendCode()
    expect(flow.isPending.value).toBe(true)
    release()
    await sending
    expect(flow.isPending.value).toBe(false)
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

describe('useLoginFlow, a closed launch phase', () => {
  const ticketRequired = (phase: string, invite?: string, waitlist?: { position: number, total: number, token: string }) => ({ data: null, error: { code: 'forbidden', reason: 'ticket_required', phase, ...(invite ? { invite } : {}), ...(waitlist ? { waitlist } : {}), message: 'Signing up needs an invite right now.', status: 403, statusText: 'FORBIDDEN' } })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('moves a new address with no ticket to invite-code, keeping its code, and signs it up with the invite code', async () => {
    const flow = inSetup(() => useLoginFlow())
    flow.email.value = 'new@resend.dev'
    flow.otp.value = '123456'
    client.signIn.emailOtp.mockResolvedValueOnce(ticketRequired('invite-only'))
    await flow.verifyCode()
    expect(flow.step.value).toBe('invite-code')
    expect(flow.error.value).toBeNull()
    expect(flow.otp.value).toBe('123456')

    flow.inviteCode.value = '7KQ2M-XW9PA'
    await flow.redeemInviteCode()
    expect(client.signIn.emailOtp).toHaveBeenLastCalledWith({ email: 'new@resend.dev', otp: '123456', inviteCode: '7KQ2M-XW9PA' })
    expect(flow.error.value).toBeNull()
    expect(sessionRefetch).toHaveBeenCalled()
  })

  it('moves to waitlisted in early access, and from there to invite-code with the same code', async () => {
    const flow = inSetup(() => useLoginFlow())
    flow.email.value = 'new@resend.dev'
    flow.otp.value = '123456'
    client.signIn.emailOtp.mockResolvedValueOnce(ticketRequired('early-access'))
    await flow.verifyCode()
    expect(flow.step.value).toBe('waitlisted')
    flow.goTo('invite-code')
    expect(flow.otp.value).toBe('123456')
  })

  it('keeps the place on the waitlist the refusal carried, and drops it with the flow', async () => {
    const flow = inSetup(() => useLoginFlow())
    flow.email.value = 'new@resend.dev'
    flow.otp.value = '123456'
    expect(flow.waitlist.value).toBeNull()
    client.signIn.emailOtp.mockResolvedValueOnce(ticketRequired('early-access', undefined, { position: 48, total: 1204, token: 'entry.signature' }))
    await flow.verifyCode()
    expect(flow.step.value).toBe('waitlisted')
    expect(flow.waitlist.value).toEqual({ position: 48, total: 1204, token: 'entry.signature' })
    flow.reset()
    expect(flow.waitlist.value).toBeNull()
  })

  it('stays on invite-code when the code given admits nobody', async () => {
    const flow = inSetup(() => useLoginFlow())
    flow.email.value = 'new@resend.dev'
    flow.otp.value = '123456'
    client.signIn.emailOtp.mockResolvedValueOnce(ticketRequired('invite-only'))
    await flow.verifyCode()
    client.signIn.emailOtp.mockResolvedValueOnce(ticketRequired('invite-only', 'used-up'))
    flow.inviteCode.value = 'USED1'
    await flow.redeemInviteCode()
    expect(flow.step.value).toBe('invite-code')
  })

  it('hands over the code a tab kept from an access link', async () => {
    sessionStorage.setItem('nuxt-backend:invite', 'LINKTOKEN')
    const flow = inSetup(() => useLoginFlow())
    flow.email.value = 'new@resend.dev'
    flow.otp.value = '123456'
    await flow.verifyCode()
    expect(client.signIn.emailOtp).toHaveBeenLastCalledWith({ email: 'new@resend.dev', otp: '123456', inviteCode: 'LINKTOKEN' })
    // Used: the tab keeps it no longer.
    expect(sessionStorage.getItem('nuxt-backend:invite')).toBeNull()
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

  it('walks to the OTP step and emits step + success', async () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
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

  // Apps build on these names and props (the site's own sign-in page does):
  // they change only with a breaking release.
  it('keeps its slot names, each with the whole flow as its props', async () => {
    // A browser that can save a passkey, so the offer stays on screen.
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
    const FLOW_KEYS = [
      'addPasskey', 'age', 'bind', 'email', 'emailValid', 'error', 'goTo', 'inviteCode', 'isPending', 'lastMethod', 'otp',
      'passkeyRequired', 'recover', 'recoveryCode', 'redeemInviteCode', 'reset', 'retryAfter', 'sendCode', 'signInWithPasskey', 'skipPasskey', 'step', 'submitAge', 'verifyCode', 'waitlist',
    ]
    const seen = new Map<string, string[]>()
    let flow!: UseLoginFlowReturn
    const record = (name: string) => (props: UseLoginFlowReturn) => {
      if (name === 'header') flow = props
      seen.set(name, Object.keys(props).sort())
      return h('i', { 'data-slot': name })
    }
    const names = ['header', 'choose', 'request-code', 'verify-code', 'passkey-offer', 'recover', 'waitlisted', 'invite-code', 'age', 'undeliverable', 'error', 'footer'] as const
    const wrapper = mount(AuthForm, { slots: Object.fromEntries(names.map(name => [name, record(name)])) })
    for (const step of ['request-code', 'verify-code', 'passkey-offer', 'recover', 'waitlisted', 'invite-code', 'age', 'undeliverable'] as const) {
      flow.goTo(step)
      await nextTick()
      expect(wrapper.find(`[data-slot="${step}"]`).exists()).toBe(true)
    }
    flow.error.value = { code: 'unauthenticated', data: {}, message: 'Sign in to continue.' }
    await nextTick()

    expect([...seen.keys()].sort()).toEqual([...names].sort())
    for (const name of names) expect(seen.get(name)).toEqual(FLOW_KEYS)
  })

  it('renders errors with role=alert and emits them', async () => {
    client.signIn.passkey.mockResolvedValueOnce({ data: null, error: { message: 'No passkey found', status: 400, statusText: 'Bad Request' } })
    const wrapper = mount(AuthForm)
    await wrapper.find('[data-auth="passkey-sign-in"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-auth="error"]').text()).toBe('No passkey found'))
    expect(wrapper.emitted('error')).toStrictEqual([['No passkey found']])
  })

  it('is busy while a ceremony runs', async () => {
    let release!: () => void
    client.signIn.passkey.mockImplementationOnce(() => new Promise<Answer>((resolve) => {
      release = () => resolve(ok({ session: { id: 's1' }, user: ada }))
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

describe('AuthForm accessibility and labels', () => {
  it('marks the field a refusal names, described by the refusal', async () => {
    client.emailOtp.sendVerificationOtp.mockResolvedValueOnce({ data: null, error: { code: 'INVALID_EMAIL', message: 'Invalid email', status: 400, statusText: 'Bad Request' } })
    const wrapper = mount(AuthForm)
    await wrapper.find('[data-auth="otp-start"]').trigger('click')
    const input = () => wrapper.find('[data-auth="input-email"]')
    await input().setValue('ada@example.com')
    expect(input().attributes('aria-invalid')).toBeUndefined()
    await wrapper.find('[data-auth="step-request-code"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-auth="error"]').exists()).toBe(true))
    expect(input().attributes('aria-invalid')).toBe('true')
    expect(input().attributes('aria-describedby')).toBe(wrapper.find('[data-auth="error"]').attributes('id'))
    // The email step asks for the address alone: the name is asked once the account exists.
    expect(wrapper.find('[data-auth="input-name"]').exists()).toBe(false)
  })

  it('points at no error element an error slot replaced', async () => {
    client.emailOtp.sendVerificationOtp.mockResolvedValueOnce({ data: null, error: { code: 'INVALID_EMAIL', message: 'Invalid email', status: 400, statusText: 'Bad Request' } })
    const wrapper = mount(AuthForm, { slots: { error: () => h('p', { id: 'mine' }, 'custom') } })
    await wrapper.find('[data-auth="otp-start"]').trigger('click')
    await wrapper.find('[data-auth="input-email"]').setValue('ada@example.com')
    await wrapper.find('[data-auth="step-request-code"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('#mine').exists()).toBe(true))
    const input = wrapper.find('[data-auth="input-email"]')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toBeUndefined()
  })

  it('describes the code field by where the code went', async () => {
    const wrapper = mount(AuthForm)
    await wrapper.find('[data-auth="otp-start"]').trigger('click')
    await wrapper.find('[data-auth="input-email"]').setValue('ada@example.com')
    await wrapper.find('[data-auth="step-request-code"]').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-auth="sent-note"]').exists()).toBe(true))
    expect(wrapper.find('[data-auth="input-otp"]').attributes('aria-describedby')).toBe(wrapper.find('[data-auth="sent-note"]').attributes('id'))
  })

  it('moves focus on a step the person took, and only then', async () => {
    let flow!: UseLoginFlowReturn
    const footer = (props: UseLoginFlowReturn) => {
      flow = props
      return null
    }
    const wrapper = mount(AuthForm, { attachTo: document.body, slots: { footer } })
    try {
      await wrapper.find('[data-auth="otp-start"]').trigger('click')
      await vi.waitFor(() => expect(document.activeElement).toBe(wrapper.find('[data-auth="input-email"]').element))
      // A step the code takes (here, an app's own reset) leaves focus where it was.
      const back = wrapper.find('[data-auth="back"]').element as HTMLElement
      back.focus()
      flow.reset()
      await nextTick()
      await nextTick()
      expect(document.activeElement).not.toBe(wrapper.find('[data-auth="otp-start"]').element)
    }
    finally {
      wrapper.unmount()
    }
  })

  // A closed passkey prompt or a refused code leaves the step where it was:
  // the button the person pressed keeps focus, and nothing runs twice.
  it('keeps focus on a busy button, ignores presses while it waits, and keeps focus once the step fails', async () => {
    let refuse!: () => void
    client.emailOtp.sendVerificationOtp.mockImplementationOnce(() => new Promise<Answer>((resolve) => {
      refuse = () => resolve({ data: null, error: { code: 'rate_limited', limit: 'emailOtp', retryAfter: 5000, message: 'Too many requests. Try again in 5 seconds.', status: 429, statusText: 'Too Many Requests' } })
    }))
    const wrapper = mount(AuthForm, { attachTo: document.body })
    try {
      await wrapper.find('[data-auth="otp-start"]').trigger('click')
      await wrapper.find('[data-auth="input-email"]').setValue('ada@example.com')
      const submit = wrapper.find('[data-auth="submit"]')
      ;(submit.element as HTMLElement).focus()
      await wrapper.find('[data-auth="step-request-code"]').trigger('submit')
      expect(submit.attributes('aria-disabled')).toBe('true')
      expect(submit.attributes('disabled')).toBeUndefined()
      expect(document.activeElement).toBe(submit.element)
      // Another submit (Enter in a field) and Back wait for the step.
      await wrapper.find('[data-auth="step-request-code"]').trigger('submit')
      await wrapper.find('[data-auth="back"]').trigger('click')
      expect(client.emailOtp.sendVerificationOtp).toHaveBeenCalledOnce()
      expect(wrapper.find('[data-auth="step-request-code"]').exists()).toBe(true)

      refuse()
      await vi.waitFor(() => expect(wrapper.find('[data-auth="error"]').exists()).toBe(true))
      expect(submit.attributes('aria-disabled')).toBeUndefined()
      expect(document.activeElement).toBe(submit.element)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('says what it is waiting for while a step runs', async () => {
    let release!: () => void
    client.emailOtp.sendVerificationOtp.mockImplementationOnce(() => new Promise<Answer>((resolve) => {
      release = () => resolve(ok())
    }))
    const wrapper = mount(AuthForm)
    await wrapper.find('[data-auth="otp-start"]').trigger('click')
    await wrapper.find('[data-auth="input-email"]').setValue('ada@example.com')
    await wrapper.find('[data-auth="step-request-code"]').trigger('submit')
    expect(wrapper.find('[data-auth="submit"]').text()).toBe('Sending the code…')
    release()
    await vi.waitFor(() => expect(wrapper.find('[data-auth="step-verify-code"]').exists()).toBe(true))
  })

  it('sends one code however often the form is submitted while it sends, keeping focus on the button', async () => {
    let release!: () => void
    client.emailOtp.sendVerificationOtp.mockImplementationOnce(() => new Promise<Answer>((resolve) => {
      release = () => resolve(ok())
    }))
    const wrapper = mount(AuthForm, { attachTo: document.body })
    try {
      await wrapper.find('[data-auth="otp-start"]').trigger('click')
      await wrapper.find('[data-auth="input-email"]').setValue('ada@example.com')
      const submit = wrapper.find('[data-auth="submit"]')
      ;(submit.element as HTMLElement).focus()
      await wrapper.find('[data-auth="step-request-code"]').trigger('submit')
      expect(submit.attributes('aria-disabled')).toBe('true')
      expect(submit.attributes('disabled')).toBeUndefined()
      expect(document.activeElement).toBe(submit.element)
      await wrapper.find('[data-auth="step-request-code"]').trigger('submit')
      await wrapper.find('[data-auth="back"]').trigger('click')
      expect(client.emailOtp.sendVerificationOtp).toHaveBeenCalledTimes(1)
      expect(wrapper.find('[data-auth="step-request-code"]').exists()).toBe(true)
      release()
      await vi.waitFor(() => expect(wrapper.find('[data-auth="step-verify-code"]').exists()).toBe(true))
    }
    finally {
      wrapper.unmount()
    }
  })

  it('takes its copy from the labels prop over app config', async () => {
    backendConfig.labels = { auth: { emailCode: 'From config', title: 'Config title' } } as never
    const wrapper = mount(AuthForm, { props: { labels: { emailCode: 'From the prop' } } })
    expect(wrapper.find('[data-auth="otp-start"]').text()).toBe('From the prop')
    expect(wrapper.find('[data-auth="title"]').text()).toBe('Config title')
    await wrapper.find('[data-auth="otp-start"]').trigger('click')
    expect(wrapper.find('[data-auth="submit"]').text()).toBe('Email me a code')
  })
})

describe('useLoginFlow rate limits', () => {
  /**
   * What better-fetch hands back for the package's 429: the JSON body spread
   * next to the status, with the English label as its `message`.
   */
  const seconds = (count: number) => `Too many requests. Try again in ${count} second${count === 1 ? '' : 's'}.`
  const limited = (retryAfter?: number): Answer => ({
    data: null,
    error: {
      code: 'rate_limited',
      limit: 'emailOtp',
      message: retryAfter === undefined ? 'Too many requests. Try again in a moment.' : seconds(Math.ceil(retryAfter / 1000)),
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
    expect(flow.error.value).toMatchObject({ code: 'rate_limited', data: { retryAfter: 4200 }, message: 'Too many requests. Try again in 5 seconds.' })
    expect(flow.retryAfter.value).toBe(5)
    expect(flow.step.value).toBe('request-code')
    expect(flow.isPending.value).toBe(false)

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
    expect(flow.error.value?.message).toBe('Too many requests. Try again in 1 second.')
    expect(flow.retryAfter.value).toBe(1)
  })

  it('a 429 without retryAfter (Better Auth\'s own limiter) says "in a moment"', async () => {
    // The built-in limiter's body has only a message; its X-Retry-After
    // header never reaches the client's error object.
    client.signIn.emailOtp.mockResolvedValueOnce({ data: null, error: { message: 'Too many requests. Please try again later.', status: 429, statusText: 'Too Many Requests' } })
    const flow = inSetup(() => useLoginFlow())
    flow.email.value = 'ada@example.com'
    await flow.sendCode()
    flow.otp.value = '123456'
    await flow.verifyCode()
    expect(flow.error.value).toMatchObject({ code: 'rate_limited', message: 'Too many requests. Try again in a moment.' })
    expect(flow.retryAfter.value).toBeNull()
    expect(flow.step.value).toBe('verify-code')
    expect(sessionRefetch).not.toHaveBeenCalled()
  })

  it('a non-429 error is unchanged', async () => {
    client.signIn.emailOtp.mockResolvedValueOnce({ data: null, error: { message: 'Invalid code', status: 400, statusText: 'Bad Request', retryAfter: 4200 } })
    const flow = inSetup(() => useLoginFlow())
    flow.email.value = 'ada@example.com'
    await flow.sendCode()
    flow.otp.value = '000000'
    await flow.verifyCode()
    // No catalog code: unavailable/unexpected, keeping the auth server's sentence.
    expect(flow.error.value).toMatchObject({ code: 'unavailable', data: { service: 'backend', reason: 'unexpected' }, message: 'Invalid code' })
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

const { useAuthSession: useAuth } = await import('../../src/runtime/vue/utils/auth-session')

/** A browser that signed in on this site before, as the cookie that sign-in set says. */
function signedInBefore(method: string) {
  document.cookie = `${LAST_USED}=${method}; path=/`
}

describe('the way this browser last signed in', () => {
  it('is what the sign-in cookie says, and only a way the package signs in', () => {
    expect(inSetup(() => useAuth()).lastSignInMethod.value).toBeNull()
    signedInBefore('passkey')
    clearNuxtState('backend:last-sign-in-method')
    expect(inSetup(() => useAuth()).lastSignInMethod.value).toBe('passkey')
    // A cookie is the browser's to write: a method the package has no button for reads as none.
    signedInBefore('github')
    clearNuxtState('backend:last-sign-in-method')
    expect(inSetup(() => useAuth()).lastSignInMethod.value).toBeNull()
  })

  it('falls back to the account\'s own record once signed in, where the browser has no cookie', () => {
    user.value = { ...ada, lastLoginMethod: 'passkey' }
    expect(inSetup(() => useAuth()).lastSignInMethod.value).toBe('passkey')
    // This browser's own sign-in wins over one made elsewhere.
    signedInBefore('email-otp')
    clearNuxtState('backend:last-sign-in-method')
    expect(inSetup(() => useAuth()).lastSignInMethod.value).toBe('email-otp')
  })

  it('follows a sign-in made on the page, for every reader of it', async () => {
    const reader = inSetup(() => useAuth())
    const auth = inSetup(() => useAuth())
    await auth.signInWithOtp({ email: ada.email, otp: '123456' })
    expect(reader.lastSignInMethod.value).toBe('email-otp')
    await auth.signInWithPasskey()
    expect(reader.lastSignInMethod.value).toBe('passkey')
    // A refused sign-in changes nothing.
    client.signIn.emailOtp.mockResolvedValueOnce({ data: null, error: { message: 'Invalid OTP', status: 400, statusText: 'Bad Request' } })
    await expect(auth.signInWithOtp({ email: ada.email, otp: '000000' })).rejects.toThrow('Invalid OTP')
    expect(reader.lastSignInMethod.value).toBe('passkey')
  })
})

describe('useLoginFlow({ preferLastMethod })', () => {
  it('opens on the email step after a code sign-in, and on the first step otherwise', () => {
    signedInBefore('email-otp')
    const flow = inSetup(() => useLoginFlow({ preferLastMethod: true }))
    expect(flow.step.value).toBe('request-code')
    expect(flow.lastMethod.value).toBe('email-otp')
    // Without the option, the flow opens where it always did.
    expect(inSetup(() => useLoginFlow()).step.value).toBe('choose')

    clearNuxtState('backend:last-sign-in-method')
    signedInBefore('passkey')
    expect(inSetup(() => useLoginFlow({ preferLastMethod: true })).step.value).toBe('choose')
  })

  it('returns to that step on reset', async () => {
    signedInBefore('email-otp')
    const flow = inSetup(() => useLoginFlow({ preferLastMethod: true }))
    flow.email.value = 'ada@example.com'
    await flow.sendCode()
    expect(flow.step.value).toBe('verify-code')
    flow.reset()
    expect(flow.step.value).toBe('request-code')
    expect(flow.email.value).toBe('')
  })
})

describe('<AuthForm> and the last way in', () => {
  it('marks the passkey button "Last used", as its description, outside its name', () => {
    signedInBefore('passkey')
    const wrapper = mount(AuthForm)
    const button = wrapper.find('[data-auth="passkey-sign-in"]')
    const mark = button.find('[data-auth="last-used"]')
    expect(mark.text()).toBe('Last used')
    expect(mark.attributes('aria-hidden')).toBe('true')
    expect(button.attributes('aria-describedby')).toBe(mark.attributes('id'))
    // Only the method last used carries it.
    expect(wrapper.find('[data-auth="otp-start"] [data-auth="last-used"]').exists()).toBe(false)
    expect(wrapper.find('[data-auth="otp-start"]').attributes('aria-describedby')).toBeUndefined()
  })

  it('opens on the email step after a code sign-in, with the mark on the way back', async () => {
    signedInBefore('email-otp')
    const wrapper = mount(AuthForm)
    expect(wrapper.find('[data-auth="step-request-code"]').exists()).toBe(true)
    // The step the form opened on is no step the person took.
    expect(wrapper.emitted('step')).toBeUndefined()

    await wrapper.find('[data-auth="back"]').trigger('click')
    const start = wrapper.find('[data-auth="otp-start"]')
    expect(start.find('[data-auth="last-used"]').text()).toBe('Last used')
    expect(wrapper.find('[data-auth="passkey-sign-in"] [data-auth="last-used"]').exists()).toBe(false)
  })

  it('marks nothing in a browser that never signed in', () => {
    const wrapper = mount(AuthForm)
    expect(wrapper.find('[data-auth="step-choose"]').exists()).toBe(true)
    expect(wrapper.find('[data-auth="last-used"]').exists()).toBe(false)
  })

  // The keyboard's path through the form: the mark is no stop of its own,
  // and the form takes focus only when the person moves it on.
  it('keeps the keyboard\'s path: no stop for the mark, and focus only where the person moved it', async () => {
    // A browser with passkeys, but none to offer in the field.
    webauthn(false)
    signedInBefore('email-otp')
    const wrapper = mount(AuthForm, { attachTo: document.body })
    try {
      // Opened on the email step by itself: focus stays where it was.
      await nextTick()
      expect(document.activeElement).toBe(document.body)
      const stops = () => [...(wrapper.element as HTMLElement).querySelectorAll<HTMLElement>('input, button, [tabindex]')]
        .filter(element => element.tabIndex >= 0)
        .map(element => element.dataset.auth)
      expect(stops()).toEqual(['input-email', 'submit', 'back'])

      // Back, from the keyboard: focus lands on the first step's first control.
      ;(wrapper.find('[data-auth="back"]').element as HTMLButtonElement).focus()
      await wrapper.find('[data-auth="back"]').trigger('click')
      await vi.waitFor(() => expect(document.activeElement).toBe(wrapper.find('[data-auth="passkey-sign-in"]').element))
      expect(stops()).toEqual(['passkey-sign-in', 'otp-start', 'lost-passkey'])
      expect(wrapper.find('[data-auth="last-used"]').element.closest('button')).toBe(wrapper.find('[data-auth="otp-start"]').element)
    }
    finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })
})

/** A browser whose WebAuthn can offer passkeys in a field's autofill, or not; the check it answers, for counting. */
function webauthn(autofill: boolean) {
  const isConditionalMediationAvailable = vi.fn(async () => autofill)
  vi.stubGlobal('PublicKeyCredential', Object.assign(function PublicKeyCredential() {}, { isConditionalMediationAvailable }))
  return isConditionalMediationAvailable
}

type AutofillOptions = { autoFill?: boolean, fetchOptions?: { onRequest?: (context?: { body?: unknown }) => void } }

/**
 * An autofill offer the test settles. `pick` is the person picking a
 * passkey: the answer's request starts (Better Auth sends `fetchOptions`
 * with it alone), then the answer comes back. `end` is an offer that ends
 * before anyone picked one.
 */
function waitingPasskey() {
  let settle!: (answer: Answer) => void
  let options: AutofillOptions | undefined
  client.signIn.passkey.mockImplementationOnce(((given?: AutofillOptions) => new Promise<Answer>((resolve) => {
    options = given
    settle = resolve
  })) as never)
  return {
    pick: (answer: Answer) => {
      options?.fetchOptions?.onRequest?.()
      settle(answer)
    },
    end: (answer: Answer) => settle(answer),
  }
}

const autofillCalls = () => client.signIn.passkey.mock.calls.filter(call => ((call as unknown[])[0] as AutofillOptions | undefined)?.autoFill === true)

/** Better Auth's answer to a failed passkey ceremony or route, as its client shapes it. */
const failed = (code: string, status = 400): Answer => ({ data: null, error: { code, message: code, status, statusText: 'ERROR' } })

describe('passkey autofill', () => {
  beforeEach(() => {
    // An answer one test queued and never used is no answer of the next one's.
    client.signIn.passkey.mockReset()
    webauthn(true)
    return () => {
      vi.useRealTimers()
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
      document.body.innerHTML = ''
    }
  })

  it('offers passkeys in the email field, which autocompletes as `username webauthn`, and signs in with the one picked', async () => {
    const offer = waitingPasskey()
    const wrapper = mount(AuthForm, { attachTo: document.body })
    await flushAutofill()
    expect(client.signIn.passkey).not.toHaveBeenCalled()

    await wrapper.find('[data-auth="otp-start"]').trigger('click')
    expect(wrapper.find('[data-auth="input-email"]').attributes('autocomplete')).toBe('username webauthn')
    await vi.waitFor(() => expect(client.signIn.passkey).toHaveBeenCalledWith(expect.objectContaining({ autoFill: true })))
    // Waiting on the person is not being busy.
    expect(wrapper.find('[data-auth="form"]').attributes('aria-busy')).toBeUndefined()
    expect(wrapper.find('[data-auth="submit"]').attributes('aria-disabled')).toBeUndefined()

    offer.pick(ok({ session: { id: 's1' }, user: ada }))
    await vi.waitFor(() => expect(wrapper.emitted('success')).toHaveLength(1))
    expect(sessionRefetch).toHaveBeenCalled()
    expect(wrapper.find('[data-auth="error"]').exists()).toBe(false)
    wrapper.unmount()
  })

  // The first step has buttons and no field: the flow checks the markup
  // before it asks the browser anything, so <AuthForm> never warns a
  // developer that their field is missing.
  it('asks nothing, and says nothing, on a step without the field', async () => {
    const check = webauthn(true)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(AuthForm, { attachTo: document.body })
    await flushAutofill()
    expect(wrapper.find('[data-auth="step-choose"]').exists()).toBe(true)
    // And after a prompt closed on that step.
    client.signIn.passkey.mockResolvedValueOnce(failed('ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY'))
    await wrapper.find('[data-auth="passkey-sign-in"]').trigger('click')
    await flushAutofill()
    expect(autofillCalls()).toHaveLength(0)
    expect(check).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('asks nothing of the server where the browser cannot offer them, or the page has no such field', async () => {
    webauthn(false)
    signedInBefore('email-otp')
    const wrapper = mount(AuthForm, { attachTo: document.body })
    await flushAutofill()
    expect(client.signIn.passkey).not.toHaveBeenCalled()
    wrapper.unmount()

    // A page of its own whose email field leaves `webauthn` out.
    webauthn(true)
    const custom = mount(defineComponent({
      setup() {
        const flow = useLoginFlow({ autofill: true })
        flow.goTo('request-code')
        return () => h('input', { autocomplete: 'email' })
      },
    }), { attachTo: document.body })
    await flushAutofill()
    expect(client.signIn.passkey).not.toHaveBeenCalled()
    custom.unmount()
  })

  it('offers once at a time, and never while signed in', async () => {
    waitingPasskey()
    signedInBefore('email-otp')
    const wrapper = mount(AuthForm, { attachTo: document.body })
    await vi.waitFor(() => expect(autofillCalls()).toHaveLength(1))
    // Back and forth: the offer still waiting serves the field again.
    await wrapper.find('[data-auth="back"]').trigger('click')
    await wrapper.find('[data-auth="otp-start"]').trigger('click')
    await flushAutofill()
    expect(autofillCalls()).toHaveLength(1)
    wrapper.unmount()

    // Signed in already: the form opens on the email step and asks nothing.
    user.value = ada
    const signedIn = mount(AuthForm, { attachTo: document.body })
    expect(signedIn.find('[data-auth="input-email"]').exists()).toBe(true)
    await flushAutofill()
    expect(autofillCalls()).toHaveLength(1)
    signedIn.unmount()
  })

  it('gives way to the passkey prompt without a word, then offers again once the prompt closed', async () => {
    const offer = waitingPasskey()
    const flow = mountFlow()
    await vi.waitFor(() => expect(autofillCalls()).toHaveLength(1))

    // The tap: the prompt's request goes out in the tap's own task, and the
    // ceremony it starts ends the autofill's before anyone picked a passkey.
    client.signIn.passkey.mockImplementationOnce(async () => {
      offer.end(failed('ERROR_CEREMONY_ABORTED'))
      return failed('ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY')
    })
    const tap = flow.value.signInWithPasskey()
    expect(client.signIn.passkey).toHaveBeenLastCalledWith({ fetchOptions: expect.any(Object) })
    await tap
    // The prompt's own end is the one the person reads.
    expect(flow.value.error.value).toMatchObject({ code: 'invalid_input', data: { field: 'passkey' } })
    await vi.waitFor(() => expect(autofillCalls()).toHaveLength(2))
  })

  it('says why a passkey picked there was refused, and does not ask again by itself', async () => {
    const offer = waitingPasskey()
    const flow = mountFlow()
    await vi.waitFor(() => expect(autofillCalls()).toHaveLength(1))
    offer.pick(failed('PASSKEY_NOT_FOUND', 401))
    await vi.waitFor(() => expect(flow.value.error.value).toMatchObject({ code: 'invalid_input', data: { field: 'passkey' } }))
    expect(flow.value.step.value).toBe('request-code')
    await flushAutofill()
    expect(autofillCalls()).toHaveLength(1)
  })

  it('says a passkey did not work when its answer was lost on the way, not that a prompt was closed', async () => {
    const offer = waitingPasskey()
    const flow = mountFlow()
    await vi.waitFor(() => expect(autofillCalls()).toHaveLength(1))
    // Better Auth's answer when the verify request itself threw.
    offer.pick(failed('AUTH_CANCELLED'))
    await vi.waitFor(() => expect(flow.value.error.value).toMatchObject({ code: 'invalid_input', data: { field: 'passkey' } }))
    expect(flow.value.error.value?.data).not.toHaveProperty('reason')
  })

  // Whatever ends the offer before the person picked a passkey, the page
  // opened with nothing to say: the field simply offers none.
  it.each([
    ['a rate-limited challenge', { data: null, error: { code: 'rate_limited', limit: 'passkeySignInGlobal', retryAfter: 60_000, message: 'Too many requests.', status: 429, statusText: 'Too Many Requests' } }],
    ['a server error on the challenge', failed('INTERNAL_SERVER_ERROR', 500)],
    ['a ceremony that could not load', { data: null, error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch dynamically imported module', status: 500, statusText: 'INTERNAL_SERVER_ERROR' } }],
    ['a relying party that does not match the page', failed('ERROR_INVALID_RP_ID')],
    ['a request the browser let go', failed('AUTH_CANCELLED')],
  ] as const)('ends quietly on %s', async (_, answer) => {
    const offer = waitingPasskey()
    const flow = mountFlow()
    await vi.waitFor(() => expect(autofillCalls()).toHaveLength(1))
    offer.end(answer as Answer)
    await flushAutofill()
    expect(flow.value.error.value).toBeNull()
    expect(autofillCalls()).toHaveLength(1)
  })

  it('waits on useAuth() without wiping what an action the person ran said, and resolves null once it ended', async () => {
    const page = mount(() => h('input', { autocomplete: 'username webauthn' }), { attachTo: document.body })
    const auth = inSetup(() => useAuth())
    client.signIn.emailOtp.mockResolvedValueOnce(failed('INVALID_OTP'))
    await expect(auth.signInWithOtp({ email: ada.email, otp: '000000' })).rejects.toThrow()
    const said = auth.error.value
    expect(said).toMatchObject({ code: 'invalid_input', data: { field: 'otp' } })

    const offer = waitingPasskey()
    const offered = auth.signInWithPasskey({ autoFill: true })
    await vi.waitFor(() => expect(autofillCalls()).toHaveLength(1))
    expect(auth.error.value).toBe(said)
    expect(auth.isPending.value).toBe(false)
    offer.end(failed('INTERNAL_SERVER_ERROR', 500))
    await expect(offered).resolves.toBeNull()
    expect(auth.error.value).toBe(said)
    page.unmount()
  })

  it('offers a fresh challenge when the one picked had expired, and says nothing', async () => {
    const offer = waitingPasskey()
    const flow = mountFlow()
    await vi.waitFor(() => expect(autofillCalls()).toHaveLength(1))
    waitingPasskey()
    offer.pick(failed('CHALLENGE_NOT_FOUND'))
    await vi.waitFor(() => expect(autofillCalls()).toHaveLength(2))
    expect(flow.value.error.value).toBeNull()
  })

  // A challenge lasts five minutes: an offer left waiting is renewed before
  // its challenge expires, and a passkey picked after that still signs in.
  it('renews the offer before its challenge expires, while the page is in view', async () => {
    vi.useFakeTimers()
    const first = waitingPasskey()
    const flow = mountFlow()
    await vi.waitFor(() => expect(autofillCalls()).toHaveLength(1))
    const renewed = waitingPasskey()
    await vi.advanceTimersByTimeAsync(AUTOFILL_RENEW_MS - 1000)
    expect(autofillCalls()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(autofillCalls()).toHaveLength(2)
    // The new ceremony ends the old one, quietly.
    first.end(failed('ERROR_CEREMONY_ABORTED'))
    renewed.pick(ok({ session: { id: 's1' }, user: ada }))
    await vi.waitFor(() => expect(sessionRefetch).toHaveBeenCalled())
    expect(flow.value.error.value).toBeNull()
  })

  it('renews a hidden page\'s offer once the page is seen again, and stops when the flow is gone', async () => {
    vi.useFakeTimers()
    let visibility: DocumentVisibilityState = 'hidden'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
    try {
      waitingPasskey()
      const wrapper = mountFlowWrapper()
      await vi.waitFor(() => expect(autofillCalls()).toHaveLength(1))
      waitingPasskey()
      await vi.advanceTimersByTimeAsync(AUTOFILL_RENEW_MS * 3)
      // No challenge spent on a tab no one looks at.
      expect(autofillCalls()).toHaveLength(1)
      visibility = 'visible'
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.waitFor(() => expect(autofillCalls()).toHaveLength(2))

      wrapper.unmount()
      await vi.advanceTimersByTimeAsync(AUTOFILL_RENEW_MS * 2)
      expect(autofillCalls()).toHaveLength(2)
    }
    finally {
      Reflect.deleteProperty(document, 'visibilityState')
    }
  })
})

/** Let an autofill offer that was going to start, start. */
async function flushAutofill() {
  for (let tick = 0; tick < 5; tick++) await new Promise(resolve => setTimeout(resolve, 0))
}

/** A page of its own on the flow, with autofill on and its email field marked for passkeys, on the email step. */
function mountFlowWrapper(flow = { value: undefined as unknown as UseLoginFlowReturn }) {
  return mount(defineComponent({
    setup() {
      flow.value = useLoginFlow({ autofill: true })
      flow.value.goTo('request-code')
      return () => h('input', { autocomplete: 'username webauthn' })
    },
  }), { attachTo: document.body })
}

/** The flow of {@link mountFlowWrapper}'s page. */
function mountFlow() {
  const flow = { value: undefined as unknown as UseLoginFlowReturn }
  mountFlowWrapper(flow)
  return flow
}

// A page the server did not render for this visitor (prerendered, or from a
// cache) carries the method of the request it was rendered for. Once
// hydrated, the browser reads its own cookie: the state follows it, and a
// flow still on the step it opened on moves there.
describe('a page rendered for someone else', () => {
  it('reads this browser\'s own cookie once hydrated, and an untouched flow follows it', async () => {
    const nuxtApp = useNuxtApp()
    expect(nuxtApp.isHydrating).toBe(false)
    signedInBefore('email-otp')
    // The server rendered the page for a browser that last used a passkey.
    nuxtApp.payload.state['$sbackend:last-sign-in-method'] = 'passkey'
    nuxtApp.isHydrating = true
    try {
      const untouched = inSetup(() => useLoginFlow({ preferLastMethod: true }))
      const moved = inSetup(() => useLoginFlow({ preferLastMethod: true }))
      const reader = inSetup(() => useAuth())
      expect(untouched.step.value).toBe('choose')
      expect(reader.lastSignInMethod.value).toBe('passkey')
      moved.goTo('request-code')
      moved.goTo('choose')
      moved.email.value = 'ada@example.com'
      moved.goTo('verify-code')

      nuxtApp.isHydrating = false
      await nuxtApp.callHook('app:suspense:resolve')
      expect(reader.lastSignInMethod.value).toBe('email-otp')
      expect(untouched.step.value).toBe('request-code')
      expect(moved.step.value).toBe('verify-code')
    }
    finally {
      nuxtApp.isHydrating = false
    }
  })
})

describe('useLoginFlow, the minimum age', () => {
  const ageRequired = { data: null, error: { code: 'forbidden', reason: 'age_required', message: 'Tell us how old you are to continue.', status: 403, statusText: 'FORBIDDEN' } }
  const underAge = { data: null, error: { code: 'forbidden', reason: 'under_age', message: 'We can\'t create an account for you.', status: 403, statusText: 'FORBIDDEN' } }

  it('moves to age when the new address is asked how old it is, keeping the code, and sends both once typed', async () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
    client.signIn.emailOtp.mockResolvedValueOnce(ageRequired)
    const flow = inSetup(() => useLoginFlow())
    flow.goTo('request-code')
    flow.email.value = 'new@example.com'
    await flow.sendCode()
    flow.otp.value = '123456'
    await flow.verifyCode()
    expect(flow.step.value).toBe('age')
    expect(flow.error.value).toBeNull()
    expect(flow.otp.value).toBe('123456')

    flow.age.value = '34'
    await flow.submitAge()
    expect(client.signIn.emailOtp).toHaveBeenLastCalledWith(expect.objectContaining({ email: 'new@example.com', otp: '123456', age: 34 }))
    expect(flow.step.value).toBe('passkey-offer')
  })

  it('stays on age with the reason for an answer that is no number, and sends nothing', async () => {
    client.signIn.emailOtp.mockResolvedValueOnce(ageRequired)
    const flow = inSetup(() => useLoginFlow())
    flow.goTo('request-code')
    flow.email.value = 'new@example.com'
    await flow.sendCode()
    flow.otp.value = '123456'
    await flow.verifyCode()
    client.signIn.emailOtp.mockClear()
    flow.age.value = 'old'
    await flow.submitAge()
    expect(flow.step.value).toBe('age')
    expect(flow.error.value).toMatchObject({ code: 'invalid_input', data: { field: 'age' } })
    expect(client.signIn.emailOtp).not.toHaveBeenCalled()
  })

  it('shows the refusal of an age under the minimum on the age step, with no account', async () => {
    client.signIn.emailOtp.mockResolvedValueOnce(ageRequired).mockResolvedValueOnce(underAge)
    const flow = inSetup(() => useLoginFlow())
    flow.goTo('request-code')
    flow.email.value = 'kid@example.com'
    await flow.sendCode()
    flow.otp.value = '123456'
    await flow.verifyCode()
    flow.age.value = '12'
    await flow.submitAge()
    expect(flow.step.value).toBe('age')
    expect(flow.error.value).toMatchObject({ code: 'forbidden', data: { reason: 'under_age' } })
    expect(user.value).toBeNull()
  })

  it('forgets the age when the flow starts over', async () => {
    client.signIn.emailOtp.mockResolvedValueOnce(ageRequired)
    const flow = inSetup(() => useLoginFlow())
    flow.goTo('request-code')
    flow.email.value = 'new@example.com'
    await flow.sendCode()
    flow.otp.value = '123456'
    await flow.verifyCode()
    flow.age.value = '34'
    flow.reset()
    expect(flow.age.value).toBe('')
    expect(flow.step.value).toBe('choose')
  })
})
