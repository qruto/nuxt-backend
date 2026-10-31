// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { backendError } from '../../src/convex/errors'
import * as testEmail from '../../website/utils/testEmail'
import { component, NuxtLink } from './sfc'

// The sign-in demo on /docs/build/auth/sign-in (::demo-sign-in), its live part
// run in a DOM: the package's real useLoginFlow() over a stand-in for the
// session, so the demo's own logic is what is under test. That is the
// signed-in view, the passkey offer only where this browser can save one,
// one action at a time, a keyboard reader's place at every step, and
// signing out for another go. Then <SandboxIdentities>, which it shares
// with /login.

const auth = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('../../src/runtime/vue/utils/auth-session', () => ({ useAuthSession: () => auth.current }))
// The flow's runner keeps its failures off the app's error hook; there is no app here.
vi.mock('../../src/runtime/vue/utils/action-state', () => ({ quietly: <T>(start: () => T): T => start() }))
// No hydration to follow either: the page opened where it opened.
vi.mock('../../src/runtime/vue/utils/last-sign-in', () => ({ onLastSignInSettled: () => {} }))
// The app's language, from @nuxtjs/i18n: the demo has none.
vi.mock('../../src/runtime/vue/utils/active-locale', () => ({ useActiveLocale: () => () => undefined }))
// The flow's bindings read their words from the labels, in English: there is no Nuxt app here.
vi.mock('../../src/runtime/vue/composables/use-labels', () => ({ useLabels: () => ({ t: (key: string) => key, errorMessage: (error: { message?: string }) => error.message ?? '' }) }))
const { useLoginFlow } = await import('../../src/runtime/vue/composables/use-login-flow')

const IDENTITY = 'delivered+abcdefghijklmnopqrst@resend.dev'
const OTHER = 'delivered+bcdefghijklmnopqrstu@resend.dev'

/** A promise the test settles by hand, for an action caught while it runs. */
function gate() {
  let open = () => {}
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { opened, open }
}

/** The session the flow signs in to, with every call a spy. */
function session({ signedIn = false } = {}) {
  const user = ref<{ email: string } | null>(signedIn ? { email: IDENTITY } : null)
  const sendOtp = vi.fn(async (_email: string) => {})
  return {
    user,
    isLoading: ref(false),
    session: ref({ refetch: vi.fn(async () => {}) }),
    sendOtp,
    signInWithOtp: vi.fn(async ({ email }: { email: string }) => {
      user.value = { email }
    }),
    signInWithPasskey: vi.fn(async () => {
      user.value = { email: IDENTITY }
    }),
    registerPasskey: vi.fn(async () => ({})),
    signOut: vi.fn(async () => {
      user.value = null
    }),
  }
}

/** The sandbox inbox as a key that fills the code it holds. */
const SandboxInbox = defineComponent({
  props: { email: { type: String, required: true } },
  emits: ['fill'],
  setup: (_props, { emit }) => () => h('button', { 'type': 'button', 'data-fill': '', 'onClick': () => emit('fill', '123456') }, 'Fill the code'),
})

function parts() {
  return {
    SandboxIdentities: component('website/components/SandboxIdentities.vue', { '../utils/testEmail': testEmail }),
    LabField: component('website/components/LabField.vue'),
    Key: component('website/components/Key.vue'),
    Led: component('website/components/Led.vue'),
    StateReadout: component('website/components/StateReadout.vue'),
    SandboxInbox,
    NuxtLink,
  }
}

let mounted: VueWrapper | undefined
function demo(stand = session()) {
  auth.current = stand
  const onSuccess = vi.fn()
  // The real flow, with a spy on the hand-off the demo passes it.
  const flow = (options: Parameters<typeof useLoginFlow>[0] = {}) => useLoginFlow({
    ...options,
    onSuccess: () => {
      onSuccess()
      return options.onSuccess?.()
    },
  })
  const Live = component('website/components/DemoSignInLive.vue', { '../utils/testEmail': testEmail }, { useAuth: () => stand, useLoginFlow: flow })
  mounted = mount(Live, { global: { components: parts() }, attachTo: document.body })
  return { wrapper: mounted, auth: stand, onSuccess }
}

