import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyProviderChanges, billingEndpointFindings, planEndpointChanges, planSettingChanges, providerClient, type ProviderOrganization } from '../../src/cli/billing/settings'
import { changeConfirmation, fixProviderSettings } from '../../src/cli/provider-fix'
import { BILLING_WEBHOOK_PROVISION_EVENTS, type BillingCatalog } from '../../src/convex/catalog'
import type { EmailSyncReport } from '../../src/convex/integrations/email-sync'

// `doctor --fix` at the providers: what it recommends turning on (never
// off, never seat settings), that an endpoint comes back on only once its
// route answers the probe, and that nothing is applied unconfirmed.

afterEach(() => {
  vi.unstubAllGlobals()
})

const TRIAL_CATALOG = { plans: { pro: { name: 'Pro', price: { month: 900 }, trial: { days: 14 } } } } as unknown as BillingCatalog
const NO_TRIAL = { plans: { pro: { name: 'Pro', price: { month: 900 } } } } as unknown as BillingCatalog

const EMAILS_ON = {
  orderConfirmation: true,
  subscriptionCancellation: true,
  subscriptionConfirmation: true,
  subscriptionCycled: true,
  subscriptionCycledAfterTrial: true,
  subscriptionPastDue: true,
  subscriptionPaused: true,
  subscriptionResumed: true,
  subscriptionRenewalReminder: true,
  subscriptionRevoked: true,
  subscriptionTrialConversionReminder: true,
  subscriptionUncanceled: true,
  subscriptionUpdated: true,
}

function organization(overrides: { preventTrialAbuse?: boolean, emails?: Record<string, boolean> } = {}): ProviderOrganization {
  return {
    id: 'org_1',
    subscriptionSettings: { allowMultipleSubscriptions: false, prorationBehavior: 'invoice', benefitRevocationGracePeriod: 0, preventTrialAbuse: overrides.preventTrialAbuse ?? true, allowCustomerUpdates: true },
    customerEmailSettings: { ...EMAILS_ON, ...overrides.emails },
  }
}

describe('planSettingChanges', () => {
  it('turns on trial abuse prevention and the trial reminder only when a plan has a trial', () => {
    const off = organization({ preventTrialAbuse: false, emails: { subscriptionTrialConversionReminder: false } })
    expect(planSettingChanges(TRIAL_CATALOG, off).map(change => change.key)).toEqual(['trial-abuse', 'trial-reminders'])
    expect(planSettingChanges(NO_TRIAL, off)).toEqual([])
  })

  it('turns the relied-on customer emails back on, and never asks to turn one off', () => {
    const changes = planSettingChanges(NO_TRIAL, organization({ emails: { subscriptionPastDue: false, subscriptionPaused: false } }))
    expect(changes).toEqual([{ key: 'customer-emails', finding: 'billing-customer-emails', description: 'Turn the provider\'s subscription past due customer email back on.' }])
    expect(planSettingChanges(TRIAL_CATALOG, organization())).toEqual([])
  })
})

describe('the billing webhook endpoint', () => {
  const endpoint = { id: 'we_1', url: 'https://happy-otter-123.convex.site/billing/events', enabled: false, events: ['order.paid'] }

  it('comes back on only once its route answers the probe, and gets every event the package handles', () => {
    expect(planEndpointChanges(endpoint, { routeHealthy: false }).map(change => change.key)).toEqual(['webhook-events'])
    expect(planEndpointChanges(endpoint, { routeHealthy: true }).map(change => change.key)).toEqual(['webhook-enabled', 'webhook-events'])
    expect(planEndpointChanges({ ...endpoint, enabled: true, events: [...BILLING_WEBHOOK_PROVISION_EVENTS] }, { routeHealthy: true })).toEqual([])
  })

  it('reports a disabled endpoint and the events it misses', () => {
    const findings = billingEndpointFindings(endpoint, endpoint.url)
    expect(findings.map(entry => [entry.id, entry.status])).toEqual([['billing-webhook-enabled', 'warn'], ['billing-webhook-events', 'warn']])
    expect(billingEndpointFindings(null, endpoint.url)).toEqual([])
  })
})

