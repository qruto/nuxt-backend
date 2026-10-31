import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BACKEND_EVENTS, deriveDeliveries, EVENT_LIST_MAX, eventProblem, eventReaders, eventRole, IN_APP_ONLY_AREAS, isBackendEventType } from '../../src/convex/events'
import { findLabel, LABELS } from '../../src/convex/labels'

// The event catalog (src/convex/events.ts), held to its rules: every kind
// named `<area>.<what happened>`, with fields a row may keep (no address, no
// name), a write point that records it, a sentence the activity list reads
// it by, and the channel matrix applied to what it derives.

const root = fileURLToPath(new URL('../..', import.meta.url))
const KINDS = Object.entries(BACKEND_EVENTS)

/** The kinds no route of the package records yet, each with why. */
const RESERVED: Record<string, string> = {
  'referral.claimed': 'the referral program (REF) brings the claim step that records it, and takes this entry out',
  'referral.rewarded': 'the referral program (REF) brings the reward after a hold that records it, and takes this entry out',
}

/**
 * The package's write points: the auth layer's, the role bootstrap's, the
 * flags' and the launch access's admin writes and used tickets, billing's (its webhook, checkout, the plan's
 * lifecycle, refunds and gifts), a credit balance's crossing, a bounce, a
 * lifted suppression, a new device, a replayed webhook, an account's
 * export and erasure, and the AI spend limit's pause.
 */
const WRITE_POINTS = [
  'src/convex/client/audit.ts',
  'src/convex/client/devices.ts',
  'src/convex/integrations/webhooks.ts',
  'src/convex/integrations/authorization.ts',
  'src/convex/integrations/flags.ts',
  'src/convex/integrations/launch.ts',
  'src/convex/client/launch-gate.ts',
  'src/convex/integrations/waitlist.ts',
  'src/convex/integrations/reports.ts',
  'src/convex/integrations/billing/events.ts',
  'src/convex/integrations/billing/checkout.ts',
  'src/convex/integrations/billing/subscriptions.ts',
  'src/convex/integrations/billing/history.ts',
  'src/convex/integrations/billing/gifts.ts',
  'src/convex/integrations/billing/passes.ts',
  'src/convex/integrations/billing/lifecycle.ts',
  'src/convex/integrations/ai/metering.ts',
  'src/convex/integrations/ai/jobs.ts',
  'src/convex/integrations/email.ts',
  'src/convex/integrations/email-suppressions.ts',
  'src/convex/integrations/announcements.ts',
  'src/convex/integrations/account.ts',
  'src/convex/components/backend/account.ts',
  'src/convex/components/backend/funnel.ts',
  'src/convex/components/backend/costs.ts',
]