/** The pane on show: request, verify, offer, signed-in. */
const pane = (wrapper: VueWrapper) => wrapper.get('[data-pane]').attributes('data-pane')
const key = (wrapper: VueWrapper, label: string) => {
  const found = wrapper.findAll('button').find(button => button.text() === label)
  if (!found) throw new Error(`no "${label}" key in ${wrapper.html()}`)
  return found
}
/** Press a key from the keyboard's point of view: focus it, then click. */
async function press(wrapper: VueWrapper, label: string) {
  const target = key(wrapper, label)
  ;(target.element as HTMLElement).focus()
  await target.trigger('click')
  await flushPromises()
}
/** Submit the pane's form from its field, as Enter would. */
async function submit(wrapper: VueWrapper) {
  const field = wrapper.get('[data-pane] input')
  ;(field.element as HTMLElement).focus()
  await wrapper.get('form[data-pane]').trigger('submit')
  await flushPromises()
}

/** Signs in with the code, from the request pane: the identity, its code, then Sign in. */
async function signIn(wrapper: VueWrapper) {
  await wrapper.get('input[type="email"]').setValue(IDENTITY)
  await submit(wrapper)
  await press(wrapper, 'Fill the code')
  await submit(wrapper)
}

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  vi.unstubAllGlobals()
})

