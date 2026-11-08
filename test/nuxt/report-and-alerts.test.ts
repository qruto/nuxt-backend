import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ConvexAuthStateKey } from 'nuxt-convex-module/client'
import { backendError } from '../../src/convex/errors'
import { useReportForm, type UseReportFormReturn } from '../../src/runtime/vue/composables/use-report-form'
import { useSignInAlerts, type UseSignInAlertsReturn } from '../../src/runtime/vue/composables/use-sign-in-alerts'
import type { SignInAlert } from '../../src/runtime/vue/components/account/security-alerts'

// The two headless composables of the UI kit: a signed-in person's report of
// one thing (`useReportForm`, over `reportContent`) and the account's
// sign-in alerts (`useSignInAlerts`, over `listSignInAlerts` and the
// sessions). Each is driven through its bindings, as markup of an app's own
// would drive it.

const { report, notice, revoke, alerts, sessions } = vi.hoisted(() => ({
  report: vi.fn(async (_args: Record<string, unknown>) => null),
  notice: vi.fn(async (_args: Record<string, unknown>) => null),
  revoke: vi.fn(async (_id: string) => {}),
  alerts: { value: undefined as unknown },
  sessions: { value: [] as Array<{ id: string, current: boolean }> },
}))

vi.mock('nuxt-convex-module/client', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  useMutation: () => report,
  useAction: () => notice,
}))
mockNuxtImport('useRequestURL', () => () => new URL('https://panels.example/s/strip_1#appeal=secret'))
vi.mock('../../src/runtime/vue/composables/use-human-check', () => ({ useHumanCheck: () => ({ token: async () => 'human-token' }) }))
vi.mock('../../src/runtime/vue/composables/use-backend-page-path', () => ({ useBackendPagePath: () => computed(() => '/report') }))
vi.mock('../../src/runtime/vue/components/account/security-alerts', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  useSignInAlertsState: () => ({
    alerts: computed(() => alerts.value as SignInAlert[] | undefined),
    isLoading: computed(() => alerts.value === undefined),
    error: computed(() => null),
  }),
}))
vi.mock('../../src/runtime/vue/composables/use-sessions', () => ({
  useSessions: () => ({ sessions: computed(() => sessions.value), revoke }),
}))

const signedIn = ref(true)

/** Mount a composable inside a component, signed in or out. */
function withComposable<T>(setup: () => T): T {
  let result!: T
  mount(defineComponent({
    setup() {
      result = setup()
      return () => h('div')
    },
  }), { global: { provide: { [ConvexAuthStateKey as symbol]: { isAuthenticated: signedIn, isLoading: ref(false) } } } })
  return result
}

const strip = { table: 'strips', id: 'strip_1' }
const submit = (form: UseReportFormReturn) => (form.bind.root.value.onSubmit as (event: Event) => void)(new Event('submit'))
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

beforeEach(() => {
  vi.clearAllMocks()
  signedIn.value = true
  alerts.value = undefined
  sessions.value = []
})

const api = { sendNotice: {} as never, reportContent: {} as never }
const type = (bag: Record<string, unknown>, value: string) => (bag.onInput as (event: Event) => void)({ target: { value } } as unknown as Event)

