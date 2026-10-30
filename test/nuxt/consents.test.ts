import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref, toValue, type Component, type MaybeRefOrGetter } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { clearNuxtState, useNuxtApp } from '#imports'
import { ConvexError } from 'convex/values'
import type { ConsentsView, ConsentTerms } from '../../src/convex/integrations/account'

// The consent ledger on the page: useConsents over a stand-in for
// `backend/account.ts`, <ConsentPrompt> as a dialog that holds the page
// while a required consent is unanswered, the age question, the consent
// manager's question about optional storage, and the agreement line of
// <AuthForm>.

const authenticated = ref(true)
const visiting = ref(false)
const view = ref<ConsentsView | null | undefined>(undefined)
const terms = ref<ConsentTerms | undefined>(undefined)
const purposes = ref<string[]>([])

vi.mock('nuxt-convex-module/better-auth/client', () => ({
  useBetterAuth: () => ({
    isLoading: computed(() => false),
    isAuthenticated: computed(() => authenticated.value),
    fetchAccessToken: vi.fn(async () => 'token'),
    client: {},
    session: ref({ data: visiting.value ? { session: { impersonatedBy: 'admin-1' } } : null, isPending: false, refetch: vi.fn(async () => {}) }),
    user: computed(() => (authenticated.value ? { id: 'u1', email: 'ada@example.com' } : null)),
    authVersion: computed(() => null),
  }),
}))
vi.mock('../../src/runtime/vue/composables/use-backend-config', () => ({
  useBackendConfig: () => ({ billing: { plans: [], packs: [], lowCreditsThreshold: 10 }, brand: {}, labels: {}, consent: { purposes: purposes.value } }),
}))

const calls = { grant: vi.fn(async (_args: unknown) => null as unknown), withdraw: vi.fn(async (_args: unknown) => null as unknown), choose: vi.fn(async (_args: unknown) => null as unknown) }
vi.mock('nuxt-convex-module/client', async original => ({
  ...await original<Record<string, unknown>>(),
  useQuery_experimental: ({ query, args }: { query: string, args: MaybeRefOrGetter<unknown> }) => computed(() => {
    if (toValue(args) === 'skip') return { status: 'pending' }
    const data = query === 'account:getConsentTerms' ? terms.value : view.value
    return data === undefined ? { status: 'pending' } : { status: 'success', data }
  }),
  useMutation: (reference: string) => (args: unknown) => (reference === 'account:grantConsent' ? calls.grant : reference === 'account:withdrawConsent' ? calls.withdraw : calls.choose)(args),
}))

const { useConsents } = await import('../../src/runtime/vue/composables/use-consents')
const { registerComponents } = await import('../helpers/register-components')
const { ConsentPrompt, AuthForm } = await registerComponents('ConsentPrompt', 'AuthForm') as Record<'ConsentPrompt' | 'AuthForm', Component>
const { ConvexAuthStateKey } = await import('nuxt-convex-module/client')
const { BackendApiKey } = await import('../../src/runtime/vue/utils/namespace')

const api = {
  getConsents: 'account:getConsents',
  getConsentTerms: 'account:getConsentTerms',
  grantConsent: 'account:grantConsent',
  withdrawConsent: 'account:withdrawConsent',
  chooseStorage: 'account:chooseStorage',
}
const provide = () => ({
  [ConvexAuthStateKey as symbol]: { isAuthenticated: computed(() => authenticated.value), isLoading: computed(() => false) },
  [BackendApiKey as symbol]: { account: api },
})

const mounted: VueWrapper[] = []
function inSetup<T>(runner: () => T): T {
  let result: T
  mounted.push(mount(defineComponent({
    setup() {
      result = runner()
      return () => h('div')
    },
  }), { global: { provide: provide() } }) as VueWrapper)
  return result!
}
const render = (component: object, props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) => {
  const wrapper = mount(component as never, { props: props as never, slots: slots as never, attachTo: document.body, global: { provide: provide() } }) as VueWrapper
  mounted.push(wrapper)
  return wrapper
}

const TERMS = { kind: 'terms', version: '2026-10-01', url: '/terms', required: true, grantedVersion: null, grantedAt: null, current: false }
const PRIVACY = { kind: 'privacy', version: '2026-10-01', url: '/privacy', required: true, grantedVersion: '2026-10-01', grantedAt: 1, current: true }
const GALLERY = { kind: 'gallery', version: '2026-10-01', url: '/gallery-rules', required: false, grantedVersion: null, grantedAt: null, current: false }
const viewOf = (overrides: Partial<ConsentsView> = {}): ConsentsView => ({ consents: [TERMS, PRIVACY, GALLERY], missing: ['terms'], storage: null, minimumAge: null, ...overrides })