describe('the sign-in demo', () => {
  it('says who is signed in, and signs out back to the form', async () => {
    const { wrapper, auth: stand } = demo(session({ signedIn: true }))
    await flushPromises()
    expect(pane(wrapper)).toBe('signed-in')
    expect(wrapper.text()).toContain('Signed in')
    expect(wrapper.text()).toContain(IDENTITY)

    await press(wrapper, 'Sign out')
    expect(stand.signOut).toHaveBeenCalledOnce()
    expect(pane(wrapper)).toBe('request')
    expect((wrapper.get('input[type="email"]').element as HTMLInputElement).value).toBe('')
  })

  it('refuses an address that is no sandbox identity, on the field, without sending', async () => {
    const { wrapper, auth: stand } = demo()
    await flushPromises()
    await wrapper.get('input[type="email"]').setValue('ada@example.com')
    await submit(wrapper)
    expect(stand.sendOtp).not.toHaveBeenCalled()
    expect(pane(wrapper)).toBe('request')
    const field = wrapper.get('input[type="email"]')
    expect(field.attributes('aria-invalid')).toBe('true')
    expect(wrapper.get(`#${field.attributes('aria-describedby')}`).text()).toBe(testEmail.SANDBOX_IDENTITY_HELP)
    // On the field, not in the alert as well.
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows a failure that is not the field\'s in its alert, with the wait', async () => {
    const stand = session()
    stand.sendOtp.mockRejectedValueOnce(backendError('rate_limited', { retryAfter: 30_000, limit: 'sendOtp' }))
    const { wrapper } = demo(stand)
    await flushPromises()
    await wrapper.get('input[type="email"]').setValue(IDENTITY)
    await submit(wrapper)
    expect(pane(wrapper)).toBe('request')
    // Said once, by the message: the readout holds the wait as `retryAfter`.
    const alert = wrapper.get('[role="alert"]').text()
    expect(alert.match(/Try again/g)).toHaveLength(1)
    expect(alert).toContain('30 seconds')
    expect(wrapper.text()).toContain('"retryAfter": 30')
    expect(wrapper.get('input[type="email"]').attributes('aria-invalid')).toBeUndefined()
  })

  describe('in a browser without WebAuthn', () => {
    it('offers no passkey, goes past the offer, and lands signed in', async () => {
      vi.stubGlobal('PublicKeyCredential', undefined)
      const { wrapper, auth: stand, onSuccess } = demo()
      await flushPromises()
      expect(wrapper.text()).not.toContain('Use a passkey')

      await signIn(wrapper)
      expect(stand.signInWithOtp).toHaveBeenCalledWith({ email: IDENTITY, otp: '123456' })
      expect(pane(wrapper)).toBe('signed-in')
      expect(wrapper.text()).not.toContain('Save a passkey')
      expect(onSuccess).toHaveBeenCalledOnce()
      expect(stand.registerPasskey).not.toHaveBeenCalled()
    })
  })

  describe('in a browser with WebAuthn', () => {
    beforeEach(() => {
      vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
    })

    it('offers a passkey after the code, and is signed in once the reader answers', async () => {
      const { wrapper, onSuccess } = demo()
      await flushPromises()
      expect(key(wrapper, 'Use a passkey').exists()).toBe(true)
      await signIn(wrapper)
      expect(pane(wrapper)).toBe('offer')
      expect(onSuccess).not.toHaveBeenCalled()

      await press(wrapper, 'Not now')
      expect(pane(wrapper)).toBe('signed-in')
      expect(onSuccess).toHaveBeenCalledOnce()
    })

    // The flow hands off once; signing out resets it, so the next sign-in
    // lands signed in again.
    it('signs in again after signing out', async () => {
      const { wrapper, onSuccess } = demo()
      await flushPromises()
      await signIn(wrapper)
      await press(wrapper, 'Not now')
      await press(wrapper, 'Sign out')
      expect(pane(wrapper)).toBe('request')

      await signIn(wrapper)
      await press(wrapper, 'Save a passkey')
      expect(pane(wrapper)).toBe('signed-in')
      expect(onSuccess).toHaveBeenCalledTimes(2)
    })

    // Signing out from the end of the flow goes straight back to the form:
    // the flow's last step, the passkey offer, never shows in between.
    it('signs out without passing through the passkey offer', async () => {
      const { wrapper } = demo()
      await flushPromises()
      await signIn(wrapper)
      await press(wrapper, 'Not now')
      const shown: string[] = []
      const watcher = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach((node) => {
        const name = (node as Element).getAttribute?.('data-pane')
        if (name) shown.push(name)
      })))
      watcher.observe(wrapper.element, { childList: true, subtree: true })
      await press(wrapper, 'Sign out')
      await flushPromises()
      watcher.disconnect()
      expect(shown).toEqual(['request'])
    })

    // Each step replaces the pane that held the key the reader pressed.
    it('keeps a keyboard reader\'s place at every step', async () => {
      const { wrapper } = demo()
      await flushPromises()
      await wrapper.get('input[type="email"]').setValue(IDENTITY)
      await submit(wrapper)
      expect(pane(wrapper)).toBe('verify')
      expect(document.activeElement).toBe(wrapper.get('input[autocomplete="one-time-code"]').element)

      await press(wrapper, 'Use another address')
      expect(pane(wrapper)).toBe('request')
      expect(document.activeElement).toBe(wrapper.get('input[type="email"]').element)

      await submit(wrapper)
      await press(wrapper, 'Fill the code')
      await submit(wrapper)
      expect(pane(wrapper)).toBe('offer')
      expect(document.activeElement).toBe(key(wrapper, 'Save a passkey').element)

      await press(wrapper, 'Not now')
      expect(pane(wrapper)).toBe('signed-in')
      expect(document.activeElement).toBe(key(wrapper, 'Sign out').element)

      await press(wrapper, 'Sign out')
      expect(document.activeElement).toBe(wrapper.get('input[type="email"]').element)
    })

    it('leaves focus alone when the reader is elsewhere on the page', async () => {
      const outside = document.body.appendChild(document.createElement('button'))
      try {
        const { wrapper, auth: stand } = demo()
        await flushPromises()
        outside.focus()
        // The session arrives from another tab: the pane changes by itself.
        stand.user.value = { email: IDENTITY }
        await flushPromises()
        expect(pane(wrapper)).toBe('signed-in')
        expect(document.activeElement).toBe(outside)
      }
      finally {
        outside.remove()
      }
    })

    it('runs one action at a time: the others say they are unavailable, and do nothing', async () => {
      const stand = session()
      const sending = gate()
      stand.sendOtp.mockImplementationOnce(() => sending.opened)
      const { wrapper } = demo(stand)
      await flushPromises()
      await wrapper.get('input[type="email"]').setValue(IDENTITY)
      await submit(wrapper)

      const send = key(wrapper, 'Email me a code')
      const passkey = key(wrapper, 'Use a passkey')
      expect(send.attributes('aria-busy')).toBe('true')
      expect(send.attributes('aria-disabled')).toBe('true')
      expect(passkey.attributes('aria-disabled')).toBe('true')
      expect(passkey.attributes('aria-busy')).toBeUndefined()
      expect(passkey.attributes('disabled')).toBeUndefined()
      await passkey.trigger('click')
      await wrapper.get('form[data-pane]').trigger('submit')
      expect(stand.signInWithPasskey).not.toHaveBeenCalled()
      expect(stand.sendOtp).toHaveBeenCalledOnce()

      sending.open()
      await flushPromises()
      expect(pane(wrapper)).toBe('verify')
      expect(key(wrapper, 'Sign in').attributes('aria-disabled')).toBeUndefined()
      expect(key(wrapper, 'Use another address').attributes('aria-disabled')).toBeUndefined()
    })
  })

  it('fills the field from a sandbox identity and clears the refusal', async () => {
    localStorage.setItem('nuxt-backend:sandbox-identities', JSON.stringify([OTHER]))
    const { wrapper } = demo()
    await flushPromises()
    await wrapper.get('input[type="email"]').setValue('ada@example.com')
    await submit(wrapper)
    expect(wrapper.get('input[type="email"]').attributes('aria-invalid')).toBe('true')

    await press(wrapper, OTHER)
    expect((wrapper.get('input[type="email"]').element as HTMLInputElement).value).toBe(OTHER)
    expect(wrapper.get('input[type="email"]').attributes('aria-invalid')).toBeUndefined()
  })
})