describe('useReportForm: a notice (DSA Art. 16)', () => {
  it('sends the address of the page, the reason, why, the reporter and the good-faith statement, and says it was received', async () => {
    signedIn.value = false
    const form = withComposable(() => useReportForm(strip, { api }))
    expect(form.mode).toBe('notice')
    // The address of the page the form is on, without the fragment an appeal token travels in.
    expect(form.url.value).toBe('https://panels.example/s/strip_1')
    expect(form.bind.urlInput.value.value).toBe('https://panels.example/s/strip_1')
    ;(form.bind.reason('illegal').onChange as () => void)()
    type(form.bind.details.value, 'It copies my published book page for page.')
    type(form.bind.nameInput.value, 'Ada Lovelace')
    type(form.bind.emailInput.value, 'ada@example.com')
    ;(form.bind.goodFaithInput.value.onChange as (event: Event) => void)({ target: { checked: true } } as unknown as Event)
    submit(form)
    expect(form.state.value).toBe('pending')
    await flush()
    expect(notice).toHaveBeenCalledWith({
      url: 'https://panels.example/s/strip_1',
      reason: 'illegal',
      details: 'It copies my published book page for page.',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      goodFaith: true,
      subject: strip,
      human: 'human-token',
    })
    expect(report).not.toHaveBeenCalled()
    expect(form.state.value).toBe('sent')
    expect(form.announcement.value).toBe('Thanks. We received your report and will email you our decision.')
  })

  it('asks for a name and an address, except about child sexual abuse material', async () => {
    const form = withComposable(() => useReportForm(strip, { api }))
    form.reason.value = 'abuse'
    form.details.value = 'Threats in every panel.'
    form.goodFaith.value = true
    expect(form.contactRequired.value).toBe(true)
    expect(form.bind.nameInput.value.required).toBe(true)
    await expect(form.send()).resolves.toBe(false)
    expect(form.errorField.value).toBe('name')
    expect(form.bind.nameInput.value['aria-invalid']).toBe('true')
    form.reason.value = 'child_abuse'
    expect(form.contactRequired.value).toBe(false)
    await expect(form.send()).resolves.toBe(true)
    expect(notice).toHaveBeenCalledWith(expect.not.objectContaining({ email: expect.anything() }))
    expect(form.announcement.value).toBe('Thanks. We received your report.')
  })

  it('refuses without the good-faith statement, and signs a request about an intimate image', async () => {
    const form = withComposable(() => useReportForm(strip, { api }))
    form.reason.value = 'intimate'
    form.details.value = 'It is me, shared without my consent.'
    form.name.value = 'Ada Lovelace'
    form.email.value = 'ada@example.com'
    expect(form.signatureRequired.value).toBe(true)
    await expect(form.send()).resolves.toBe(false)
    expect(form.errorField.value).toBe('signature')
    form.signature.value = 'Ada Lovelace'
    await expect(form.send()).resolves.toBe(false)
    expect(form.errorField.value).toBe('goodFaith')
    expect(form.labels.errorMessage(form.error.value)).toBe('Confirm that your report is accurate and made in good faith.')
    expect(notice).not.toHaveBeenCalled()
    form.goodFaith.value = true
    await expect(form.send()).resolves.toBe(true)
    expect(notice).toHaveBeenCalledWith(expect.objectContaining({ signature: 'Ada Lovelace', goodFaith: true }))
  })

  it('refuses without a reason, naming the field, and sends nothing', async () => {
    const form = withComposable(() => useReportForm(strip, { api }))
    await expect(form.send()).resolves.toBe(false)
    expect(notice).not.toHaveBeenCalled()
    expect(form.state.value).toBe('refused')
    expect(form.errorField.value).toBe('reason')
    expect(form.bind.reasons.value['aria-invalid']).toBe('true')
    expect(form.labels.errorMessage(form.error.value)).toBe('Pick a reason.')
  })

  it('offers the reasons an app picks, in its order, and takes the address an app gives', () => {
    const form = withComposable(() => useReportForm(strip, { reasons: ['spam', 'abuse'], url: 'https://panels.example/s/other', api }))
    expect(form.reasons.value).toEqual(['spam', 'abuse'])
    expect(form.url.value).toBe('https://panels.example/s/other')
  })

  it('carries the honeypot, which the deployment files nothing for', async () => {
    const form = withComposable(() => useReportForm(strip, { api }))
    form.reason.value = 'child_abuse'
    form.details.value = 'A bot fills every field.'
    form.goodFaith.value = true
    form.website.value = 'https://spam.example'
    expect(form.bind.honeypotInput.value['aria-hidden']).toBe('true')
    expect(form.bind.honeypotInput.value.tabindex).toBe(-1)
    await form.send()
    expect(notice).toHaveBeenCalledWith(expect.objectContaining({ website: 'https://spam.example' }))
  })

  it('holds the limit\'s wait in seconds after a rate_limited refusal', async () => {
    notice.mockRejectedValueOnce(backendError('rate_limited', { limit: 'report', retryAfter: 120_000 }))
    const form = withComposable(() => useReportForm(strip, { api }))
    form.reason.value = 'child_abuse'
    form.details.value = 'It is abuse.'
    form.goodFaith.value = true
    await expect(form.send()).resolves.toBe(false)
    expect(form.state.value).toBe('refused')
    expect(form.retryAfter.value).toBe(120)
  })
})

