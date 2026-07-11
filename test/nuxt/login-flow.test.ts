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
  useAuth: () => ({
    isLoading: computed(() => false),
    isAuthenticated: computed(() => user.value !== null),
    fetchAccessToken: vi.fn(async () => 'token'),
    client,
    session: ref({ data: null, isPending: false, refetch: sessionRefetch }),
    user: computed(() => user.value),
    authVersion: computed(() => null),
  }),
}))

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

  it('drops a lingering session before passkey registration', async () => {
    user.value = { id: 'other-user' }
    const flow = inSetup(() => useLoginFlow())
    flow.name.value = 'Ada'
    flow.email.value = 'ada@example.com'

    await flow.registerWithPasskey()

    expect(client.signOut).toHaveBeenCalled()
    expect(client.signOut.mock.invocationCallOrder[0]!)
      .toBeLessThan(client.passkey.addPasskey.mock.invocationCallOrder[0]!)
    expect(client.passkey.addPasskey).toHaveBeenCalledWith({
      context: JSON.stringify({ email: 'ada@example.com', name: 'Ada' }),
    })
  })

  it('requires a name for passkey registration and surfaces auth errors', async () => {
    const flow = inSetup(() => useLoginFlow())
    flow.email.value = 'ada@example.com'
    await flow.registerWithPasskey()
    expect(flow.error.value).toMatch(/name/)

    flow.name.value = 'Ada'
    client.passkey.addPasskey.mockResolvedValueOnce({ error: { message: 'User cancelled' } })
    await flow.registerWithPasskey()
    expect(flow.error.value).toBe('User cancelled')
    expect(flow.pending.value).toBe(false)
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
})