describe('<SandboxIdentities>', () => {
  const STORAGE_KEY = 'nuxt-backend:sandbox-identities'
  const Identities = () => component('website/components/SandboxIdentities.vue', { '../utils/testEmail': testEmail })
  const identities = (wrapper: VueWrapper) => wrapper.findAll('[role="group"] button[aria-pressed]').map(button => button.text())

  /** The email field the picker's `v-model` is bound to. */
  let field = ''
  function picker(modelValue = '') {
    field = modelValue
    const update = (value: string) => {
      field = value
      return mounted!.setProps({ modelValue: value })
    }
    mounted = mount(Identities(), {
      props: { 'modelValue': modelValue, 'onUpdate:modelValue': update },
      global: { components: { Key: component('website/components/Key.vue'), NuxtLink } },
      attachTo: document.body,
    })
    return mounted
  }

  it('lists the sandbox identities this device keeps, newest first, five at most', async () => {
    const kept = Array.from({ length: 7 }, (_, index) => `delivered+${String(index).repeat(16)}@resend.dev`)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['ada@example.com', 42, ...kept]))
    const wrapper = picker()
    await flushPromises()
    expect(identities(wrapper)).toEqual(kept.slice(0, 5))
  })

  it('marks the address in the field as pressed', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([IDENTITY, OTHER]))
    const wrapper = picker(IDENTITY.toUpperCase())
    await flushPromises()
    const [first, second] = wrapper.findAll('[role="group"] button[aria-pressed]')
    expect(first!.attributes('aria-pressed')).toBe('true')
    expect(second!.attributes('aria-pressed')).toBe('false')

    await second!.trigger('click')
    await flushPromises()
    expect(field).toBe(OTHER)
    expect(second!.attributes('aria-pressed')).toBe('true')
  })

  it('makes a new identity, keeps it first, and fills the field with it', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([OTHER]))
    const wrapper = picker()
    await flushPromises()
    await key(wrapper, 'New identity').trigger('click')
    await flushPromises()
    const made = field
    expect(testEmail.isSandboxIdentity(made)).toBe(true)
    expect(identities(wrapper)).toEqual([made, OTHER])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([made, OTHER])
  })

  // A private window, or blocked site data: the identities last this visit.
  it('works without storage', async () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked })
    const wrapper = picker()
    await flushPromises()
    expect(identities(wrapper)).toEqual([])
    await key(wrapper, 'Create a sandbox identity').trigger('click')
    expect(identities(wrapper)).toHaveLength(1)
  })
})
