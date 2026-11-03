import { describe, expect, it, vi } from 'vitest'
import { BACKEND_EVENTS, IN_APP_ONLY_AREAS } from '../../src/convex/events'
import {
  declaredChannels,
  isAppPath,
  isTransactional,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_KINDS,
  choosableChannels,
  listedKind,
  notificationChannels,
  notificationEntity,
  notificationLabelKey,
  notificationWordKeys,
  notifyProblem,
  planNotification,
} from '../../src/convex/notifications'
import { TRANSLATED_LOCALES } from '../../src/convex/label-format'
import { LABEL_TRANSLATIONS } from '../../src/convex/label-translations'
import { LABELS } from '../../src/convex/labels'

// The notification policy against the event catalog: every kind that may
// notify in the app has a row, a billing, gift, referral or bounce kind never
// uses a channel but the app, and an app's own `notify` option is checked
// before it is trusted.

const types = Object.keys(BACKEND_EVENTS) as Array<keyof typeof BACKEND_EVENTS>
const inApp = types.filter(type => (BACKEND_EVENTS[type].channels as readonly string[]).includes('in-app'))

describe('the notification kinds', () => {
  it('have a row for every kind of the catalog that declares the app, and none for another', () => {
    expect(Object.keys(NOTIFICATION_KINDS).sort()).toEqual([...inApp].sort())
  })

  it('link to a ready-made page, and name who is told', () => {
    for (const [type, kind] of Object.entries(NOTIFICATION_KINDS)) {
      expect(['subject', 'inviter', 'entity'], type).toContain(kind.audience)
      expect(['profile', 'security', 'settings'], type).toContain(kind.page)
    }
  })

  it('never reach email or push for a billing, gift, referral or bounce kind, whatever it declares', () => {
    for (const area of IN_APP_ONLY_AREAS) {
      for (const channels of [['app'], ['app', 'email'], ['app', 'email', 'push'], ['email'], ['push']] as const) {
        const allowed = notificationChannels(`${area}.something_happened`, channels)
        expect(allowed, `${area} ${channels}`).not.toContain('email')
        expect(allowed, `${area} ${channels}`).not.toContain('push')
      }
    }
    for (const type of types.filter(type => IN_APP_ONLY_AREAS.includes(type.slice(0, type.indexOf('.'))))) {
      expect(notificationChannels(type, declaredChannels(type)), type).not.toEqual(expect.arrayContaining(['email']))
    }
  })

  it('leave email to a kind no provider emails about, in the order the channels are listed', () => {
    expect(notificationChannels('auth.passkey_added', declaredChannels('auth.passkey_added'))).toEqual(['app', 'email'])
    expect(notificationChannels('workspace.member_removed', declaredChannels('workspace.member_removed'))).toEqual(['app'])
    expect(notificationChannels('app.strip_shared', ['push', 'email', 'app'])).toEqual([...NOTIFICATION_CHANNELS])
    expect(notificationChannels('app.strip_shared', ['email'])).toEqual(['email'])
    expect(declaredChannels('app.strip_shared')).toEqual([])
  })

  it('let a person choose the email the package sends itself, though notifications never send it', () => {
    expect(notificationChannels('auth.new_device', declaredChannels('auth.new_device'))).toEqual(['app'])
    expect(choosableChannels('auth.new_device', declaredChannels('auth.new_device'))).toEqual(['app', 'email'])
    expect(choosableChannels('auth.passkey_added', declaredChannels('auth.passkey_added'))).toEqual(['app', 'email'])
    expect(choosableChannels('billing.order_paid', declaredChannels('billing.order_paid'))).toEqual(['app'])
  })

  it('send every account kind, and a payment\'s, past the weekly cap and the quiet hours', () => {
    for (const type of Object.keys(NOTIFICATION_KINDS).filter(type => type.startsWith('auth.'))) {
      expect(isTransactional({}, type), type).toBe(true)
    }
    for (const type of ['billing.subscription_past_due', 'billing.order_paid', 'billing.order_refunded']) expect(isTransactional({}, type), type).toBe(true)
    for (const type of ['workspace.member_removed', 'billing.credits_low', 'gift.claimed']) expect(isTransactional({}, type), type).toBe(false)
  })

  it('word every one under labels, as a title and a body', () => {
    const words = LABELS.notifications as unknown as Record<string, unknown>
    for (const type of Object.keys(NOTIFICATION_KINDS)) {
      const [area, name] = type.split('.') as [string, string]
      const entry = (words[area] as Record<string, { title?: string, body?: string }> | undefined)?.[name]
      expect(entry?.title, `${type} title`).toBeTruthy()
      expect(entry?.body, `${type} body`).toBeTruthy()
    }
  })

  it('word every billing kind both ways in every language: about a workspace, and about the person\'s own account', () => {
    const entityKinds = Object.entries(NOTIFICATION_KINDS).filter(([, kind]) => kind.audience === 'entity').map(([type]) => type)
    const languages: Array<[string, unknown]> = [['en', LABELS.notifications], ...TRANSLATED_LOCALES.map(locale => [locale, (LABEL_TRANSLATIONS[locale] as Record<string, unknown>).notifications] as [string, unknown])]
    const yours: string[] = []
    for (const [language, words] of languages) {
      for (const type of entityKinds) {
        const [area, name] = type.split('.') as [string, string]
        const entry = ((words as Record<string, unknown>)[area] as Record<string, Record<string, string>>)[name]!
        for (const part of ['title', 'body'] as const) {
          const own = entry[`${part}Yours`]
          // A part about a workspace has words for the account too, and those name none; a part that names none keeps one set.
          if (entry[part]!.includes('{workspace}')) expect(own, `${language} ${type}.${part}Yours`).toBeTruthy()
          else expect(own, `${language} ${type}.${part}Yours`).toBeUndefined()
          if (own !== undefined) expect(own, `${language} ${type}.${part}Yours`).not.toContain('{workspace}')
          if (language === 'en' && own !== undefined) yours.push(`${type}.${part}`)
        }
      }
    }
    expect(yours).toContain('billing.subscription_created.body')
    expect(yours).toContain('gift.pass_ended.body')
  })

  it('tell a billing kind about the person\'s own account from one about a workspace by the workspace it names', () => {
    expect(notificationEntity('billing.subscription_created', undefined)).toBe('account')
    expect(notificationEntity('billing.subscription_created', 'w1')).toBe('workspace')
    expect(notificationEntity('gift.claimed', null)).toBe('account')
    expect(notificationEntity('workspace.member_removed', 'w1')).toBeNull()
    expect(notificationEntity('app.strip_ready', undefined)).toBeNull()
    expect(notificationWordKeys('body', 'account')).toEqual(['bodyYours', 'body'])
    expect(notificationWordKeys('title', 'workspace')).toEqual(['title'])
    expect(notificationWordKeys('title', null)).toEqual(['title'])
  })

  it('list a billing feature\'s kinds for choosing once the deployment used it, or as the app\'s kinds say', () => {
    const none = { gifts: false, passes: false, trialPasses: false, referrals: false }
    const listed = (features: typeof none | null, kinds: ReadonlySet<string> | null = null) => Object.keys(NOTIFICATION_KINDS).filter(type => listedKind(type, kinds, features))
    expect(listed(none)).not.toEqual(expect.arrayContaining(['billing.trial_pass_started']))
    for (const type of listed(none)) expect(type, type).not.toMatch(/^(?:gift|referral)\./)
    expect(listed(none)).toEqual(expect.arrayContaining(['billing.order_paid', 'workspace.member_removed', 'admin.role_changed']))
    expect(listed({ ...none, gifts: true })).toEqual(expect.arrayContaining(['gift.purchased', 'gift.claimed', 'gift.pass_started', 'gift.refunded']))
    expect(listed({ ...none, gifts: true })).not.toContain('gift.pass_ending')
    expect(listed({ ...none, passes: true })).toEqual(expect.arrayContaining(['gift.pass_ending', 'gift.pass_ended']))
    expect(listed({ ...none, trialPasses: true })).toContain('billing.trial_pass_started')
    expect(listed({ ...none, referrals: true })).toEqual(expect.arrayContaining(['referral.claimed', 'referral.rewarded']))
    expect(listed(null)).toEqual(Object.keys(NOTIFICATION_KINDS))
    // The app's own list is the answer, features or not.
    expect(listed(none, new Set(['auth.passkey_added', 'gift.claimed']))).toEqual(['auth.passkey_added', 'gift.claimed'])
  })
})

