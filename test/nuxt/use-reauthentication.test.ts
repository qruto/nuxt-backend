import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { backendError, getBackendError } from '../../src/convex/errors'

// "Confirm it's you": useReauthentication over a stand-in auth client and
// live connection, and the dialog that drives it. A refused sensitive action
// waits for the person to sign in again, marked as a re-authentication of
// this browser's session, then runs once more on the new session's token.

type Answer = { data?: unknown, error?: Record<string, unknown> | null }
const ok = (data: unknown = { user: { id: 'u1' } }): Answer => ({ data, error: null })

const user = ref<Record<string, unknown> | null>({ id: 'u1', email: 'ada@example.com' })
/** The live connection: loading while it takes up a new session's token. */
const connecting = ref(false)
const refetch = vi.fn(async () => {
  // The session changed: the connection takes up the new token, which settles a moment later.
  connecting.value = true
  setTimeout(() => (connecting.value = false), 5)
})
const client = {
  signIn: {
    passkey: vi.fn(async (_options?: unknown): Promise<Answer> => ok()),
    emailOtp: vi.fn(async (_options?: unknown): Promise<Answer> => ok()),
  },
  emailOtp: { sendVerificationOtp: vi.fn(async (_options?: unknown): Promise<Answer> => ok({ success: true })) },
  admin: { checkRolePermission: vi.fn(() => false) },
}

vi.mock('nuxt-convex-module/better-auth/client', () => ({
  useBetterAuth: () => ({
    isLoading: computed(() => false),
    isAuthenticated: computed(() => user.value !== null),
    fetchAccessToken: vi.fn(async () => 'token'),
    client,
    session: ref({ data: { session: { id: 's1' }, user: user.value }, isPending: false, refetch }),
    user: computed(() => user.value),
    authVersion: computed(() => 's1'),
  }),
}))

const { useReauthentication } = await import('../../src/runtime/vue/composables/use-reauthentication')
const { registerComponents } = await import('../helpers/register-components')
await registerComponents('ReauthenticateDialog')
const { default: ReauthenticateDialog } = await import('../../src/runtime/vue/components/auth/ReauthenticateDialog.vue')
const { ConvexAuthStateKey } = await import('nuxt-convex-module/client')

const MARKED = { fetchOptions: { headers: { 'x-backend-reauthenticate': '1' } } }
const refusal = () => backendError('reauthentication_required')

/** The live connection the app provides, as the base module's auth plugin does. */
const connection = () => ({ [ConvexAuthStateKey as symbol]: { isLoading: computed(() => connecting.value), isAuthenticated: computed(() => true), isRefreshing: computed(() => false) } })

/**
 * The composable, called in a component under the live connection, as the
 * app does: by default one that asks the person itself (`prompt: true`),
 * as an app's own dialog would.
 */
function setup(options: { prompt?: boolean } = { prompt: true }) {
  let reauth!: ReturnType<typeof useReauthentication>
  const wrapper = mount(defineComponent({
    setup() {
      reauth = useReauthentication(options)
      return () => h('div')
    },
  }), { global: { provide: connection() } })
  return { reauth, wrapper }
}

const mounted: VueWrapper[] = []
afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
})

beforeEach(() => {
  vi.clearAllMocks()
  user.value = { id: 'u1', email: 'ada@example.com' }
  connecting.value = false
})

