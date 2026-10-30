import { Polar } from '@polar-sh/sdk'
import { organizationsListOrganizations } from '@polar-sh/sdk/funcs/organizationsListOrganizations.js'
import { organizationsUpdate } from '@polar-sh/sdk/funcs/organizationsUpdate.js'
import { webhooksListWebhookEndpoints } from '@polar-sh/sdk/funcs/webhooksListWebhookEndpoints.js'
import { webhooksUpdateWebhookEndpoint } from '@polar-sh/sdk/funcs/webhooksUpdateWebhookEndpoint.js'
import { BILLING_WEBHOOK_PROVISION_EVENTS, type BillingCatalog } from '../../convex/catalog'
import { billingEnvironment, parseBackendEnvironment } from '../../convex/environment'
import { providerClientOptions } from '../../convex/integrations/billing/provider-client'
import { finding, type FindingId, type PreflightFinding } from '../../findings'
import { listAllPages, type Environment } from './provider'

// `doctor --fix`'s half at the billing provider: the organization settings
// the warn-only billing findings recommend, and the webhook endpoint of the
// deployment. Each change is named before it is made, and made only once a
// person at a terminal confirms it (or `--yes` says so for a script). It
// turns settings on, never off, and never touches seat settings.

/** The customer emails the inbox leans on, besides the trial reminder: each one turned back on, never off. */
const CUSTOMER_EMAILS = [
  'orderConfirmation',
  'subscriptionConfirmation',
  'subscriptionCycled',
  'subscriptionPastDue',
  'subscriptionCancellation',
  'subscriptionRevoked',
  'subscriptionRenewalReminder',
] as const

/** The trial reminder: the provider's email three days before a trial turns into a charge. */
const TRIAL_REMINDER = 'subscriptionTrialConversionReminder'

/** One change `doctor --fix` would make at the billing provider. */
export interface ProviderChange {
  /** What it is, for `--json` and the tests. */
  key: 'trial-abuse' | 'trial-reminders' | 'customer-emails' | 'webhook-enabled' | 'webhook-events'
  /** The finding that recommends it. */
  finding: FindingId
  /** The change in words, for the confirmation. */
  description: string
}

/** The organization as `doctor --fix` reads it: its id and the full settings objects an update must send back. */
export interface ProviderOrganization {
  id: string
  subscriptionSettings: Record<string, unknown> & { preventTrialAbuse: boolean }
  customerEmailSettings: Record<string, unknown>
}

/** The deployment's webhook endpoint at the provider. */
export interface ProviderEndpoint {
  id: string
  url: string
  enabled: boolean
  events: string[]
}

/** The plans that offer a trial of their own (a plan pass's trial is the pass). */
function trialPlans(catalog: BillingCatalog): string[] {
  return Object.entries(catalog.plans ?? {}).filter(([, plan]) => !plan.retired && plan.trial && !plan.trial.pass).map(([key]) => key)
}

/** A camel-cased email setting in words: `subscriptionPastDue` → `subscription past due`. */
function words(name: string): string {
  return name.replace(/[A-Z]/g, letter => ` ${letter.toLowerCase()}`)
}

/**
 * The settings changes the findings recommend: trial abuse prevention and
 * the trial reminder when a plan has a trial, and every customer email the
 * inbox leans on back on. Nothing is ever turned off.
 */
export function planSettingChanges(catalog: BillingCatalog, organization: ProviderOrganization): ProviderChange[] {
  const changes: ProviderChange[] = []
  const trials = trialPlans(catalog).length > 0
  if (trials && !organization.subscriptionSettings.preventTrialAbuse) {
    changes.push({ key: 'trial-abuse', finding: 'billing-trial-abuse', description: 'Turn on trial abuse prevention, so one customer cannot start the same trial again.' })
  }
  if (trials && organization.customerEmailSettings[TRIAL_REMINDER] === false) {
    changes.push({ key: 'trial-reminders', finding: 'billing-customer-emails', description: 'Turn on the trial reminder, so a customer hears before a trial turns into a charge.' })
  }
  const off = CUSTOMER_EMAILS.filter(name => organization.customerEmailSettings[name] === false)
  if (off.length > 0) {
    changes.push({ key: 'customer-emails', finding: 'billing-customer-emails', description: `Turn the provider's ${off.map(words).join(', ')} customer email${off.length === 1 ? '' : 's'} back on.` })
  }
  return changes
}

/** The changes the deployment's endpoint needs: back on (once its route answered the probe), and every event the package handles. */
export function planEndpointChanges(endpoint: ProviderEndpoint, { routeHealthy }: { routeHealthy: boolean }): ProviderChange[] {
  const changes: ProviderChange[] = []
  if (!endpoint.enabled && routeHealthy) {
    changes.push({ key: 'webhook-enabled', finding: 'billing-webhook-enabled', description: `Turn the webhook endpoint ${endpoint.url} back on: its route answers the probe now.` })
  }
  const missing = missingEvents(endpoint)
  if (missing.length > 0) {
    changes.push({ key: 'webhook-events', finding: 'billing-webhook-events', description: `Subscribe the webhook endpoint to ${missing.join(', ')}.` })
  }
  return changes
}

/** The events the package handles that the endpoint is not subscribed to. */
export function missingEvents(endpoint: Pick<ProviderEndpoint, 'events'>): string[] {
  const events = new Set(endpoint.events)
  return BILLING_WEBHOOK_PROVISION_EVENTS.filter(event => !events.has(event))
}

