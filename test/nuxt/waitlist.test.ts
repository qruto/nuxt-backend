import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, reactive, ref, toValue, type Component, type MaybeRefOrGetter } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ConvexError } from 'convex/values'
import type { WaitlistStatusView } from '../../src/convex/integrations/waitlist'

// The waitlist on the page: useWaitlist's steps over the auth client and a
// stand-in for `backend/waitlist.ts`, <WaitlistForm> and its slots, and the
// `/waitlist` page's body: a status link's place, the join without one, and
// what each launch phase and a signed-in visitor read there.

type Answer = { data?: unknown, error?: Record<string, unknown> | null }
const ok = (data: unknown = { success: true }): Answer => ({ data, error: null })
const ada = { id: 'u1', name: 'Ada', email: 'ada@example.com' }

const sessionRefetch = vi.fn(async () => {})
const client = {
  signOut: vi.fn(async (): Promise<Answer> => ok()),
  emailOtp: { sendVerificationOtp: vi.fn(async (): Promise<Answer> => ok()) },
  signIn: { emailOtp: vi.fn(async (_body?: unknown, _options?: unknown): Promise<Answer> => ok({ token: 't', user: ada })) },
  admin: { checkRolePermission: vi.fn(() => false) },
}

vi.mock('nuxt-convex-module/better-auth/client', () => ({
  // Where a page that is done sends the person: no `?redirect=` here, so the default.
  resolveAuthRedirect: (_redirect: unknown, fallback: string) => fallback,
  useBetterAuth: () => ({
    isLoading: computed(() => false),
    isAuthenticated: computed(() => false),
    fetchAccessToken: vi.fn(async () => 'token'),
    client,
    session: ref({ data: null, isPending: false, refetch: sessionRefetch }),
    user: computed(() => null),
    authVersion: computed(() => null),
  }),
}))

vi.mock('../../src/runtime/vue/composables/use-backend-config', () => ({ useBackendConfig: () => ({ billing: { plans: [], packs: [], lowCreditsThreshold: 10 }, brand: {}, labels: {} }) }))

/** What each read answers, by query and its arguments; a read not here stays pending. */
const answers = reactive(new Map<string, unknown>())
const key = (query: string, args: unknown) => `${query}@${JSON.stringify(args)}`
const joinCall = vi.fn(async (_args: unknown) => null)
const leaveCall = vi.fn(async (_args: unknown) => null)
vi.mock('nuxt-convex-module/client', async original => ({
  ...await original<Record<string, unknown>>(),
  useAction: () => joinCall,
  useMutation: () => leaveCall,
  useQuery_experimental: ({ query, args }: { query: string, args: MaybeRefOrGetter<unknown> }) => computed(() => {
    const value = toValue(args)
    if (value === 'skip') return { status: 'pending' }
    const answer = answers.get(key(query, value))
    return answer === undefined ? { status: 'pending' } : { status: 'success', data: answer }
  }),
}))

const route = reactive({ path: '/waitlist', query: {} as Record<string, string> })
mockNuxtImport('useRoute', () => () => route)

// The page's address, read on the server or in the browser (see the helper).
const { requestURL, serverRequest } = await vi.hoisted(() => import('../helpers/request-url'))
mockNuxtImport('useRequestURL', original => (opts?: Parameters<typeof requestURL>[1]) => requestURL(original, opts))

// The launch phase the page reads (useAccessPhase's own tests hold the read).
const launch = ref<string | undefined>('early-access')
vi.mock('../../src/runtime/vue/composables/use-access', () => ({
  useAccessPhase: () => ({ phase: computed(() => launch.value), isPublic: computed(() => launch.value === 'public'), isLoading: computed(() => launch.value === undefined), error: computed(() => null) }),
}))

// The bot check asks for no token where the app checks nobody (the protection tests hold the rest).
vi.mock('../../src/runtime/vue/composables/use-human-check', () => ({ useHumanCheck: () => ({ mode: computed(() => 'off'), isPending: computed(() => false), error: ref(null), token: async () => null }) }))

const { campaignSource, useWaitlist } = await import('../../src/runtime/vue/composables/use-waitlist')
const { registerComponents } = await import('../helpers/register-components')
const { WaitlistForm } = await registerComponents('WaitlistForm') as Record<'WaitlistForm', Component>
const { default: WaitlistStatus } = await import('../../src/runtime/vue/components/auth/WaitlistStatus.vue')
const { BackendApiKey } = await import('../../src/runtime/vue/utils/namespace')
const { ConvexAuthStateKey } = await import('nuxt-convex-module/client')