describe('useReportForm: a quick report', () => {
  it('files a signed-in person\'s reason and details through reportContent, with no notice fields', async () => {
    const form = withComposable(() => useReportForm(strip, { mode: 'quick', api }))
    form.reason.value = 'spam'
    form.details.value = '  It sells pills.  '
    await expect(form.send()).resolves.toBe(true)
    expect(report).toHaveBeenCalledWith({ subject: strip, reason: 'spam', details: 'It sells pills.' })
    expect(notice).not.toHaveBeenCalled()
    expect(form.announcement.value).toBe('Thanks. A person on our team will look at it.')
  })

  it('points someone signed out at the report page, with the thing in its address', async () => {
    signedIn.value = false
    const form = withComposable(() => useReportForm(strip, { mode: 'quick', api }))
    form.reason.value = 'spam'
    await form.send()
    expect(report).not.toHaveBeenCalled()
    expect(form.error.value?.code).toBe('unauthenticated')
    expect(form.noticePath.value).toBe('/report?table=strips&id=strip_1')
  })
})

describe('useSignInAlerts', () => {
  const laptop: SignInAlert = { at: Date.UTC(2026, 10, 3, 9, 12), browser: 'Firefox', os: 'macOS', recovery: false, sessionId: 'session_2' }
  const phone: SignInAlert = { at: Date.UTC(2026, 10, 2), os: 'iOS', recovery: true, sessionId: 'session_1' }

  it('says each alert in one sentence, with its device', () => {
    alerts.value = [laptop, phone]
    const signIns: UseSignInAlertsReturn = withComposable(() => useSignInAlerts())
    expect(signIns.device(laptop)).toBe('Firefox · macOS')
    expect(signIns.device(phone)).toBe('Browser · iOS')
    expect(signIns.sentence(laptop)).toMatch(/^New sign-in from Firefox · macOS, /)
    expect(signIns.sentence(phone)).toMatch(/^Recovery code used on Browser · iOS, /)
    expect(signIns.bind.alert(phone)['data-state']).toBe('recovery')
  })

  it('signs out a session still signed in elsewhere, never this browser\'s', async () => {
    alerts.value = [laptop, phone]
    sessions.value = [{ id: 'session_1', current: true }, { id: 'session_2', current: false }]
    const signIns = withComposable(() => useSignInAlerts())
    expect(signIns.canSignOut(laptop)).toBe(true)
    expect(signIns.canSignOut(phone)).toBe(false)
    const button = signIns.bind.signOut(laptop)
    expect(button['aria-label']).toMatch(/^Sign it out: Firefox · macOS, signed in /)
    await signIns.signOut(laptop)
    expect(revoke).toHaveBeenCalledWith('session_2')
    await signIns.signOut(phone)
    expect(revoke).toHaveBeenCalledTimes(1)
  })

  it('keeps a failed sign-out in error, and rejects with it', async () => {
    alerts.value = [laptop]
    sessions.value = [{ id: 'session_2', current: false }]
    revoke.mockRejectedValueOnce(backendError('rate_limited', { limit: 'auth', retryAfter: 1000 }))
    const signIns = withComposable(() => useSignInAlerts())
    await expect(signIns.signOut(laptop)).rejects.toThrow()
    expect(signIns.error.value?.code).toBe('rate_limited')
    expect(signIns.isPending.value).toBe(false)
  })

  it('says when no new device signed in, in a polite status that stays in the page', () => {
    alerts.value = []
    const signIns = withComposable(() => useSignInAlerts())
    expect(signIns.status.value).toBe('No new device has signed in to your account.')
    expect(signIns.bind.status.value).toMatchObject({ 'role': 'status', 'aria-live': 'polite' })
    alerts.value = undefined
    expect(signIns.isLoading.value).toBe(true)
    expect(signIns.bind.root.value['aria-busy']).toBe('true')
  })
})
