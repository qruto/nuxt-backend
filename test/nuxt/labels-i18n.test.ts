import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref, toValue, type MaybeRefOrGetter, type PropType } from 'vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ConvexError } from 'convex/values'
import { createI18n } from 'vue-i18n'
import { useNuxtApp } from '#imports'
import english from '../../src/runtime/locales/en.json'
import { backendError } from '../../src/convex/errors'

// Labels in an app with @nuxtjs/i18n: a real vue-i18n instance stands where
// the module puts its global composer (`$i18n`), with `localePath` beside it.
// A French app renders the packaged UI in French, follows a locale switch,
// keeps the override order (prop, app config, message, English), and links
// between the packaged pages in its own locale.

const config = vi.hoisted(() => ({
  billing: { plans: [], packs: [], lowCreditsThreshold: 10 },
  brand: {} as Record<string, string>,
  labels: {} as Record<string, Record<string, string>>,
}))
vi.mock('../../src/runtime/vue/composables/use-backend-config', () => ({ useBackendConfig: () => config }))

vi.mock('nuxt-convex-module/better-auth/client', () => ({ useBetterAuth: () => ({}) }))

const invitation = { id: 'inv1', workspaceName: 'Acme', workspaceSlug: 'acme', inviterEmail: 'ada@example.com', role: 'admin' }
const getInvitation = vi.fn(async (): Promise<typeof invitation> => invitation)
vi.mock('../../src/runtime/vue/composables/use-workspace', () => ({
  useWorkspace: () => ({ getInvitation, acceptInvitation: vi.fn(), declineInvitation: vi.fn() }),
}))

const { useHead } = vi.hoisted(() => ({ useHead: vi.fn() }))
mockNuxtImport('useHead', () => useHead)

const french = {
  backend: {
    invitation: {
      title: 'Invitation',
      invitedAs: '{workspace} : {inviter} vous invite en tant que {role}.',
      accept: 'Accepter l\'invitation',
      decline: 'Refuser',
    },
    profile: { title: 'Profil' },
    usage: { units: '{count} crédit | {count} crédits' },
    errors: { forbidden: 'Accès refusé.', forbidden_role: 'Votre rôle ne le permet pas.', invalid_input_otp: 'Ce code est incorrect.' },
  },
}

// As an app configures it: English is the fallback, with the package's
// English messages registered for it, and vue-i18n's warnings on, as in
// development.
const i18n = createI18n({ legacy: false, locale: 'fr', fallbackLocale: 'en', messages: { en: english, fr: french } })
// What @nuxtjs/i18n adds to the composer: the active locale's entry in `i18n.locales`.
const localeEntries = ref<Record<string, { language?: string }>>({ fr: { language: 'fr-FR' } })
Object.defineProperty(i18n.global, 'localeProperties', { configurable: true, get: () => computed(() => localeEntries.value[i18n.global.locale.value] ?? {}) })
let nuxtApp: ReturnType<typeof useNuxtApp>
beforeAll(() => {
  nuxtApp = useNuxtApp()
  Object.defineProperty(nuxtApp, '$i18n', { configurable: true, get: () => i18n.global })
  Object.defineProperty(nuxtApp, '$localePath', {
    configurable: true,
    get: () => (path: string) => (i18n.global.locale.value === 'en' ? path : `/${i18n.global.locale.value}${path}`),
  })
})

const { useLabels } = await import('../../src/runtime/vue/composables/use-labels')
const { useBackendPagePath } = await import('../../src/runtime/vue/composables/use-backend-page-path')
const { registerComponents } = await import('../helpers/register-components')
await registerComponents('AcceptInvitation', 'page:profile')
const { default: AcceptInvitation } = await import('../../src/runtime/vue/components/workspaces/AcceptInvitation.vue')
const { default: ProfilePage } = await import('../../src/runtime/vue/pages/profile.vue')

beforeEach(() => {
  i18n.global.locale.value = 'fr'
  localeEntries.value = { fr: { language: 'fr-FR' } }
  config.labels = {}
})

afterEach(() => {
  vi.clearAllMocks()
})
enableAutoUnmount(afterEach)

/** One label of the invitation group, rendered, with the component's own overrides. */
const Label = defineComponent({
  props: {
    name: { type: String as PropType<'accept' | 'decline' | 'title'>, required: true },
    labels: { type: Object as PropType<Record<string, string>>, default: undefined },
  },
  setup(props) {
    const { t } = useLabels('invitation', () => props.labels)
    return () => h('span', t(props.name))
  },
})