const STORAGE_COOKIE = 'backend.storage'
const clearCookie = () => {
  document.cookie = `${STORAGE_COOKIE}=; max-age=0; path=/`
  document.cookie = 'better-auth.last_used_login_method=; max-age=0; path=/'
}

beforeEach(() => {
  vi.clearAllMocks()
  authenticated.value = true
  visiting.value = false
  view.value = viewOf()
  terms.value = { terms: [{ kind: 'terms', version: '2026-10-01', url: '/terms' }, { kind: 'privacy', version: '2026-10-01', url: '/privacy' }], minimumAge: null }
  purposes.value = []
  clearCookie()
  clearNuxtState('backend:storage-choice')
  clearNuxtState('backend:last-sign-in-method')
})
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  document.body.innerHTML = ''
})

describe('useConsents', () => {
  it('holds what the person agreed to, by kind, and the required kinds still missing', () => {
    const { consents, missing, terms: required } = inSetup(() => useConsents())
    expect(consents.value).toEqual({ privacy: { version: '2026-10-01', grantedAt: 1, current: true } })
    expect(consents.value.gallery?.current).toBeUndefined()
    expect(missing.value).toEqual(['terms'])
    expect(required.value).toEqual([{ kind: 'terms', version: '2026-10-01', title: 'Terms', url: '/terms' }, { kind: 'privacy', version: '2026-10-01', title: 'Privacy policy', url: '/privacy' }])
  })

  it('reads an earlier version as agreed to but not current, and a withdrawn kind as absent', () => {
    view.value = viewOf({ consents: [{ ...TERMS, grantedVersion: '2025-01-01', grantedAt: 1 }, GALLERY], missing: ['terms'] })
    const { consents, asks } = inSetup(() => useConsents())
    expect(consents.value).toEqual({ terms: { version: '2025-01-01', grantedAt: 1, current: false } })
    expect(asks()).toEqual([expect.objectContaining({ kind: 'terms', title: 'Terms', required: true, changed: true })])
    expect(asks(['gallery'])).toEqual([expect.objectContaining({ kind: 'gallery', required: false, changed: false, title: 'Gallery' })])
  })

  it('grants and withdraws through the backend, naming the settings page as the source', async () => {
    const { grant, withdraw } = inSetup(() => useConsents())
    await grant('gallery')
    await withdraw('gallery')
    expect(calls.grant).toHaveBeenCalledWith({ kind: 'gallery', source: 'settings' })
    expect(calls.withdraw).toHaveBeenCalledWith({ kind: 'gallery' })
  })

  it('rejects with the refusal, keeps it in error, and clears it once signed out', async () => {
    calls.grant.mockRejectedValueOnce(new ConvexError({ code: 'invalid_input', field: 'kind', message: 'no such kind' }))
    const { grant, error } = inSetup(() => useConsents())
    await expect(grant('nope')).rejects.toBeDefined()
    expect(error.value).toMatchObject({ code: 'invalid_input', data: { field: 'kind' } })
    authenticated.value = false
    await nextTick()
    expect(error.value).toBeNull()
  })

  it('knows nothing of a signed-out visitor, but names the required kinds for a sign-in form', () => {
    authenticated.value = false
    const { consents, missing, terms: required, storage, isAsking } = inSetup(() => useConsents())
    expect(consents.value).toEqual({})
    expect(missing.value).toEqual([])
    expect(required.value.map(term => term.kind)).toEqual(['terms', 'privacy'])
    expect(storage.value).toEqual({})
    expect(isAsking.value).toBe(false)
  })

  describe('optional storage', () => {
    it('is off while the app uses only strictly necessary storage: storage is empty and nothing asks', () => {
      const { storage, isAsking } = inSetup(() => useConsents())
      expect(storage.value).toEqual({})
      expect(isAsking.value).toBe(false)
    })

    it('asks for the declared purposes, with preferences beside them, each off until allowed', () => {
      purposes.value = ['analytics']
      const { storage, isAsking } = inSetup(() => useConsents())
      expect(storage.value).toEqual({ preferences: false, analytics: false })
      expect(isAsking.value).toBe(true)
    })

    it('keeps a choice in a cookie, and the ledger when signed in, and stops asking', async () => {
      purposes.value = ['replay']
      const { storage, allowStorage, isAsking } = inSetup(() => useConsents())
      await allowStorage({ replay: true })
      expect(storage.value).toEqual({ preferences: false, replay: true })
      expect(isAsking.value).toBe(false)
      expect(document.cookie).toContain(`${STORAGE_COOKIE}=replay`)
      expect(calls.choose).toHaveBeenCalledWith({ purposes: ['replay'], source: 'prompt' })
      // Another purpose joins; the ones not named keep their value.
      await allowStorage({ preferences: true })
      expect(storage.value).toEqual({ preferences: true, replay: true })
      expect(calls.choose).toHaveBeenLastCalledWith({ purposes: ['preferences', 'replay'], source: 'settings' })
    })

    it('keeps the choice of a signed-out visitor in the cookie alone', async () => {
      authenticated.value = false
      purposes.value = ['analytics']
      const { allowStorage, storage } = inSetup(() => useConsents())
      await allowStorage({ analytics: true, preferences: false })
      expect(storage.value).toEqual({ preferences: false, analytics: true })
      expect(calls.choose).not.toHaveBeenCalled()
    })

    it('deletes what a withdrawn purpose stored: the last-sign-in-method cookie for preferences', async () => {
      purposes.value = ['preferences']
      document.cookie = 'better-auth.last_used_login_method=email-otp; path=/'
      const { allowStorage } = inSetup(() => useConsents())
      await allowStorage({ preferences: true })
      expect(document.cookie).toContain('better-auth.last_used_login_method=email-otp')
      await allowStorage({ preferences: false })
      expect(document.cookie).not.toContain('better-auth.last_used_login_method')
    })

    it('follows a signed-in person to another browser, and pushes a signed-out choice to the ledger once they sign in', async () => {
      purposes.value = ['analytics']
      view.value = viewOf({ storage: ['analytics'] })
      const { storage, isAsking } = inSetup(() => useConsents())
      await flushPromises()
      expect(storage.value).toEqual({ preferences: false, analytics: true })
      expect(isAsking.value).toBe(false)

      clearCookie()
      clearNuxtState('backend:storage-choice')
      view.value = viewOf({ storage: null })
      document.cookie = `${STORAGE_COOKIE}=preferences; path=/`
      inSetup(() => useConsents())
      await flushPromises()
      expect(calls.choose).toHaveBeenCalledWith({ purposes: ['preferences'], source: 'prompt' })
    })

    it('tells integrations the choice through the backend:storage hook', async () => {
      purposes.value = ['analytics']
      const heard = vi.fn()
      useNuxtApp().hook('backend:storage', heard)
      const { allowStorage } = inSetup(() => useConsents())
      await allowStorage({ analytics: true })
      expect(heard).toHaveBeenLastCalledWith({ preferences: false, analytics: true })
    })
  })
})