const api = { getWaitlistQuestions: 'waitlist:getWaitlistQuestions', joinWaitlist: 'waitlist:joinWaitlist', waitlistStatus: 'waitlist:waitlistStatus', leaveWaitlist: 'waitlist:leaveWaitlist' }
const provide = { [BackendApiKey as symbol]: { waitlist: api } }
const QUESTIONS = { role: ['Writer', 'Illustrator'] }
const VIEW: WaitlistStatusView = { status: 'waiting', position: 48, total: 1204, friends: 2, cap: 10, shareCode: 'ABCD2345', launchNews: true }

const mounted: VueWrapper[] = []
function inSetup<T>(runner: () => T): T {
  let result: T
  mounted.push(mount(defineComponent({
    setup() {
      result = runner()
      return () => h('div')
    },
  }), { global: { provide } }) as VueWrapper)
  return result!
}
const render = (component: object, props: Record<string, unknown> = {}, extra: Record<symbol, unknown> = {}) => {
  const wrapper = mount(component as never, { props: props as never, attachTo: document.body, global: { provide: { ...provide, ...extra } } }) as VueWrapper
  mounted.push(wrapper)
  return wrapper
}

const ticketRequired = (phase: string, waitlist?: { position: number, total: number, token: string }) => ({ data: null, error: { code: 'forbidden', reason: 'ticket_required', phase, ...(waitlist ? { waitlist } : {}), message: 'Signing up needs an invite right now.', status: 403, statusText: 'FORBIDDEN' } })

beforeEach(() => {
  vi.clearAllMocks()
  answers.clear()
  answers.set(key('waitlist:getWaitlistQuestions', {}), QUESTIONS)
  route.query = {}
  serverRequest.current = null
  launch.value = 'early-access'
  window.history.replaceState(null, '', '/waitlist')
  window.sessionStorage.clear()
})
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

