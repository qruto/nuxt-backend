import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref } from 'vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { clearNuxtState, useNuxtApp } from '#imports'

// The account's language (`user.locale`, which every email the package sends
// is written in) as the app sets it with @nuxtjs/i18n: the sign-in sends the
// active locale, a locale switch is stored on the signed-in account, and
// <ProfileSettings> offers the app's languages.

const user = ref<Record<string, unknown> | null>(null)
type Answer = { data?: unknown, error?: Record<string, unknown> | null }
const ok = (data: unknown = { success: true }): Answer => ({ data, error: null })
const ada = { id: 'u1', name: 'Ada', email: 'ada@example.com' }

const client = {
  emailOtp: { sendVerificationOtp: vi.fn(async (..._args: unknown[]): Promise<Answer> => ok()) },
  signIn: { emailOtp: vi.fn(async (..._args: unknown[]): Promise<Answer> => ok({ token: 't', user: ada })) },
  updateUser: vi.fn(async (..._args: unknown[]): Promise<Answer> => ok()),
  admin: { checkRolePermission: vi.fn(() => false) },
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
vi.mock('../../src/runtime/vue/composables/use-workspace', () => ({
  useWorkspace: () => ({ current: computed(() => null) }),
}))

// What @nuxtjs/i18n provides as `$i18n`: the active code, the listed locales, setLocale.
const locale = ref('de')
const locales = ref<Array<{ code: string, name?: string } | string>>([{ code: 'en', name: 'English' }, { code: 'de', name: 'Deutsch' }])
const setLocale = vi.fn(async (code: string) => {
  locale.value = code
})
let nuxtApp: ReturnType<typeof useNuxtApp>
beforeAll(() => {
  nuxtApp = useNuxtApp()
  Object.defineProperty(nuxtApp, '$i18n', { configurable: true, get: () => ({ locale, locales, setLocale, te: () => false, t: (key: string) => key }) })
})

const { useLoginFlow } = await import('../../src/runtime/vue/composables/use-login-flow')
const { registerComponents } = await import('../helpers/register-components')
await registerComponents('ProfileSettings')
const { default: ProfileSettings } = await import('../../src/runtime/vue/components/account/ProfileSettings.vue')
const { default: localeSync } = await import('../../src/runtime/vue/plugins/locale-sync')

beforeEach(() => {
  vi.clearAllMocks()
  user.value = null
  locale.value = 'de'
  locales.value = [{ code: 'en', name: 'English' }, { code: 'de', name: 'Deutsch' }]
  clearNuxtState('backend:last-sign-in-method')
})
enableAutoUnmount(afterEach)

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

describe('the sign-in', () => {
  it('sends the app\'s language with the code request and the code, so a new account reads it', async () => {
    const flow = inSetup(() => useLoginFlow())
    flow.goTo('request-code')
    flow.email.value = 'ada@example.com'
    await flow.sendCode()
    flow.otp.value = '123456'
    await flow.verifyCode()
    const language = { headers: { 'accept-language': 'de' } }
    expect(client.emailOtp.sendVerificationOtp).toHaveBeenCalledWith({ email: 'ada@example.com', type: 'sign-in' }, language)
    expect(client.signIn.emailOtp).toHaveBeenCalledWith({ email: 'ada@example.com', otp: '123456' }, language)
  })
})

describe('a locale switch', () => {
  /** The plugin on this app, and a switch @nuxtjs/i18n announces. */
  async function switchTo(newLocale: string) {
    await (nuxtApp.callHook as unknown as (name: string, event: unknown) => Promise<void>)('i18n:localeSwitched', { oldLocale: 'en', newLocale })
    await flushPromises()
  }

  it('is stored on the signed-in account, once, in the stored spelling', async () => {
    (localeSync as unknown as (app: typeof nuxtApp) => void)(nuxtApp)
    user.value = { ...ada, locale: 'en' }
    await switchTo('pt_br')
    expect(client.updateUser).toHaveBeenCalledWith({ locale: 'pt-BR' })

    client.updateUser.mockClear()
    user.value = { ...ada, locale: 'de' }
    await switchTo('de')
    user.value = null
    await switchTo('fr')
    expect(client.updateUser).not.toHaveBeenCalled()
  })
})

describe('<ProfileSettings>', () => {
  it('offers the app\'s languages, the active one picked, and switches the app', async () => {
    user.value = { ...ada }
    const wrapper = mount(ProfileSettings)
    await nextTick()
    const select = wrapper.find('[data-profile="input-language"]')
    expect(select.findAll('option').map(option => [option.text(), (option.element as HTMLOptionElement).selected])).toEqual([['English', false], ['Deutsch', true]])
    // Labelled, and described by what it changes.
    expect(wrapper.find('[data-profile="label-language"]').text()).toContain('Language')
    expect(select.attributes('aria-describedby')).toBe(wrapper.find('[data-profile="section-language"] [data-profile="hint"]').attributes('id'))
    await select.setValue('en')
    await flushPromises()
    // Stored on the account first, then the app switches.
    expect(client.updateUser).toHaveBeenCalledWith({ locale: 'en' })
    expect(client.updateUser.mock.invocationCallOrder[0]).toBeLessThan(setLocale.mock.invocationCallOrder[0]!)
    expect(setLocale).toHaveBeenCalledWith('en')
  })

  it('shows the account\'s language, and stores a pick of the one the app already shows', async () => {
    // Signed up on /de, now on a device where the app reads English.
    locale.value = 'en'
    user.value = { ...ada, locale: 'de-AT' }
    const wrapper = mount(ProfileSettings)
    await nextTick()
    const select = wrapper.find('[data-profile="input-language"]')
    expect(select.findAll('option').map(option => (option.element as HTMLOptionElement).selected)).toEqual([false, true])
    await select.setValue('en')
    await flushPromises()
    expect(client.updateUser).toHaveBeenCalledTimes(1)
    expect(client.updateUser).toHaveBeenCalledWith({ locale: 'en' })
    // Nothing to switch: the app reads English already.
    expect(setLocale).not.toHaveBeenCalled()
    expect(wrapper.find('[data-profile="root"]').text()).toContain('Language updated.')
  })

  it('switches the app without a write when the account reads that language already', async () => {
    locale.value = 'en'
    user.value = { ...ada, locale: 'de' }
    const wrapper = mount(ProfileSettings)
    await nextTick()
    await wrapper.find('[data-profile="input-language"]').setValue('de')
    await flushPromises()
    expect(client.updateUser).not.toHaveBeenCalled()
    expect(setLocale).toHaveBeenCalledWith('de')
  })

  it('says so, and leaves the app as it was, when the account refuses the language', async () => {
    client.updateUser.mockResolvedValueOnce({ data: null, error: { status: 500, message: 'down' } })
    user.value = { ...ada, locale: 'de' }
    const wrapper = mount(ProfileSettings)
    await nextTick()
    const select = wrapper.find<HTMLSelectElement>('[data-profile="input-language"]')
    await select.setValue('en')
    await flushPromises()
    expect(setLocale).not.toHaveBeenCalled()
    expect(wrapper.emitted('error')).toHaveLength(1)
    // The field shows the language the account still reads.
    expect(select.element.value).toBe('de')
  })

  it('offers nothing to pick in an app of one language', async () => {
    locales.value = ['de']
    const wrapper = mount(ProfileSettings)
    await nextTick()
    expect(wrapper.find('[data-profile="section-language"]').exists()).toBe(false)
  })
})