/** A source without its comments, so a kind named only in prose records nothing. */
function codeOf(path: string): string {
  return readFileSync(join(root, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}
const writePoints = WRITE_POINTS.map(path => ({ path, code: codeOf(path) }))

describe('the event catalog', () => {
  it.each(KINDS)('%s is named <area>.<what happened>, and its fields are flat and personal-data free', (type, kind) => {
    expect(type).toMatch(/^(?:auth|workspace|admin|flag|experiment|announcement|access|waitlist|report|consent|agent|billing|gift|referral|email|account|job|webhook|ai)\.[a-z]+(?:_[a-z]+)*$/)
    expect(kind.description.length).toBeGreaterThan(10)
    for (const [field, fieldType] of Object.entries(kind.data)) {
      expect(['string', 'string?', 'string[]', 'string[]?', 'boolean', 'boolean?', 'number', 'number?']).toContain(fieldType)
      expect(field).not.toMatch(/email|address|name|token|code|secret|ip|agent/i)
    }
  })

  it.each(KINDS.filter(([type]) => !RESERVED[type]))('%s is recorded by a write point of the package', (type) => {
    // An event the code builds: the kind as the value of its `type`, or as
    // a webhook's mapped kind, not a mention.
    const site = new RegExp(`(?:\\btype: [^,}\\n]*|: )'${type.replace('.', '\\.')}'`)
    expect(writePoints.filter(({ code }) => site.test(code)).map(({ path }) => path)).not.toEqual([])
  })

  it('keeps reserved kinds to kinds of the catalog', () => {
    for (const type of Object.keys(RESERVED)) expect(isBackendEventType(type), type).toBe(true)
  })

  it.each(KINDS)('%s reads as a sentence in the activity list', (type) => {
    const sentence = findLabel(LABELS, `audit.events.${type}`)
    expect(sentence, `audit.events.${type}`).toBeDefined()
    expect(sentence).toMatch(/^\{actor\} /)
    if ('role' in BACKEND_EVENTS[type as keyof typeof BACKEND_EVENTS].data) expect(sentence).toContain('{role}')
  })

  it('says who reads each kind: the account it is about and the administrators, and a workspace\'s managers for its own', () => {
    for (const [type, kind] of KINDS) {
      expect(eventReaders(type)).toEqual(kind.scope === 'workspace' ? ['subject', 'workspace', 'admin'] : ['subject', 'admin'])
      // A billing entity's kind reads like a workspace's when it names one, like an account's when it is about one.
      if (kind.scope === 'entity') expect(eventReaders(type, 'w1')).toEqual(['subject', 'workspace', 'admin'])
    }
    expect(eventReaders('app.project_archived')).toEqual(['subject', 'admin'])
    expect(eventReaders('app.project_archived', 'w1')).toEqual(['subject', 'workspace', 'admin'])
  })
})

describe('the channel matrix', () => {
  it('derives what a kind declares, for an account to tell', () => {
    expect(deriveDeliveries('auth.passkey_added', 'u1')).toEqual({ inApp: true, email: true })
    expect(deriveDeliveries('workspace.member_removed', 'u1')).toEqual({ inApp: true, email: false })
    expect(deriveDeliveries('auth.signed_in', 'u1')).toEqual({ inApp: false, email: false })
    expect(deriveDeliveries('auth.passkey_added', undefined)).toEqual({ inApp: false, email: false })
    expect(deriveDeliveries('app.project_archived', 'u1')).toEqual({ inApp: false, email: false })
  })

  it.each(IN_APP_ONLY_AREAS)('keeps %s kinds in the app, whatever they declare', (area) => {
    const kinds = { [`${area}.something_happened`]: { channels: ['in-app', 'email'] as const } }
    expect(deriveDeliveries(`${area}.something_happened`, 'u1', kinds)).toEqual({ inApp: true, email: false })
  })

  it('keeps billing in-app only, as the billing provider sends its own customer email', () => {
    expect(IN_APP_ONLY_AREAS).toContain('billing')
    for (const [type, kind] of KINDS.filter(([type]) => /^(?:billing|gift|referral|email)\./.test(type))) {
      expect(deriveDeliveries(type, 'u1').email, type).toBe(false)
      expect((kind.channels as readonly string[]).includes('email'), type).toBe(false)
    }
  })
})

describe('a role as an event records it', () => {
  it.each([
    ['admin', 'admin'],
    ['member, admin', 'admin,member'],
    [['member', 'admin', 'admin'], 'admin,member'],
    ['', null],
    [[], null],
    [undefined, null],
  ])('%j reads as %j', (role, recorded) => {
    expect(eventRole(role)).toBe(recorded)
  })
})

describe('an event before it is written', () => {
  it.each([
    [{ type: 'auth.signed_in', data: { method: 'passkey' } }, null],
    [{ type: 'auth.signed_in' }, null],
    [{ type: 'workspace.member_invited', entityId: 'w1', data: { role: 'member' } }, null],
    [{ type: 'app.project_archived', data: { count: 2, done: true, tags: ['a'] } }, null],
    [{ type: 'app.projects.archived' }, null],
    [{ type: 'project.archived' }, 'type'],
    [{ type: 'app.' }, 'type'],
    [{ type: 'app.Project' }, 'type'],
    [{ type: 'auth.signed_in', data: { method: 1 } }, 'data.method'],
    [{ type: 'auth.signed_in', data: { email: 'a@b.c' } }, 'data.email'],
    [{ type: 'workspace.created' }, 'entityId'],
    // A billing entity's kind is about a workspace or an account billed on its own.
    [{ type: 'billing.order_paid', entityId: 'w1', data: { amount: 900, currency: 'usd' } }, null],
    [{ type: 'billing.order_paid', subjectId: 'u1', data: { amount: 900, currency: 'usd' } }, null],
    [{ type: 'billing.order_paid', entityId: 'w1', data: { amount: '900', currency: 'usd' } }, 'data.amount'],
    [{ type: 'account.erasure_failed', data: { source: 'billing', attempts: 5 } }, null],
    [{ type: 'auth.signed_out', entityId: 'w1' }, 'entityId'],
    [{ type: 'app.big', data: Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`f${index}`, index])) }, 'data'],
    [{ type: 'app.long', data: { text: 'x'.repeat(129) } }, 'data.text'],
    [{ type: 'app.tags', data: { tags: Array.from({ length: EVENT_LIST_MAX }, (_, index) => `t${index}`) } }, null],
    [{ type: 'app.tags', data: { tags: Array.from({ length: EVENT_LIST_MAX + 1 }, (_, index) => `t${index}`) } }, 'data.tags'],
    [{ type: 'app.ids', subjectId: '' }, 'subjectId'],
    [{ type: `app.${'x'.repeat(130)}` }, 'type'],
  ])('%j is refused on %s', (event, field) => {
    expect(eventProblem(event as never)?.field ?? null).toBe(field)
  })
})