describe('useWaitlist', () => {
  it('begins a join with the answers, then asks for the sign-in code', async () => {
    const waitlist = inSetup(() => useWaitlist({ source: 'landing' }))
    waitlist.email.value = ' mo@panels.example '
    waitlist.answers.role = 'Illustrator'
    waitlist.launchNews.value = true
    await waitlist.join()
    expect(waitlist.error.value).toBeNull()
    expect(joinCall).toHaveBeenCalledWith(expect.objectContaining({ email: 'mo@panels.example', answers: { role: 'Illustrator' }, launchNews: true, launchNewsText: 'Email me when it launches', source: 'landing', human: null }))
    expect(client.emailOtp.sendVerificationOtp).toHaveBeenCalledWith({ email: 'mo@panels.example', type: 'sign-in' })
    expect(waitlist.step.value).toBe('verify')
    expect(waitlist.error.value).toBeNull()
  })

  it('leaves out an unticked box, an empty answer and a friend nobody shared', async () => {
    const waitlist = inSetup(() => useWaitlist())
    waitlist.email.value = 'mo@panels.example'
    waitlist.answers.role = ''
    await waitlist.join()
    expect(joinCall.mock.calls[0]![0]).toEqual({ email: 'mo@panels.example', human: null })
  })

  it('records the campaign the visitor came with beside the source, unless asked not to', async () => {
    route.query = { utm_source: 'insta gram', utm_campaign: 'early-access', utm_medium: 'social' }
    const landing = inSetup(() => useWaitlist({ source: 'landing' }))
    landing.email.value = 'mo@panels.example'
    await landing.join()
    // The form's source, then the campaign's tags, a space taken for a dash.
    expect(joinCall.mock.calls.at(-1)![0]).toMatchObject({ source: 'landing:insta-gram/early-access' })
    const form = inSetup(() => useWaitlist())
    form.email.value = 'mo@panels.example'
    await form.join()
    expect(joinCall.mock.calls.at(-1)![0]).toMatchObject({ source: 'form:insta-gram/early-access' })
    const plain = inSetup(() => useWaitlist({ source: 'landing', campaign: false }))
    plain.email.value = 'mo@panels.example'
    await plain.join()
    expect(joinCall.mock.calls.at(-1)![0]).toMatchObject({ source: 'landing' })
  })

  it('cuts a campaign source to the longest one a join takes', () => {
    expect(campaignSource('landing', { source: 'x'.repeat(80) })).toHaveLength(64)
    expect(campaignSource('landing', undefined)).toBe('landing')
    expect(campaignSource('landing', { medium: 'email' })).toBe('landing')
  })

  it('carries the friend\'s code from the address, once, and lets the visitor drop it', async () => {
    route.query = { ref: 'ABCD2345' }
    const waitlist = inSetup(() => useWaitlist())
    expect(waitlist.ref.value).toBe('ABCD2345')
    waitlist.email.value = 'mo@panels.example'
    await waitlist.join()
    expect(joinCall).toHaveBeenCalledWith(expect.objectContaining({ ref: 'ABCD2345' }))
    waitlist.dropReferral()
    expect(waitlist.ref.value).toBeNull()
  })

  it('refuses an address that is no address before anything is sent', async () => {
    const waitlist = inSetup(() => useWaitlist())
    waitlist.email.value = 'nope'
    await waitlist.join()
    expect(joinCall).not.toHaveBeenCalled()
    expect(waitlist.error.value).toMatchObject({ code: 'invalid_input', data: { field: 'email' } })
    expect(waitlist.step.value).toBe('join')
  })

  it('stays on the first step, with the reason, when the join is refused', async () => {
    joinCall.mockRejectedValueOnce(new ConvexError({ code: 'invalid_input', field: 'role', reason: 'unknown_choice', message: 'No such choice.' }))
    const waitlist = inSetup(() => useWaitlist())
    waitlist.email.value = 'mo@panels.example'
    await waitlist.join()
    expect(waitlist.step.value).toBe('join')
    expect(waitlist.error.value).toMatchObject({ code: 'invalid_input', data: { field: 'role' } })
    expect(client.emailOtp.sendVerificationOtp).not.toHaveBeenCalled()
  })

  it('checks the code, and answers the place the refusal carries', async () => {
    const waitlist = inSetup(() => useWaitlist())
    waitlist.email.value = 'mo@panels.example'
    waitlist.code.value = ' 123456 '
    client.signIn.emailOtp.mockResolvedValueOnce(ticketRequired('early-access', { position: 48, total: 1204, token: 'entry.signature' }))
    answers.set(key('waitlist:waitlistStatus', { token: 'entry.signature' }), VIEW)
    const place = await waitlist.verify()
    expect(client.signIn.emailOtp.mock.calls[0]![0]).toEqual({ email: 'mo@panels.example', otp: '123456' })
    expect(place).toMatchObject({ position: 48, total: 1204, token: 'entry.signature' })
    expect(waitlist.step.value).toBe('status')
    // Live: the status link's read replaces what the check showed.
    await nextTick()
    expect(waitlist.place.value).toMatchObject({ shareCode: 'ABCD2345', friends: 2 })
  })

  it('sends the key its join answered with the code, so only this browser\'s join applies', async () => {
    const waitlist = inSetup(() => useWaitlist())
    waitlist.email.value = 'mo@panels.example'
    joinCall.mockResolvedValueOnce({ join: 'join-key-1' } as never)
    await waitlist.join()
    waitlist.code.value = '123456'
    client.signIn.emailOtp.mockResolvedValueOnce(ticketRequired('early-access', { position: 1, total: 1, token: 'entry.signature' }))
    await waitlist.verify()
    expect(client.signIn.emailOtp.mock.calls.at(-1)![0]).toEqual({ email: 'mo@panels.example', otp: '123456', waitlistJoin: 'join-key-1' })
  })

  it('reads a wrong code as invalid_input on otp, and stays on the code', async () => {
    const waitlist = inSetup(() => useWaitlist())
    waitlist.email.value = 'mo@panels.example'
    waitlist.step.value = 'verify'
    client.signIn.emailOtp.mockResolvedValueOnce({ data: null, error: { code: 'INVALID_OTP', message: 'Invalid OTP', status: 400, statusText: 'BAD_REQUEST' } })
    expect(await waitlist.verify()).toBeNull()
    expect(waitlist.step.value).toBe('verify')
    expect(waitlist.error.value).toMatchObject({ code: 'invalid_input', data: { field: 'otp' } })
    expect(waitlist.bind.codeInput['aria-invalid']).toBe(true)
  })

  it('says the code signed the person in when they held a ticket', async () => {
    const waitlist = inSetup(() => useWaitlist())
    waitlist.email.value = 'ada@example.com'
    waitlist.step.value = 'verify'
    expect(await waitlist.verify()).toBeNull()
    expect(waitlist.signedIn.value).toBe(true)
    expect(sessionRefetch).toHaveBeenCalled()
  })

  it('does not take a closed invite-only phase for a waitlist', async () => {
    const waitlist = inSetup(() => useWaitlist())
    waitlist.email.value = 'mo@panels.example'
    waitlist.step.value = 'verify'
    client.signIn.emailOtp.mockResolvedValueOnce(ticketRequired('invite-only'))
    expect(await waitlist.verify()).toBeNull()
    expect(waitlist.step.value).toBe('verify')
    expect(waitlist.error.value).toMatchObject({ code: 'forbidden' })
  })

  it('follows a status link, and leaves with its token', async () => {
    const waitlist = inSetup(() => useWaitlist())
    answers.set(key('waitlist:waitlistStatus', { token: 'entry.signature' }), VIEW)
    waitlist.status(' entry.signature ')
    await nextTick()
    expect(waitlist.step.value).toBe('status')
    expect(waitlist.place.value).toMatchObject({ position: 48 })
    await waitlist.leave()
    expect(leaveCall).toHaveBeenCalledWith({ token: 'entry.signature' })
    expect(waitlist.step.value).toBe('join')
    expect(waitlist.place.value).toBeUndefined()
  })

  it('opens a status link with statusLink: the token leaves the address, the tab keeps it, and a leave drops it', async () => {
    window.history.replaceState(null, '', '/waitlist#entry.signature')
    answers.set(key('waitlist:waitlistStatus', { token: 'entry.signature' }), VIEW)
    const waitlist = inSetup(() => useWaitlist({ statusLink: true }))
    await nextTick()
    expect(window.location.hash).toBe('')
    expect(window.location.pathname).toBe('/waitlist')
    expect(waitlist.linkChecked.value).toBe(true)
    expect(waitlist.step.value).toBe('status')
    expect(waitlist.place.value).toMatchObject({ position: 48 })
    expect(window.sessionStorage.getItem('nuxt-backend:waitlist')).toBe('entry.signature')
    await waitlist.leave()
    expect(leaveCall).toHaveBeenCalledWith({ token: 'entry.signature' })
    expect(waitlist.left.value).toBe(true)
    expect(window.sessionStorage.getItem('nuxt-backend:waitlist')).toBeNull()
  })

  it('reads the token the tab kept on a reload, and keeps a join\'s once its code checks', async () => {
    window.sessionStorage.setItem('nuxt-backend:waitlist', 'kept.signature')
    answers.set(key('waitlist:waitlistStatus', { token: 'kept.signature' }), VIEW)
    const reloaded = inSetup(() => useWaitlist({ statusLink: true }))
    await nextTick()
    expect(reloaded.step.value).toBe('status')
    expect(reloaded.place.value).toMatchObject({ position: 48 })

    window.sessionStorage.clear()
    const joining = inSetup(() => useWaitlist({ statusLink: true }))
    await nextTick()
    expect(joining.step.value).toBe('join')
    joining.email.value = 'mo@panels.example'
    joining.code.value = '123456'
    client.signIn.emailOtp.mockResolvedValueOnce(ticketRequired('early-access', { position: 48, total: 1204, token: 'entry.signature' }))
    await joining.verify()
    expect(window.sessionStorage.getItem('nuxt-backend:waitlist')).toBe('entry.signature')
    expect(window.location.hash).toBe('')
  })

  it('leaves an in-page link to the browser: a fragment naming an element of the page is no token', async () => {
    const section = document.createElement('section')
    section.id = 'how-it-works'
    document.body.append(section)
    try {
      window.sessionStorage.setItem('nuxt-backend:waitlist', 'kept.signature')
      answers.set(key('waitlist:waitlistStatus', { token: 'kept.signature' }), VIEW)
      window.history.replaceState(null, '', '/waitlist#how-it-works')
      const waitlist = inSetup(() => useWaitlist({ statusLink: true }))
      await nextTick()
      expect(window.location.hash).toBe('#how-it-works')
      // The tab's own token still opens, never overwritten by the anchor.
      expect(waitlist.step.value).toBe('status')
      expect(window.sessionStorage.getItem('nuxt-backend:waitlist')).toBe('kept.signature')
    }
    finally {
      section.remove()
    }
  })

  it('leaves the address and the tab alone without statusLink, and has nothing to check', async () => {
    window.history.replaceState(null, '', '/waitlist#entry.signature')
    const waitlist = inSetup(() => useWaitlist())
    await nextTick()
    expect(waitlist.linkChecked.value).toBe(true)
    expect(waitlist.step.value).toBe('join')
    expect(window.location.hash).toBe('#entry.signature')
    answers.set(key('waitlist:waitlistStatus', { token: 'entry.signature' }), VIEW)
    waitlist.status('entry.signature')
    expect(window.sessionStorage.getItem('nuxt-backend:waitlist')).toBeNull()
  })

  it('builds the link a waiting person shares: the page it runs on, or the one asked for, with their code', async () => {
    answers.set(key('waitlist:waitlistStatus', { token: 'entry.signature' }), VIEW)
    const here = inSetup(() => useWaitlist())
    expect(here.shareLink.value).toBeNull()
    here.status('entry.signature')
    await nextTick()
    expect(here.shareLink.value).toBe(`${window.location.origin}/waitlist?ref=ABCD2345`)
    const elsewhere = inSetup(() => useWaitlist({ shareTo: '/launch?from=post' }))
    elsewhere.status('entry.signature')
    await nextTick()
    expect(elsewhere.shareLink.value).toBe(`${window.location.origin}/launch?from=post&ref=ABCD2345`)
    // Admitted, there is nothing left to share.
    answers.set(key('waitlist:waitlistStatus', { token: 'entry.signature' }), { ...VIEW, status: 'admitted' })
    await nextTick()
    expect(here.shareLink.value).toBeNull()
  })

  it('builds the same share link on the server as in the browser, so it hydrates unchanged', async () => {
    answers.set(key('waitlist:waitlistStatus', { token: 'entry.signature' }), VIEW)
    const shared = (request: typeof serverRequest.current) => {
      serverRequest.current = request
      const waitlist = inSetup(() => useWaitlist())
      waitlist.status('entry.signature')
      serverRequest.current = null
      return waitlist
    }
    // The server, reached on the host the browser asked for.
    const rendered = shared({ path: '/waitlist', headers: { 'host': window.location.host, 'x-forwarded-proto': window.location.protocol.slice(0, -1) } })
    const hydrated = shared(null)
    await nextTick()
    expect(rendered.shareLink.value).toBe(`${window.location.origin}/waitlist?ref=ABCD2345`)
    expect(rendered.shareLink.value).toBe(hydrated.shareLink.value)
    // An https site whose edge reaches the server over http, on the same host: a host the client forwarded is never read.
    const edge = shared({ path: '/waitlist', headers: { 'host': 'panels.app', 'x-forwarded-host': 'elsewhere.example', 'x-forwarded-proto': 'https' } })
    await nextTick()
    expect(edge.shareLink.value).toBe('https://panels.app/waitlist?ref=ABCD2345')
  })

  it('hands markup of its own the attributes it needs', async () => {
    const waitlist = inSetup(() => useWaitlist())
    expect(waitlist.bind.emailInput).toMatchObject({ type: 'email', autocomplete: 'email', required: true })
    expect(waitlist.bind.codeInput).toMatchObject({ autocomplete: 'one-time-code', inputmode: 'numeric' })
    waitlist.bind.emailInput.onInput({ target: { value: 'mo@panels.example' } } as unknown as Event)
    waitlist.bind.answerInput('role').onChange({ target: { value: 'Writer' } } as unknown as Event)
    waitlist.bind.launchNewsInput.onChange({ target: { checked: true } } as unknown as Event)
    expect([waitlist.email.value, waitlist.answers.role, waitlist.launchNews.value]).toEqual(['mo@panels.example', 'Writer', true])
    await nextTick()
    expect(waitlist.questions.value).toEqual(QUESTIONS)
  })
})