describe('useReauthentication', () => {
  it('runs an action that needs nothing, and asks nothing', async () => {
    const { reauth, wrapper } = setup()
    mounted.push(wrapper)
    expect(await reauth.withReauthentication(async () => 'done')).toBe('done')
    expect(reauth.isRequired.value).toBe(false)
  })

  it('asks for a code to the account\'s own address when the server refuses, then runs the action again on the new token', async () => {
    const { reauth, wrapper } = setup()
    mounted.push(wrapper)
    const action = vi.fn().mockRejectedValueOnce(refusal()).mockResolvedValueOnce('removed')
    const result = reauth.withReauthentication(action)
    await flushPromises()
    expect(reauth.isRequired.value).toBe(true)
    expect(reauth.email.value).toBe('ada@example.com')

    await reauth.sendCode()
    expect(client.emailOtp.sendVerificationOtp).toHaveBeenCalledWith({ email: 'ada@example.com', type: 'sign-in', ...MARKED })
    expect(reauth.step.value).toBe('verify-code')

    reauth.otp.value = ' 123456 '
    const verified = reauth.verifyCode()
    await verified
    expect(client.signIn.emailOtp).toHaveBeenCalledWith({ email: 'ada@example.com', otp: '123456', ...MARKED })
    expect(refetch).toHaveBeenCalledOnce()
    // The action ran again only once the connection had taken up the new token.
    expect(connecting.value).toBe(false)
    expect(await result).toBe('removed')
    expect(action).toHaveBeenCalledTimes(2)
    expect(reauth.isRequired.value).toBe(false)
    expect(reauth.step.value).toBe('choose')
  })

  it('tries the action again while the connection still carries the old token after the sign-in', async () => {
    // As in a real app: the session's refetch returns before the connection starts taking up the new token.
    refetch.mockImplementationOnce(async () => {})
    const { reauth, wrapper } = setup()
    mounted.push(wrapper)
    const action = vi.fn()
      .mockRejectedValueOnce(refusal())
      .mockRejectedValueOnce(refusal())
      .mockRejectedValueOnce(refusal())
      .mockResolvedValueOnce('replayed')
    const result = reauth.withReauthentication(action)
    await flushPromises()
    reauth.otp.value = '123456'
    await reauth.verifyCode()
    expect(await result).toBe('replayed')
    expect(action).toHaveBeenCalledTimes(4)
  })

  it('gives up after a few tries, with the refusal as it came', async () => {
    refetch.mockImplementationOnce(async () => {})
    const { reauth, wrapper } = setup()
    mounted.push(wrapper)
    const action = vi.fn().mockRejectedValue(refusal())
    const result = reauth.withReauthentication(action)
    await flushPromises()
    reauth.otp.value = '123456'
    await reauth.verifyCode()
    await expect(result).rejects.toSatisfy(error => getBackendError(error)?.code === 'reauthentication_required')
    expect(action).toHaveBeenCalledTimes(7)
  })

  it('confirms with a passkey, and keeps another account\'s refusal where the person is', async () => {
    const { reauth, wrapper } = setup()
    mounted.push(wrapper)
    client.signIn.passkey.mockResolvedValueOnce({ data: null, error: { code: 'forbidden', reason: 'other_account', status: 403, message: 'x' } })
    const result = reauth.withReauthentication(vi.fn().mockRejectedValueOnce(refusal()).mockResolvedValueOnce('saved'))
    await flushPromises()

    await reauth.withPasskey()
    expect(client.signIn.passkey).toHaveBeenCalledWith(MARKED)
    expect(reauth.error.value).toMatchObject({ code: 'forbidden', data: { reason: 'other_account' } })
    expect(reauth.isRequired.value).toBe(true)

    await reauth.withPasskey()
    expect(await result).toBe('saved')
  })

  it('rejects with the first refusal when the person cancels, and leaves the session alone', async () => {
    const { reauth, wrapper } = setup()
    mounted.push(wrapper)
    const first = refusal()
    const result = reauth.withReauthentication(vi.fn().mockRejectedValue(first))
    await flushPromises()
    reauth.cancel()
    await expect(result).rejects.toBe(first)
    expect(refetch).not.toHaveBeenCalled()
  })

  it('refuses at once, as it came, when no prompt is mounted to ask', async () => {
    // A development build also warns that the dialog is missing.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { reauth, wrapper } = setup({})
    mounted.push(wrapper)
    const first = refusal()
    const action = vi.fn().mockRejectedValue(first)
    await expect(reauth.withReauthentication(action)).rejects.toBe(first)
    expect(action).toHaveBeenCalledOnce()
    expect(reauth.isRequired.value).toBe(false)
    await expect(reauth.reauthenticate()).rejects.toMatchObject({ data: {} })
    warn.mockRestore()

    // A prompt that came and went leaves nobody to ask either.
    const prompt = setup()
    prompt.wrapper.unmount()
    await expect(reauth.withReauthentication(vi.fn().mockRejectedValue(first))).rejects.toBe(first)
  })

  it('refuses what waits when the last prompt leaves the page', async () => {
    const { reauth, wrapper } = setup()
    const first = refusal()
    const result = reauth.withReauthentication(vi.fn().mockRejectedValue(first))
    await flushPromises()
    expect(reauth.isRequired.value).toBe(true)
    wrapper.unmount()
    await expect(result).rejects.toBe(first)
    expect(reauth.isRequired.value).toBe(false)
  })

  it('passes any other failure through without asking', async () => {
    const { reauth, wrapper } = setup()
    mounted.push(wrapper)
    const other = backendError('forbidden', { reason: 'impersonating' })
    await expect(reauth.withReauthentication(async () => {
      throw other
    })).rejects.toBe(other)
    expect(reauth.isRequired.value).toBe(false)
  })

  it('serves every waiting action with one sign-in, and shares its state across calls', async () => {
    const one = setup()
    const two = setup()
    mounted.push(one.wrapper, two.wrapper)
    const first = one.reauth.withReauthentication(vi.fn().mockRejectedValueOnce(refusal()).mockResolvedValueOnce(1))
    const second = two.reauth.withReauthentication(vi.fn().mockRejectedValueOnce(refusal()).mockResolvedValueOnce(2))
    await flushPromises()
    expect(two.reauth.isRequired.value).toBe(true)
    await one.reauth.withPasskey()
    expect(await Promise.all([first, second])).toEqual([1, 2])
    expect(client.signIn.passkey).toHaveBeenCalledOnce()
  })
})