/** What `doctor` reports of the deployment's endpoint at the billing provider. */
export function billingEndpointFindings(endpoint: ProviderEndpoint | null, url: string): PreflightFinding[] {
  if (!endpoint) return []
  const missing = missingEvents(endpoint)
  return [
    endpoint.enabled
      ? finding('billing-webhook-enabled', 'pass', `The billing provider delivers to ${url}.`)
      : finding(
          'billing-webhook-enabled',
          'warn',
          `The billing provider turned the webhook endpoint ${url} off after its deliveries kept failing: subscriptions, orders and refunds reach the deployment no more.`,
          'Run `npx nuxt-backend doctor --fix`: once the route answers its probe, it turns the endpoint back on (after you confirm), and you can replay what was held back.',
        ),
    missing.length === 0
      ? finding('billing-webhook-events', 'pass', 'The billing webhook endpoint is subscribed to every event the package handles.')
      : finding(
          'billing-webhook-events',
          'warn',
          `The billing webhook endpoint is not subscribed to ${missing.join(', ')}: the deployment never hears of ${missing.length === 1 ? 'it' : 'them'}.`,
          'Run `npx nuxt-backend doctor --fix`: it subscribes the endpoint to them, after you confirm.',
        ),
  ]
}

/** A client for the provider's environment. */
export function providerClient(accessToken: string, environment: Environment): Polar {
  return new Polar(providerClientOptions({ accessToken, environment }))
}

/** The organization the token belongs to, with its settings; `null` when the provider cannot be read. */
export async function readProviderOrganization(client: Polar): Promise<ProviderOrganization | null> {
  try {
    const listed = await organizationsListOrganizations(client, { limit: 1 })
    const organization = listed.ok ? listed.value?.result.items[0] : undefined
    if (!organization) return null
    return {
      id: organization.id,
      subscriptionSettings: { ...organization.subscriptionSettings },
      customerEmailSettings: { ...organization.customerEmailSettings as unknown as Record<string, unknown> },
    }
  }
  catch {
    return null
  }
}

/** The endpoint at `url`; `null` when there is none, or the provider cannot be read. */
export async function readProviderEndpoint(client: Polar, url: string): Promise<ProviderEndpoint | null> {
  try {
    const endpoints = await listAllPages(page => webhooksListWebhookEndpoints(client, { limit: 100, page }))
    const endpoint = endpoints.find(entry => entry.url.replace(/\/+$/, '') === url.replace(/\/+$/, ''))
    if (!endpoint) return null
    return { id: endpoint.id, url: endpoint.url, enabled: endpoint.enabled !== false, events: [...endpoint.events ?? []] }
  }
  catch {
    return null
  }
}

/**
 * Make the confirmed changes: one organization update for the settings
 * (sending each settings object whole, as the provider asks, with only the
 * recommended switches turned on), one endpoint update for the endpoint.
 */
export async function applyProviderChanges(client: Polar, { organization, endpoint }: { organization: ProviderOrganization | null, endpoint: ProviderEndpoint | null }, changes: readonly ProviderChange[]): Promise<void> {
  const keys = new Set(changes.map(change => change.key))
  const settings = organization ? organizationUpdate(organization, keys) : null
  if (organization && settings) {
    const updated = await organizationsUpdate(client, { id: organization.id, organizationUpdate: settings as never })
    if (!updated.ok) throw updated.error
  }
  const hook = endpoint ? endpointUpdate(endpoint, keys) : null
  if (endpoint && hook) {
    const updated = await webhooksUpdateWebhookEndpoint(client, { id: endpoint.id, webhookEndpointUpdate: hook as never })
    if (!updated.ok) throw updated.error
  }
}

/** The organization update the confirmed changes make: each settings object whole, with only the recommended switches on; `null` for none. */
function organizationUpdate(organization: ProviderOrganization, keys: ReadonlySet<ProviderChange['key']>): Record<string, unknown> | null {
  const update: Record<string, unknown> = {}
  if (keys.has('trial-abuse')) update.subscriptionSettings = { ...organization.subscriptionSettings, preventTrialAbuse: true }
  const emails = [...keys.has('trial-reminders') ? [TRIAL_REMINDER] : [], ...keys.has('customer-emails') ? CUSTOMER_EMAILS : []]
  if (emails.length > 0) update.customerEmailSettings = { ...organization.customerEmailSettings, ...Object.fromEntries(emails.map(name => [name, true])) }
  return Object.keys(update).length > 0 ? update : null
}

/** The endpoint update the confirmed changes make: back on, every event the package handles; `null` for none. */
function endpointUpdate(endpoint: ProviderEndpoint, keys: ReadonlySet<ProviderChange['key']>): Record<string, unknown> | null {
  const update: Record<string, unknown> = {}
  if (keys.has('webhook-enabled')) update.enabled = true
  if (keys.has('webhook-events')) update.events = [...new Set([...endpoint.events, ...BILLING_WEBHOOK_PROVISION_EVENTS])]
  return Object.keys(update).length > 0 ? update : null
}

/**
 * The token and environment `doctor` reaches the billing provider with:
 * the local env for the dev deployment, the process env alone under
 * `--prod` (a CI secret, `vercel env pull`), since `.env.local` holds dev's.
 * Production bills live unless that env names another kind. `null` without
 * a token.
 */
export function billingProviderTarget(env: Readonly<Record<string, string | undefined>>, prod: boolean): { accessToken: string, environment: Environment } | null {
  const source = prod ? process.env : env
  const accessToken = source.BILLING_ACCESS_TOKEN
  if (!accessToken) return null
  const kind = parseBackendEnvironment(source.BACKEND_ENVIRONMENT) ?? (prod ? 'production' : undefined)
  return { accessToken, environment: billingEnvironment(kind) }
}