describe('<WaitlistForm>', () => {
  it('walks the three steps, every element in its family, and tells the page where the person stands', async () => {
    const wrapper = render(WaitlistForm, { source: 'landing' })
    await flushPromises()
    expect(wrapper.find('[data-waitlist="root"]').attributes('data-state')).toBe('join')
    expect(wrapper.find('[data-waitlist="input-news"]').element).toHaveProperty('checked', false)
    expect(wrapper.findAll('[data-waitlist="input-question"] option').map(option => option.text())).toEqual(['', 'Writer', 'Illustrator'])
    expect(wrapper.find('[data-waitlist="disclosure"]').text()).toContain('Your position can change')
    await wrapper.find('[data-waitlist="input-email"]').setValue('mo@panels.example')
    await wrapper.find('[data-waitlist="input-question"]').setValue('Writer')
    await wrapper.find('[data-waitlist="join"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-waitlist="verify"]').exists()).toBe(true)
    expect(wrapper.find('[data-waitlist="sent-note"]').attributes('role')).toBe('status')
    client.signIn.emailOtp.mockResolvedValueOnce(ticketRequired('early-access', { position: 48, total: 1204, token: 'entry.signature' }))
    await wrapper.find('[data-waitlist="input-code"]').setValue('123456')
    await wrapper.find('[data-waitlist="verify"]').trigger('submit')
    await flushPromises()
    expect(wrapper.emitted('joined')![0]![0]).toMatchObject({ position: 48, total: 1204 })
    expect(wrapper.find('[data-waitlist="position"]').text()).toBe('You\'re #48 of 1,204')
    // The honest words and the incentive disclosure.
    expect(wrapper.find('[data-waitlist="disclosure"]').text()).toBe('We admit in waves and may also admit by other criteria. Your position can change.')
    for (const element of wrapper.element.querySelectorAll('*')) expect(element.hasAttribute('data-waitlist'), element.outerHTML.slice(0, 80)).toBe(true)
  })

  it('shows a refusal as an alert the field is described by, and emits it', async () => {
    joinCall.mockRejectedValueOnce(new ConvexError({ code: 'forbidden', reason: 'bot_check', message: 'We could not tell you from a bot.' }))
    const wrapper = render(WaitlistForm)
    await flushPromises()
    await wrapper.find('[data-waitlist="input-email"]').setValue('mo@panels.example')
    await wrapper.find('[data-waitlist="join"]').trigger('submit')
    await flushPromises()
    const alert = wrapper.find('[data-waitlist="error"]')
    expect(alert.attributes('role')).toBe('alert')
    expect(wrapper.find('[data-waitlist="input-email"]').attributes('aria-describedby')).toBe(alert.attributes('id'))
    expect(wrapper.emitted('error')).toHaveLength(1)
  })

  it('shows the friend the visitor came through, and lets them drop it', async () => {
    route.query = { ref: 'ABCD2345' }
    const wrapper = render(WaitlistForm)
    await flushPromises()
    expect(wrapper.find('[data-waitlist="referral"]').text()).toContain('A friend invited you')
    await wrapper.find('[data-waitlist="drop-referral"]').trigger('click')
    expect(wrapper.find('[data-waitlist="referral"]').exists()).toBe(false)
  })

  it('renders a slot for each step, given the steps\' state', async () => {
    const seen: string[] = []
    const wrapper = render(WaitlistForm, {})
    await flushPromises()
    wrapper.unmount()
    const slotted = mount(WaitlistForm as never, {
      attachTo: document.body,
      global: { provide },
      slots: {
        join: (props: { step: { value: string } }) => {
          seen.push(props.step.value)
          return h('i', { 'data-slot': 'join' })
        },
      },
    }) as VueWrapper
    mounted.push(slotted)
    expect(slotted.find('[data-slot="join"]').exists()).toBe(true)
    expect(seen).toEqual(['join'])
  })

  it('renders a same-named component of the app\'s in place of a part, given the form\'s steps', async () => {
    // A part emits nothing: the app's join step calls `waitlist.join()` and
    // `waitlist.verify()`, and the form still emits its events.
    const OwnJoin = defineComponent({
      props: { waitlist: { type: Object, required: true } },
      setup: (props) => {
        const waitlist = props.waitlist as { email: { value: string }, join: () => unknown }
        return () => h('button', { 'data-own': 'join', 'onClick': () => {
          waitlist.email.value = 'mo@panels.example'
          return waitlist.join()
        } })
      },
    })
    const OwnCode = defineComponent({
      props: { waitlist: { type: Object, required: true } },
      setup: (props) => {
        const waitlist = props.waitlist as { code: { value: string }, verify: () => unknown }
        return () => h('button', { 'data-own': 'verify', 'onClick': () => {
          waitlist.code.value = '123456'
          return waitlist.verify()
        } })
      },
    })
    const wrapper = mount(WaitlistForm as never, { attachTo: document.body, global: { provide, components: { WaitlistJoin: OwnJoin, WaitlistCode: OwnCode } } }) as VueWrapper
    mounted.push(wrapper)
    await flushPromises()
    expect(wrapper.find('[data-waitlist="join"]').exists()).toBe(false)
    await wrapper.find('[data-own="join"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-waitlist="root"]').attributes('data-state')).toBe('verify')
    client.signIn.emailOtp.mockResolvedValueOnce(ticketRequired('early-access', { position: 3, total: 9, token: 'entry.signature' }))
    await wrapper.find('[data-own="verify"]').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('joined')![0]![0]).toMatchObject({ position: 3, total: 9 })
    // The packaged place part shows it, with the form's words.
    expect(wrapper.find('[data-waitlist="position"]').text()).toBe('You\'re #3 of 9')
  })

  it('is busy while the code is on its way, and keeps focus on the button', async () => {
    let release!: () => void
    joinCall.mockImplementationOnce(() => new Promise<null>((resolve) => {
      release = () => resolve(null)
    }))
    const wrapper = render(WaitlistForm)
    await flushPromises()
    await wrapper.find('[data-waitlist="input-email"]').setValue('mo@panels.example')
    await wrapper.find('[data-waitlist="join"]').trigger('submit')
    expect(wrapper.find('[data-waitlist="root"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.find('[data-waitlist="submit"]').attributes('aria-disabled')).toBe('true')
    release()
    await flushPromises()
    expect(wrapper.find('[data-waitlist="root"]').attributes('aria-busy')).toBeUndefined()
  })
})