describe('<ReauthenticateDialog>', () => {
  /** A page with a button that starts a sensitive action, and the dialog. */
  function page(dialogs = 1) {
    let reauth!: ReturnType<typeof useReauthentication>
    const wrapper = mount(defineComponent({
      setup() {
        reauth = useReauthentication()
        return () => h('main', [
          h('button', { id: 'opener', type: 'button', onClick: () => reauth.reauthenticate().catch(() => {}) }, 'Remove passkey'),
          ...Array.from({ length: dialogs }, () => h(ReauthenticateDialog)),
        ])
      },
    }), { attachTo: document.body, global: { provide: connection() } })
    mounted.push(wrapper)
    return { wrapper, reauth }
  }

  it('renders nothing until a sensitive action asks', () => {
    const { wrapper } = page()
    expect(wrapper.find('dialog').exists()).toBe(false)
  })

  it('opens on its first control, closes on Escape, and gives focus back to the button that asked', async () => {
    const { wrapper, reauth } = page()
    const opener = wrapper.get<HTMLButtonElement>('#opener')
    opener.element.focus()
    await opener.trigger('click')
    await flushPromises()
    await nextTick()

    const dialog = wrapper.get('dialog[data-reauthenticate="dialog"]')
    expect(dialog.attributes('aria-labelledby')).toBe(wrapper.get('[data-reauthenticate="title"]').attributes('id'))
    expect(document.activeElement).toBe(wrapper.get('[data-reauthenticate="step-choose"] button').element)

    // Escape is the browser's cancel of a modal dialog.
    await dialog.trigger('cancel')
    await flushPromises()
    expect(reauth.isRequired.value).toBe(false)
    expect(wrapper.find('dialog').exists()).toBe(false)
    expect(document.activeElement).toBe(opener.element)
    expect(wrapper.findComponent(ReauthenticateDialog).emitted('cancelled')).toHaveLength(1)
  })

  it('moves focus to the code once one was sent, and to Cancel\'s outcome', async () => {
    const { wrapper } = page()
    await wrapper.get('#opener').trigger('click')
    await flushPromises()
    await wrapper.get('[data-reauthenticate="send-code"]').trigger('click')
    await flushPromises()
    await nextTick()
    expect(document.activeElement).toBe(wrapper.get('[data-reauthenticate="input-otp"]').element)
    expect(wrapper.get('[data-reauthenticate="sent-note"]').text()).toContain('ada@example.com')
    await wrapper.get('[data-reauthenticate="cancel"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('dialog').exists()).toBe(false)
  })

  it('opens one dialog however many are on the page', async () => {
    const { wrapper } = page(2)
    await wrapper.get('#opener').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('dialog')).toHaveLength(1)
  })

  it('shows the bot check\'s widget inside the dialog when it asks for a click, and gives focus back', async () => {
    const { challengeAnswer } = await import('../../src/runtime/vue/protection/challenge')
    let options!: Record<string, (...args: unknown[]) => void>
    const turnstile = { render: vi.fn((_host: HTMLElement, given: typeof options) => (options = given, 'widget-1')), remove: vi.fn() }
    vi.stubGlobal('turnstile', turnstile)
    try {
      const { wrapper } = page()
      await wrapper.get('#opener').trigger('click')
      await flushPromises()
      await nextTick()
      const dialog = wrapper.get('dialog').element
      const sendButton = wrapper.get<HTMLButtonElement>('[data-reauthenticate="send-code"]').element
      sendButton.focus()

      const answer = challengeAnswer('site-key', { caption: 'Confirm you are a person' })
      await flushPromises()
      const host = turnstile.render.mock.calls[0]![0]
      // Outside the open modal dialog, the page is inert: the widget lives inside it.
      expect(host.closest('dialog')).toBe(dialog)
      options['before-interactive-callback']!()
      expect(document.activeElement).toBe(host)

      options.callback!('answer-token')
      expect(await answer).toBe('answer-token')
      expect(host.isConnected).toBe(false)
      expect(document.activeElement).toBe(sendButton)
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('says why a step failed, in an alert', async () => {
    const { wrapper } = page()
    client.emailOtp.sendVerificationOtp.mockResolvedValueOnce({ data: null, error: { code: 'rate_limited', retryAfter: 30_000, status: 429 } })
    await wrapper.get('#opener').trigger('click')
    await flushPromises()
    await wrapper.get('[data-reauthenticate="send-code"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-reauthenticate="error"][role="alert"]').text()).toBe('Too many requests. Try again in 30 seconds.')
    expect(getBackendError({ error: { code: 'reauthentication_required', status: 403 } })?.message).toBe('Confirm it\'s you to continue: this needs a recent sign-in.')
  })
})