describe('an app\'s notify option', () => {
  it('takes types under app. with channels that exist', () => {
    expect(notifyProblem({ 'app.strip_ready': { channels: ['app'] }, 'app.strip.shared': { channels: ['app', 'push'] } })).toBeNull()
    expect(notifyProblem({ strip_ready: { channels: ['app'] } } as never)).toContain('under `app.`')
    expect(notifyProblem({ 'app.Strip': { channels: ['app'] } } as never)).toContain('under `app.`')
    expect(notifyProblem({ 'app.strip_ready': { channels: [] } })).toContain('at least one')
    expect(notifyProblem({ 'app.strip_ready': { channels: ['sms'] } } as never)).toContain('channels are')
    expect(notifyProblem({ 'app.strip_ready': { channels: ['email'], transactional: true } })).toBeNull()
    expect(notifyProblem({ 'app.strip_ready': { channels: ['email'], transactional: 'yes' } } as never)).toContain('true or false')
  })

  it('is transactional only where it says so', () => {
    const notify = { 'app.strip_printed': { channels: ['email'], transactional: true }, 'app.strip_shared': { channels: ['email'] } } as const
    expect(isTransactional(notify, 'app.strip_printed')).toBe(true)
    expect(isTransactional(notify, 'app.strip_shared')).toBe(false)
    expect(isTransactional(notify, 'app.strip_unknown')).toBe(false)
  })

  it('does not take words a package kind has', () => {
    expect(notifyProblem({ 'app.workspace.member_removed': { channels: ['app'] } })).toContain('would replace a package kind')
    expect(notificationLabelKey('app.strip_shared')).toBe('strip_shared')
    expect(notificationLabelKey('app.strip.shared')).toBe('strip.shared')
    expect(notificationLabelKey('billing.order_paid')).toBe('billing.order_paid')
  })

  it('becomes a plan for an event about an account, with the link read from the event', () => {
    const notify = { 'app.strip_ready': { channels: ['app', 'email'], link: (event: { targetId?: string }) => `/strips/${event.targetId}` } } as const
    expect(planNotification(notify, { type: 'app.strip_ready', subjectId: 'u1', targetId: 's1' })).toEqual({ channels: ['app', 'email'], link: '/strips/s1' })
    expect(planNotification(notify, { type: 'app.strip_ready', targetId: 's1' })).toBeNull()
    expect(planNotification(notify, { type: 'app.strip_archived', subjectId: 'u1' })).toBeNull()
    expect(planNotification({ 'app.x': { channels: ['email'] } }, { type: 'app.x', subjectId: 'u1' })).toEqual({ channels: ['email'] })
  })

  it('keeps a link only when it is a path of the app, and survives one that throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const plan = (link: () => string) => planNotification({ 'app.x': { channels: ['app'], link } }, { type: 'app.x', subjectId: 'u1' })
    expect(plan(() => 'https://example.com/x')).toEqual({ channels: ['app'] })
    expect(plan(() => '//example.com/x')).toEqual({ channels: ['app'] })
    expect(plan(() => '/ok?next=/a#b')).toEqual({ channels: ['app'], link: '/ok?next=/a#b' })
    expect(plan(() => {
      throw new Error('boom')
    })).toEqual({ channels: ['app'] })
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
    expect(['/a', '/a/b?c=d'].every(isAppPath)).toBe(true)
    expect(['a', 'javascript:alert(1)', '/\\evil', `/${'x'.repeat(600)}`].some(isAppPath)).toBe(false)
  })
})
