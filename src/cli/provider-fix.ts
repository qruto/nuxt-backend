import { readEnvFiles } from '../env-push'
import { probeWebhookRoute } from '../doctor'
import { loadCatalog } from './billing/doctor'
import { readSyncDeployment, planWebhook } from './billing/deployment'
import {
  applyProviderChanges,
  billingProviderTarget,
  planEndpointChanges,
  planSettingChanges,
  providerClient,
  readProviderEndpoint,
  readProviderOrganization,
  type ProviderChange,
} from './billing/settings'
import { runEmailSync } from './email'

/**
 * `doctor --fix`'s provider half: the billing settings the warn-only
 * findings recommend, and the webhook endpoints of both providers. It names
 * every change, makes one only once it is confirmed, and re-enables an
 * endpoint only after its route on the deployment answers the probe, so an
 * endpoint is never turned back on into the same failure.
 */

/** How a change is confirmed: a person at a terminal, `--yes`, or nobody (listed and skipped). */
export type ConfirmChange = (change: { description: string }) => Promise<boolean>

/** What the provider step did, for `--json` and the tests. */
export interface ProviderFixReport {
  applied: string[]
  skipped: string[]
  /** An endpoint turned back on: deliveries the provider held back may be replayed. */
  reenabled: Array<'billing' | 'email'>
}

/** Where deliveries held back while an endpoint was off are replayed from. */
const REPLAY_HINT = 'Replay what the provider held back while it was off: the admin console\'s Webhooks tab, https://nuxt-backend.dev/docs/ship/operate/replay.'

export interface ProviderFixDeps {
  probe?: typeof probeWebhookRoute
  emailSync?: typeof runEmailSync
}

/** What the billing provider holds, read with the token visible here: `null` without a catalog or a token. */
async function readBilling(rootDir: string, prod: boolean) {
  const catalog = (await loadCatalog(rootDir).catch(() => null))?.catalog
  const env = { ...readEnvFiles(rootDir), ...process.env } as Record<string, string | undefined>
  const target = billingProviderTarget(env, prod)
  if (!catalog || !target) return null
  const client = providerClient(target.accessToken, target.environment)
  const plan = planWebhook(undefined, { prod, deployment: await readSyncDeployment(rootDir, prod), env: prod ? process.env : env })
  const [organization, endpoint] = await Promise.all([readProviderOrganization(client), 'url' in plan ? readProviderEndpoint(client, plan.url) : null])
  return { catalog, client, organization, endpoint }
}

/** The changes a person confirmed; the rest are recorded as skipped. */
async function confirmed(changes: readonly ProviderChange[], confirm: ConfirmChange, report: ProviderFixReport): Promise<ProviderChange[]> {
  const kept: ProviderChange[] = []
  for (const change of changes) {
    if (await confirm(change)) kept.push(change)
    else report.skipped.push(change.key)
  }
  return kept
}

/** The billing half: the organization's settings and the deployment's endpoint, each change confirmed. */
async function fixBilling(rootDir: string, { prod, confirm, print, report, probe }: { prod: boolean, confirm: ConfirmChange, print: (line: string) => void, report: ProviderFixReport, probe: typeof probeWebhookRoute }): Promise<void> {
  const read = await readBilling(rootDir, prod)
  if (!read) return
  const { catalog, client, organization, endpoint } = read
  const off = endpoint !== null && !endpoint.enabled
  const routeHealthy = !off || (await probe(endpoint.url)).state === 'mounted'
  if (!routeHealthy) {
    print(`[nuxt-backend] doctor --fix: the billing webhook endpoint stays off: its route does not answer the probe yet. Fix the route (doctor's billing-webhook-route), then run doctor --fix again.`)
  }
  const changes: ProviderChange[] = [
    ...organization ? planSettingChanges(catalog, organization) : [],
    ...endpoint ? planEndpointChanges(endpoint, { routeHealthy }) : [],
  ]
  const accepted = await confirmed(changes, confirm, report)
  if (accepted.length === 0) return
  await applyProviderChanges(client, { organization, endpoint }, accepted)
  for (const change of accepted) {
    report.applied.push(change.key)
    print(`[nuxt-backend] doctor --fix: billing provider: ${change.description}`)
  }
  if (accepted.some(change => change.key === 'webhook-enabled')) {
    report.reenabled.push('billing')
    print(`[nuxt-backend] ${REPLAY_HINT}`)
  }
}