describe('applyProviderChanges', () => {
  it('sends the settings objects whole, with only the recommended switches turned on', async () => {
    const sent: Array<{ method: string, url: string, body: unknown }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: Request | string, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init)
      sent.push({ method: request.method, url: request.url, body: JSON.parse(await request.text() || 'null') })
      return Response.json({ detail: 'stub' }, { status: 500 })
    }))
    const before = organization({ preventTrialAbuse: false, emails: { subscriptionPastDue: false, subscriptionPaused: false } })
    await expect(applyProviderChanges(providerClient('polar_oat_test', 'sandbox'), { organization: before, endpoint: null }, planSettingChanges(TRIAL_CATALOG, before))).rejects.toBeTruthy()
    expect(sent[0]).toMatchObject({ method: 'PATCH', url: 'https://sandbox-api.polar.sh/v1/organizations/org_1' })
    const body = sent[0]!.body as { subscription_settings: Record<string, unknown>, customer_email_settings: Record<string, unknown> }
    expect(body.subscription_settings).toMatchObject({ prevent_trial_abuse: true, allow_multiple_subscriptions: false, proration_behavior: 'invoice' })
    expect(body.customer_email_settings).toMatchObject({ subscription_past_due: true, subscription_paused: false })
  })
})

describe('fixProviderSettings', () => {
  const disabled = { key: 'full', webhook: { url: 'https://happy-otter-123.convex.site/email/events', action: 'exists', missingEvents: [], enabled: false } } as unknown as EmailSyncReport

  it('turns the email webhook back on once its route answers the probe and the change is confirmed', async () => {
    const asked: unknown[] = []
    const emailSync = vi.fn(async (_root: string, options: unknown) => {
      asked.push(options)
      return disabled
    })
    const lines: string[] = []
    const report = await fixProviderSettings('/nowhere', { prod: false, confirm: async () => true, print: line => lines.push(line), billing: false }, { probe: async () => ({ state: 'mounted' }), emailSync })
    expect(asked).toEqual([{ prod: false, dryRun: true }, { prod: false, enableWebhook: true }])
    expect(report).toEqual({ applied: ['email-webhook-enabled'], skipped: [], reenabled: ['email'] })
    expect(lines.join('\n')).toContain('replay')
  })

  it('leaves the webhook off while its route fails the probe, or when nobody confirms', async () => {
    const emailSync = vi.fn(async () => disabled)
    const failing = await fixProviderSettings('/nowhere', { prod: false, confirm: async () => true, print: () => {}, billing: false }, { probe: async () => ({ state: 'missing', status: 404 }), emailSync })
    expect(failing.applied).toEqual([])
    const unconfirmed = await fixProviderSettings('/nowhere', { prod: false, confirm: async () => false, print: () => {}, billing: false }, { probe: async () => ({ state: 'mounted' }), emailSync })
    expect(unconfirmed).toEqual({ applied: [], skipped: ['email-webhook-enabled'], reenabled: [] })
    expect(emailSync).toHaveBeenCalledTimes(2)
  })
})

describe('changeConfirmation', () => {
  it('applies with --yes, asks at a terminal, and only lists the change elsewhere', async () => {
    const change = { description: 'Turn on trial abuse prevention.' }
    const ask = vi.fn(async () => 'y')
    const lines: string[] = []
    expect(await changeConfirmation({ yes: true, interactive: false, ask, print: () => {} })(change)).toBe(true)
    expect(await changeConfirmation({ yes: false, interactive: true, ask, print: () => {} })(change)).toBe(true)
    expect(await changeConfirmation({ yes: false, interactive: false, ask, print: line => lines.push(line) })(change)).toBe(false)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(lines[0]).toContain('--yes')
  })
})