describe('a packaged component in French', () => {
  it('renders the active locale\'s messages, nodes where the message puts them', async () => {
    const wrapper = mount(AcceptInvitation, { props: { invitationId: 'inv1' } })
    await flushPromises()
    const sentence = wrapper.find('[data-invitation="ready"] p')
    expect(sentence.text()).toBe('Acme : ada@example.com vous invite en tant que admin.')
    // The translation moved the workspace first; it is still the <strong> node.
    expect(sentence.findAll('strong').map(node => node.text())).toEqual(['Acme', 'ada@example.com'])
    expect(wrapper.find('[data-invitation="accept"]').text()).toBe('Accepter l\'invitation')
  })

  it('follows a locale switch, back to English where the messages are', async () => {
    const wrapper = mount(AcceptInvitation, { props: { invitationId: 'inv1' } })
    await flushPromises()
    i18n.global.locale.value = 'en'
    await nextTick()
    expect(wrapper.find('[data-invitation="accept"]').text()).toBe('Accept invitation')
    expect(wrapper.find('[data-invitation="ready"] p').text()).toBe('ada@example.com invited you to join Acme as admin.')
  })

  it('rewords a failure it already shows when the locale switches', async () => {
    getInvitation.mockRejectedValueOnce(backendError('forbidden', { reason: 'not_member' }))
    const wrapper = mount(AcceptInvitation, { props: { invitationId: 'inv1' } })
    await flushPromises()
    expect(wrapper.text()).toBe('Something went wrong: Accès refusé.')
    i18n.global.locale.value = 'en'
    await nextTick()
    expect(wrapper.text()).toBe('Something went wrong: You\'re not a member of this workspace.')
  })

  it('shows English for a key the locale leaves out, without a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(AcceptInvitation, { props: { invitationId: 'missing' } })
    // No translation of `loading` in the French messages.
    expect(wrapper.text()).toBe('Loading invitation…')
    // Nor of the whole `usage` group bar one key, or of any key in a locale with no messages.
    ;(i18n.global.locale as { value: string }).value = 'de'
    await nextTick()
    expect(wrapper.text()).toBe('Loading invitation…')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('keeps a placeholder without a value as written, as without i18n', () => {
    const Sent = defineComponent({
      setup() {
        const { t } = useLabels('invitation')
        return () => h('p', t('invitedAs', { inviter: 'Ada' }))
      },
    })
    expect(mount(Sent).text()).toBe('{workspace} : Ada vous invite en tant que {role}.')
  })
})

describe('the override order', () => {
  it('takes the prop, then app config, then the message, then English', () => {
    const render = (labels?: Record<string, string>) => mount(Label, { props: { name: 'accept', labels } }).text()
    expect(render()).toBe('Accepter l\'invitation')
    config.labels = { invitation: { accept: 'Join from config' } }
    expect(render()).toBe('Join from config')
    expect(render({ accept: 'Join from the prop' })).toBe('Join from the prop')
    // Key by key: the prop's other keys leave this one to app config.
    expect(render({ decline: 'No thanks' })).toBe('Join from config')
    config.labels = {}
    // A locale the app lists but has no messages for.
    ;(i18n.global.locale as { value: string }).value = 'de'
    expect(render()).toBe('Accept invitation')
  })

  it('names what an override leaves out of its message, for the development warning', async () => {
    const { overrideWarning } = await import('../../src/runtime/vue/composables/use-labels')
    // Written for an earlier wording, before the message took {inviter} and {role}.
    expect(overrideWarning('invitation.invitedAs', 'You are invited to {workspace}.')).toContain('`invitation.invitedAs` label leaves out {inviter}, {role}')
    expect(overrideWarning('invitation.invitedAs', '{workspace}: {inviter} invites you as {role}.')).toBeNull()
    expect(overrideWarning('invitation.accept', 'Join')).toBeNull()
  })

  it('fills plurals the way the active locale words them', () => {
    const Units = defineComponent({
      setup() {
        const { t } = useLabels('usage')
        return () => h('span', [1, 3].map(count => t('units', { count })).join(' / '))
      },
    })
    expect(mount(Units).text()).toBe('1 crédit / 3 crédits')
  })
})

describe('errors and dates', () => {
  const Message = defineComponent({
    props: { error: { type: null as unknown as PropType<unknown>, required: true } },
    setup(props) {
      const { errorMessage, locale } = useLabels('errors')
      return () => h('p', { 'data-locale': locale.value }, errorMessage(props.error))
    },
  })

  it('words a refusal in the active locale, by its reason first', () => {
    expect(mount(Message, { props: { error: backendError('forbidden', { reason: 'role' }) } }).text()).toBe('Votre rôle ne le permet pas.')
    expect(mount(Message, { props: { error: backendError('forbidden', { reason: 'not_owner' }) } }).text()).toBe('Accès refusé.')
  })

  it('prefers the locale\'s generic sentence to the package\'s English one for the reason', () => {
    // The package words not_member in English; the French messages word only `forbidden`.
    expect(mount(Message, { props: { error: backendError('forbidden', { reason: 'not_member' }) } }).text()).toBe('Accès refusé.')
  })

  it('words the auth server\'s own refusals too, never its English sentence', () => {
    // As the auth client answers a wrong sign-in code.
    const answer = { data: null, error: { code: 'INVALID_OTP', message: 'Invalid OTP', status: 400, statusText: 'BAD_REQUEST' } }
    expect(mount(Message, { props: { error: answer } }).text()).toBe('Ce code est incorrect.')
  })

  it('keeps a sentence written for the person as written', () => {
    const error = new ConvexError({ code: 'forbidden', reason: 'role', message: 'Only the owner can do that.' })
    expect(mount(Message, { props: { error } }).text()).toBe('Only the owner can do that.')
  })

  it('hands on the locale\'s language for dates and money, as a tag Intl takes', async () => {
    const wrapper = mount(Message, { props: { error: null } })
    expect(wrapper.attributes('data-locale')).toBe('fr-FR')
    // A code the app wrote with an underscore, and no language of its own.
    localeEntries.value = { pt_BR: {} }
    ;(i18n.global.locale as { value: string }).value = 'pt_BR'
    await nextTick()
    expect(wrapper.attributes('data-locale')).toBe('pt-BR')
    // An English code for British English.
    localeEntries.value = { en: { language: 'en-GB' } }
    i18n.global.locale.value = 'en'
    await nextTick()
    expect(wrapper.attributes('data-locale')).toBe('en-GB')
    // No tag at all: the visitor's own locale, and nothing throws.
    localeEntries.value = {}
    ;(i18n.global.locale as { value: string }).value = 'not a tag'
    await nextTick()
    expect(wrapper.attributes('data-locale')).toBeUndefined()
  })
})

describe('localized module pages', () => {
  it('titles a page in the active locale', () => {
    const wrapper = mount(ProfilePage, { global: { stubs: { ProfileSettings: true } } })
    expect(wrapper.find('h1').text()).toBe('Profil')
    expect(toValue((useHead.mock.calls.at(-1)?.[0] as { title: MaybeRefOrGetter<string> }).title)).toBe('Profil')
  })

  it('links between them in the active locale', async () => {
    const Link = defineComponent({
      setup() {
        const pricing = useBackendPagePath('pricing')
        return () => h('a', { href: pricing.value })
      },
    })
    const wrapper = mount(Link)
    expect(wrapper.attributes('href')).toBe('/fr/pricing')
    i18n.global.locale.value = 'en'
    await nextTick()
    expect(wrapper.attributes('href')).toBe('/pricing')
  })
})

describe('the backend:error hook', () => {
  it('hears every failed action, with the failure and what the call threw', async () => {
    const { useActionState } = await import('../../src/runtime/vue/utils/action-state')
    const heard = vi.fn()
    const unhook = nuxtApp.hook('backend:error', heard)
    const cause = backendError('rate_limited', { retryAfter: 2000 })
    let run!: ReturnType<typeof useActionState>['run']
    mount(defineComponent({
      setup() {
        run = useActionState().run
        return () => null
      },
    }))
    await expect(run(() => Promise.reject(cause))).rejects.toBe(cause)
    unhook()
    expect(heard).toHaveBeenCalledOnce()
    expect(heard.mock.calls[0]![0]).toMatchObject({ error: { code: 'rate_limited', data: { retryAfter: 2000 } }, cause })
  })
})