/** The email half: the webhook back on, once its route answers the probe. Its events are `email sync`'s, which ran before. */
async function fixEmail(rootDir: string, { prod, confirm, print, report, probe, emailSync }: { prod: boolean, confirm: ConfirmChange, print: (line: string) => void, report: ProviderFixReport, probe: typeof probeWebhookRoute, emailSync: typeof runEmailSync }): Promise<void> {
  const read = await emailSync(rootDir, { prod, dryRun: true }).catch(() => null)
  const url = read?.webhook.url
  if (!read || !url || read.webhook.enabled !== false) return
  if ((await probe(url)).state !== 'mounted') {
    print('[nuxt-backend] doctor --fix: the email webhook stays off: its route does not answer the probe yet. Fix the route (doctor\'s email-webhook-route), then run doctor --fix again.')
    return
  }
  const change = { description: `Turn the email webhook ${url} back on: its route answers the probe now.` }
  if (!await confirm(change)) {
    report.skipped.push('email-webhook-enabled')
    return
  }
  await emailSync(rootDir, { prod, enableWebhook: true })
  report.applied.push('email-webhook-enabled')
  report.reenabled.push('email')
  print(`[nuxt-backend] doctor --fix: email provider: ${change.description}`)
  print(`[nuxt-backend] ${REPLAY_HINT}`)
}

/**
 * Apply, after confirmation, what the provider findings recommend. A
 * provider that cannot be read is left alone; a write the provider refuses
 * is printed and the rest goes on.
 */
export async function fixProviderSettings(rootDir: string, { prod, confirm, print, billing = true, email = true }: { prod: boolean, confirm: ConfirmChange, print: (line: string) => void, billing?: boolean, email?: boolean }, deps: ProviderFixDeps = {}): Promise<ProviderFixReport> {
  const report: ProviderFixReport = { applied: [], skipped: [], reenabled: [] }
  const probe = deps.probe ?? probeWebhookRoute
  const emailSync = deps.emailSync ?? runEmailSync
  const steps: Array<[string, () => Promise<void>]> = [
    ...billing ? [['billing', () => fixBilling(rootDir, { prod, confirm, print, report, probe })] as [string, () => Promise<void>]] : [],
    ...email ? [['email', () => fixEmail(rootDir, { prod, confirm, print, report, probe, emailSync })] as [string, () => Promise<void>]] : [],
  ]
  for (const [provider, step] of steps) {
    try {
      await step()
    }
    catch (error) {
      print(`[nuxt-backend] doctor --fix: the ${provider} provider refused a change: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (report.skipped.length > 0) print(`[nuxt-backend] doctor --fix: left as they are (not confirmed): ${report.skipped.join(', ')}.`)
  return report
}

/**
 * The confirmation `doctor --fix` asks with: every change with `yes`; at a
 * terminal, a question per change; otherwise none, and the change is
 * listed instead (a script passes `--yes`).
 */
export function changeConfirmation({ yes, interactive, ask, print }: { yes: boolean, interactive: boolean, ask: (question: string) => Promise<string>, print: (line: string) => void }): ConfirmChange {
  return async ({ description }) => {
    if (yes) return true
    if (!interactive) {
      print(`[nuxt-backend] doctor --fix: would ${description.charAt(0).toLowerCase()}${description.slice(1)} Run at a terminal to confirm it, or pass --yes.`)
      return false
    }
    return /^y(?:es)?$/i.test((await ask(`${description} Apply? [y/N] `)).trim())
  }
}