describe('<ConsentPrompt>', () => {
  const dialog = () => document.querySelector<HTMLDialogElement>('dialog[data-consent="dialog"]')

  it('holds the page behind a dialog while a required consent is unanswered, with nothing ticked', async () => {
    render(ConsentPrompt)
    await flushPromises()
    const element = dialog()!
    expect(element).not.toBeNull()
    expect(element.open).toBe(true)
    expect(element.getAttribute('aria-labelledby')).toBeTruthy()
    const items = element.querySelectorAll('[data-consent="item"]')
    // Only the one missing: privacy was accepted, and gallery is an opt-in.
    expect([...items].map(item => item.getAttribute('data-kind'))).toEqual(['terms'])
    const box = element.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(box.checked).toBe(false)
    expect(element.querySelector('[data-consent="note"]')!.textContent).toBe('Accept the Terms to continue.')
    expect(element.querySelector('[data-consent="link"]')!.getAttribute('href')).toBe('/terms')
    expect(element.querySelector('label')!.textContent).toContain('Required')
  })

  it('says a document changed when an earlier version was accepted', async () => {
    view.value = viewOf({ consents: [{ ...TERMS, grantedVersion: '2025-01-01', grantedAt: 1 }, PRIVACY] })
    render(ConsentPrompt)
    await flushPromises()
    expect(dialog()!.querySelector('[data-consent="note"]')!.textContent).toBe('The Terms changed. Read it, then accept it to continue.')
  })

  it('records each ticked kind when Accept is pressed, and only then; it cannot be pressed before', async () => {
    const wrapper = render(ConsentPrompt)
    await flushPromises()
    const submit = dialog()!.querySelector<HTMLButtonElement>('[data-consent="submit"]')!
    expect(submit.getAttribute('aria-disabled')).toBe('true')
    submit.click()
    await flushPromises()
    expect(calls.grant).not.toHaveBeenCalled()

    const box = dialog()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    box.checked = true
    box.dispatchEvent(new Event('change'))
    await nextTick()
    expect(submit.getAttribute('aria-disabled')).toBeNull()
    submit.click()
    await flushPromises()
    expect(calls.grant).toHaveBeenCalledWith({ kind: 'terms', source: 'settings' })
    expect(wrapper.emitted('granted')).toEqual([['terms']])
    // The record arrives: nothing is missing, and the dialog goes.
    view.value = viewOf({ consents: [{ ...TERMS, grantedVersion: '2026-10-01', grantedAt: 2, current: true }, PRIVACY], missing: [] })
    await flushPromises()
    expect(dialog()).toBeNull()
  })

  it('cannot be escaped while a consent is required', async () => {
    render(ConsentPrompt)
    await flushPromises()
    const cancel = new Event('cancel', { cancelable: true })
    dialog()!.dispatchEvent(cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(dialog()).not.toBeNull()
  })

  it('asks an opt-in only when named, and lets the person say not now', async () => {
    view.value = viewOf({ missing: [] })
    const wrapper = render(ConsentPrompt, { kinds: ['gallery'] })
    await flushPromises()
    expect(dialog()!.querySelector('[data-consent="label"]')!.textContent).toContain('Optional')
    expect(dialog()!.querySelector('[data-consent="note"]')).not.toBeNull()
    dialog()!.querySelector<HTMLButtonElement>('[data-consent="later"]')!.click()
    await flushPromises()
    expect(dialog()).toBeNull()
    expect(calls.grant).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('renders nothing when nothing is asked, to a signed-out visitor, and to an administrator visiting the account', async () => {
    view.value = viewOf({ missing: [], consents: [{ ...TERMS, grantedVersion: '2026-10-01', grantedAt: 1, current: true }, PRIVACY] })
    render(ConsentPrompt)
    await flushPromises()
    expect(dialog()).toBeNull()
    expect(document.querySelector('[data-consent]')).toBeNull()

    authenticated.value = false
    view.value = null
    await flushPromises()
    expect(document.querySelector('[data-consent]')).toBeNull()
  })

  it('asks the age of an account that never answered it, never names the minimum, and sends the number', async () => {
    view.value = viewOf({ consents: [{ ...TERMS, grantedVersion: '2026-10-01', grantedAt: 1, current: true }, PRIVACY], missing: ['age'], minimumAge: 16 })
    render(ConsentPrompt)
    await flushPromises()
    const field = dialog()!.querySelector<HTMLInputElement>('[data-consent="age-input"]')!
    expect(field.value).toBe('')
    expect(dialog()!.textContent).not.toContain('16')
    expect(dialog()!.textContent).toContain('How old are you?')
    field.value = '34'
    field.dispatchEvent(new Event('input'))
    await nextTick()
    dialog()!.querySelector<HTMLButtonElement>('[data-consent="submit"]')!.click()
    await flushPromises()
    expect(calls.grant).toHaveBeenCalledWith({ kind: 'age', age: 34, source: 'prompt' })
  })

  it('shows the refusal of an age under the minimum as an alert', async () => {
    view.value = viewOf({ consents: [{ ...TERMS, grantedVersion: '2026-10-01', grantedAt: 1, current: true }, PRIVACY], missing: ['age'], minimumAge: 16 })
    calls.grant.mockRejectedValueOnce(new ConvexError({ code: 'forbidden', reason: 'under_age' }))
    const wrapper = render(ConsentPrompt)
    await flushPromises()
    const field = dialog()!.querySelector<HTMLInputElement>('[data-consent="age-input"]')!
    field.value = '12'
    field.dispatchEvent(new Event('input'))
    await nextTick()
    dialog()!.querySelector<HTMLButtonElement>('[data-consent="submit"]')!.click()
    await flushPromises()
    expect(dialog()!.querySelector('[role="alert"]')!.textContent).toBe('We can\'t create an account for you.')
    expect(wrapper.emitted('error')).toEqual([['We can\'t create an account for you.']])
  })

  it('fills the consent slot per kind, with the box a slot ticks and unticks', async () => {
    const seen: Array<Record<string, unknown>> = []
    render(ConsentPrompt, {}, {
      consent: (slot: Record<string, unknown> & { granted: boolean, grant: () => void }) => {
        seen.push({ ...slot })
        return h('button', { 'data-slot': slot.kind, 'onClick': slot.grant }, `${slot.title}:${slot.granted}`)
      },
      footer: () => h('p', { 'data-slot': 'footer' }, 'Questions? Write to us.'),
    })
    await flushPromises()
    expect(seen[0]).toMatchObject({ kind: 'terms', version: '2026-10-01', title: 'Terms', url: '/terms', required: true, changed: false, granted: false })
    document.querySelector<HTMLButtonElement>('[data-slot="terms"]')!.click()
    await nextTick()
    expect(document.querySelector('[data-slot="terms"]')!.textContent).toBe('Terms:true')
    expect(document.querySelector('[data-slot="footer"]')).not.toBeNull()
  })

  describe('the consent manager', () => {
    const banner = () => document.querySelector<HTMLElement>('[data-consent="storage"]')

    it('asks once, with Allow and Decline of equal weight, each purpose off until allowed', async () => {
      view.value = viewOf({ missing: [] })
      purposes.value = ['analytics']
      render(ConsentPrompt)
      await flushPromises()
      expect(banner()).not.toBeNull()
      expect([...banner()!.querySelectorAll('[data-purpose]')].map(item => item.getAttribute('data-purpose'))).toEqual(['preferences', 'analytics'])
      const allow = banner()!.querySelector<HTMLButtonElement>('[data-consent="allow"]')!
      const decline = banner()!.querySelector<HTMLButtonElement>('[data-consent="decline"]')!
      // The same element, class and size: one tap each.
      expect(allow.tagName).toBe(decline.tagName)
      expect(allow.getAttribute('type')).toBe(decline.getAttribute('type'))
      allow.click()
      await flushPromises()
      expect(document.cookie).toContain(`${STORAGE_COOKIE}=preferences%2Canalytics`)
      expect(banner()).toBeNull()
    })

    it('records a decline too, so it does not ask again', async () => {
      view.value = viewOf({ missing: [] })
      purposes.value = ['replay']
      render(ConsentPrompt)
      await flushPromises()
      banner()!.querySelector<HTMLButtonElement>('[data-consent="decline"]')!.click()
      await flushPromises()
      expect(document.cookie).toContain(`${STORAGE_COOKIE}=none`)
      expect(calls.choose).toHaveBeenCalledWith({ purposes: [], source: 'prompt' })
      expect(banner()).toBeNull()
    })

    it('waits for a required consent, and is not shown to a visiting administrator or while the manager is off', async () => {
      purposes.value = ['analytics']
      render(ConsentPrompt)
      await flushPromises()
      expect(dialog()).not.toBeNull()
      expect(banner()).toBeNull()
      mounted.splice(0).forEach(wrapper => wrapper.unmount())

      view.value = viewOf({ missing: [] })
      visiting.value = true
      render(ConsentPrompt)
      await flushPromises()
      expect(banner()).toBeNull()
      mounted.splice(0).forEach(wrapper => wrapper.unmount())

      visiting.value = false
      purposes.value = []
      render(ConsentPrompt)
      await flushPromises()
      expect(document.querySelector('[data-consent]')).toBeNull()
    })

    it('asks a signed-out visitor too', async () => {
      authenticated.value = false
      view.value = null
      purposes.value = ['analytics']
      render(ConsentPrompt)
      await flushPromises()
      expect(banner()).not.toBeNull()
    })
  })
})

describe('<AuthForm>\'s agreement line', () => {
  beforeEach(() => {
    authenticated.value = false
    view.value = null
  })

  it('links every required consent under the steps that can create an account', async () => {
    const wrapper = render(AuthForm)
    await flushPromises()
    const line = wrapper.find('[data-auth="agreement"]')
    expect(line.exists()).toBe(true)
    expect(line.text()).toBe('By continuing, you agree to the Terms and the Privacy policy.')
    expect(line.findAll('a').map(link => [link.attributes('href'), link.text()])).toEqual([['/terms', 'the Terms'], ['/privacy', 'the Privacy policy']])
    expect(line.find('a').attributes('rel')).toBe('noopener')
  })

  it('names a kind with no document as plain words, and shows nothing for an app without required consents', async () => {
    terms.value = { terms: [{ kind: 'terms', version: '1' }], minimumAge: null }
    const wrapper = render(AuthForm)
    await flushPromises()
    expect(wrapper.find('[data-auth="agreement"]').text()).toBe('By continuing, you agree to the Terms.')
    expect(wrapper.find('[data-auth="agreement"] a').exists()).toBe(false)
    terms.value = { terms: [], minimumAge: null }
    await flushPromises()
    expect(wrapper.find('[data-auth="agreement"]').exists()).toBe(false)
  })

  it('takes its words from the consent labels and the auth labels', async () => {
    const wrapper = render(AuthForm, { labels: { agreement: 'Si continúas, aceptas {terms}.', agreementItem: '{title}' } })
    await flushPromises()
    expect(wrapper.find('[data-auth="agreement"]').text()).toBe('Si continúas, aceptas Terms and Privacy policy.')
  })
})