describe('the /waitlist page', () => {
  it('reads a place from the link\'s token, takes the token off the address for the tab to keep, and offers a link to share', async () => {
    answers.set(key('waitlist:waitlistStatus', { token: 'entry.signature' }), VIEW)
    window.location.hash = '#entry.signature'
    const wrapper = render(WaitlistStatus)
    await flushPromises()
    // A key to the place and to leaving: never in an address bar copied beside the share field.
    expect(window.location.hash).toBe('')
    expect(wrapper.find('[data-waitlist="position"]').text()).toBe('You\'re #48 of 1,204')
    expect((wrapper.find('[data-waitlist="share-link"]').element as HTMLInputElement).value).toBe(`${window.location.origin}/waitlist?ref=ABCD2345`)
    expect(wrapper.find('[data-waitlist="share-intro"]').text()).toContain('moves you up')
    expect(wrapper.find('[data-waitlist="friends"]').text()).toBe('2 friends have joined with your link.')
    wrapper.unmount()
    // A reload: the tab kept the token.
    const reloaded = render(WaitlistStatus)
    await flushPromises()
    expect(reloaded.find('[data-waitlist="page"]').attributes('data-state')).toBe('ready')
    expect(reloaded.find('[data-waitlist="position"]').text()).toBe('You\'re #48 of 1,204')
  })

  it('says a link that names nobody does not work', async () => {
    answers.set(key('waitlist:waitlistStatus', { token: 'forged.signature' }), null)
    window.location.hash = '#forged.signature'
    const wrapper = render(WaitlistStatus)
    await flushPromises()
    expect(wrapper.find('[data-waitlist="status"]').attributes('role')).toBe('alert')
    expect(wrapper.find('[data-waitlist="page"]').attributes('data-state')).toBe('unknown')
  })

  it('shows the way in for an admitted person', async () => {
    answers.set(key('waitlist:waitlistStatus', { token: 'in.signature' }), { ...VIEW, status: 'admitted', position: null })
    window.location.hash = '#in.signature'
    const admitted = render(WaitlistStatus)
    await flushPromises()
    expect(admitted.find('[data-waitlist="admitted"]').text()).toContain('You\'re in')
    expect(admitted.find('[data-waitlist="sign-up"]').attributes('href')).toBe('/login')
    expect(admitted.find('[data-waitlist="share"]').exists()).toBe(false)
  })

  it('removes the entry on Leave and says so', async () => {
    answers.set(key('waitlist:waitlistStatus', { token: 'entry.signature' }), VIEW)
    window.location.hash = '#entry.signature'
    const wrapper = render(WaitlistStatus)
    await flushPromises()
    await wrapper.find('[data-waitlist="leave"]').trigger('click')
    await flushPromises()
    expect(leaveCall).toHaveBeenCalledWith({ token: 'entry.signature' })
    expect(wrapper.find('[data-waitlist="page"]').attributes('data-state')).toBe('left')
    // The join is offered again, and the tab keeps the old token no longer: a reload offers the join, not a dead link.
    expect(wrapper.find('[data-waitlist="join"]').exists()).toBe(true)
    wrapper.unmount()
    const reloaded = render(WaitlistStatus)
    await flushPromises()
    expect(reloaded.find('[data-waitlist="page"]').attributes('data-state')).toBe('join')
  })

  it('joins without a token in early access, and keeps the status token for the tab, never in the address, once the code checks', async () => {
    route.query = { ref: 'FRND2345' }
    const wrapper = render(WaitlistStatus)
    await flushPromises()
    expect(wrapper.find('[data-waitlist="page"]').attributes('data-state')).toBe('join')
    // The friend's link the visitor came through rides along with the join.
    expect(wrapper.find('[data-waitlist="referral"]').exists()).toBe(true)
    await wrapper.find('[data-waitlist="input-email"]').setValue('mo@panels.example')
    await wrapper.find('[data-waitlist="join"]').trigger('submit')
    await flushPromises()
    expect(joinCall).toHaveBeenCalledWith(expect.objectContaining({ source: 'waitlist', ref: 'FRND2345' }))
    client.signIn.emailOtp.mockResolvedValueOnce(ticketRequired('early-access', { position: 48, total: 1204, token: 'entry.signature' }))
    answers.set(key('waitlist:waitlistStatus', { token: 'entry.signature' }), VIEW)
    await wrapper.find('[data-waitlist="input-code"]').setValue('123456')
    await wrapper.find('[data-waitlist="verify"]').trigger('submit')
    await flushPromises()
    expect(window.location.hash).toBe('')
    expect(wrapper.find('[data-waitlist="position"]').text()).toBe('You\'re #48 of 1,204')
    // A friend's link opens this page, where the join is.
    expect((wrapper.find('[data-waitlist="share-link"]').element as HTMLInputElement).value).toBe(`${window.location.origin}/waitlist?ref=ABCD2345`)
    wrapper.unmount()
    // A reload shows the place the join took.
    const reloaded = render(WaitlistStatus)
    await flushPromises()
    expect(reloaded.find('[data-waitlist="page"]').attributes('data-state')).toBe('ready')
  })

  it('offers the join again under a link that does not work', async () => {
    answers.set(key('waitlist:waitlistStatus', { token: 'forged.signature' }), null)
    window.location.hash = '#forged.signature'
    const wrapper = render(WaitlistStatus)
    await flushPromises()
    expect(wrapper.find('[data-waitlist="join"]').exists()).toBe(true)
  })

  it('sends a new visitor to the invite page while invite only, and keeps a place a link holds', async () => {
    launch.value = 'invite-only'
    const closed = render(WaitlistStatus)
    await flushPromises()
    expect(closed.find('[data-waitlist="page"]').attributes('data-state')).toBe('closed')
    expect(closed.find('[data-waitlist="status"]').text()).toBe('The waitlist is closed. Signing up takes an invite right now.')
    expect(closed.find('[data-waitlist="page-invite"]').attributes('href')).toBe('/invite')
    expect(closed.find('[data-waitlist="join"]').exists()).toBe(false)
    answers.set(key('waitlist:waitlistStatus', { token: 'entry.signature' }), VIEW)
    window.location.hash = '#entry.signature'
    const held = render(WaitlistStatus)
    await flushPromises()
    expect(held.find('[data-waitlist="page"]').attributes('data-state')).toBe('ready')
    expect(held.find('[data-waitlist="position"]').exists()).toBe(true)
  })

  it('confirms a leave while invite only, and offers the invite page there, not a join', async () => {
    launch.value = 'invite-only'
    answers.set(key('waitlist:waitlistStatus', { token: 'entry.signature' }), VIEW)
    window.location.hash = '#entry.signature'
    const wrapper = render(WaitlistStatus)
    await flushPromises()
    await wrapper.find('[data-waitlist="leave"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-waitlist="page"]').attributes('data-state')).toBe('left')
    expect(wrapper.find('[data-waitlist="status"]').text()).toBe('You left the waitlist. Your address is removed.')
    expect(wrapper.find('[data-waitlist="join"]').exists()).toBe(false)
    expect(wrapper.find('[data-waitlist="page-invite"]').attributes('href')).toBe('/invite')
  })

  it('has no line once the app is public, only the way to sign up, whatever the link', async () => {
    launch.value = 'public'
    answers.set(key('waitlist:waitlistStatus', { token: 'entry.signature' }), VIEW)
    window.location.hash = '#entry.signature'
    const wrapper = render(WaitlistStatus)
    await flushPromises()
    expect(wrapper.find('[data-waitlist="page"]').attributes('data-state')).toBe('open')
    expect(wrapper.find('[data-waitlist="page-sign-up"]').attributes('href')).toBe('/login')
    expect(wrapper.find('[data-waitlist="position"]').exists()).toBe(false)
  })

  it('waits for the phase, then tells a signed-in visitor there is no line for them', async () => {
    launch.value = undefined
    const signedIn = { [ConvexAuthStateKey as symbol]: { isLoading: computed(() => false), isAuthenticated: computed(() => true) } }
    const wrapper = render(WaitlistStatus, {}, signedIn)
    await flushPromises()
    expect(wrapper.find('[data-waitlist="page"]').attributes('data-state')).toBe('checking')
    launch.value = 'early-access'
    await flushPromises()
    expect(wrapper.find('[data-waitlist="page"]').attributes('data-state')).toBe('member')
    expect(wrapper.find('[data-waitlist="status"]').text()).toBe('You\'re signed in already, so there\'s no waitlist for you.')
    expect(wrapper.find('[data-waitlist="page-continue"]').attributes('href')).toBe('/')
    expect(wrapper.find('[data-waitlist="join"]').exists()).toBe(false)
  })
})
