import { billingLaunch, type BillingLaunch } from '../../convex/billing-launch'
import { finding, type FindingId, type PreflightFinding } from '../../findings'
import { loadCatalog } from './doctor'
import { loadGenerated } from './generated'

// Under `doctor --prod`, whether billing sells on production yet, by the
// rule the deployment itself follows (src/convex/billing-launch.ts): a
// production that bills in the provider's production environment sells
// nothing until it holds a token and the catalog has products there. Until
// then billing is not launched: a state of the app, not a broken setup, so
// the findings that only say the launch has not happened stay warnings.

/**
 * What a production deployment whose billing is not launched is expected to
 * lack: the token, the webhook `billing sync --env production` makes with
 * it, and the production catalog. They warn, never fail, until it launches.
 */
const PRELAUNCH_FINDINGS: ReadonlySet<FindingId> = new Set<FindingId>([
  'billing-access',
  'deployment-billing-access-token',
  'billing-webhook-secret',
  'deployment-billing-webhook-secret',
  'billing-webhook-route',
  'billing-catalog-production',
])

/**
 * Production's launch state, from its env names and the production ids
 * `billing.generated.ts` holds; `null` when the app has no billing catalog,
 * or its id map does not load. The caller has read that production bills in
 * the provider's production environment.
 */
export async function productionBillingLaunch(rootDir: string, deployed: readonly string[]): Promise<BillingLaunch | null> {
  try {
    if (!(await loadCatalog(rootDir))?.catalog) return null
    const products = (await loadGenerated(rootDir)).production?.products
    return billingLaunch({ environment: 'production', accessToken: deployed.includes('BILLING_ACCESS_TOKEN'), products })
  }
  catch {
    return null
  }
}

/** Why production's billing is not launched, as the finding says it. */
const NOT_LAUNCHED_BECAUSE = {
  no_access_token: 'it bills in the provider\'s production environment and holds no BILLING_ACCESS_TOKEN',
  no_catalog: 'it holds BILLING_ACCESS_TOKEN, but billing.generated.ts has no production products (billing sync --env production has not run)',
} as const

/** The launch steps still to take, from the reason. */
function launchSteps(reason: keyof typeof NOT_LAUNCHED_BECAUSE): string {
  const token = 'put the live organization token in .env.local as BILLING_ACCESS_TOKEN and run `npx nuxt-backend env push --prod`; '
  return `Once the provider has reviewed the organization: ${reason === 'no_access_token' ? token : ''}run \`npx nuxt-backend billing sync --env production\` with production's deploy key, commit and deploy the billing.generated.ts it writes, then start everyone who joined meanwhile on the free plan: \`npx convex run --prod billing:startFreePlan '{}'\`.`
}

/** `billing-launch`: production's billing launched, or the state it is in until then and the steps that launch it. */
function billingLaunchFinding(launch: BillingLaunch): PreflightFinding {
  if (launch.launched) return finding('billing-launch', 'pass', 'Billing is launched on production: it holds BILLING_ACCESS_TOKEN and the catalog has production products, so its pricing sells.')
  return finding(
    'billing-launch',
    'warn',
    `Billing is not launched on production yet: ${NOT_LAUNCHED_BECAUSE[launch.reason]}. Its pricing reads "Plans open soon" and every sale is refused (unavailable, reason not_launched); the rest of the app runs. Until it launches, the token, webhook and production catalog findings warn rather than fail.`,
    launchSteps(launch.reason),
  )
}

/**
 * Production's findings with its launch state: the launch finding leads
 * the billing findings, where `status` reads the capability's most pressing
 * one first. While billing is not launched, each finding that only says
 * the launch has not happened names that state, and is `settled`: it
 * stays a warning under production posture.
 */
export function withBillingLaunch(findings: readonly PreflightFinding[], launch: BillingLaunch): { findings: PreflightFinding[], settled: readonly FindingId[] } {
  const said = launch.launched
    ? [...findings]
    : findings.map(reported => PRELAUNCH_FINDINGS.has(reported.id as FindingId) && reported.status === 'warn'
        ? { ...reported, message: `${reported.message} (billing is not launched yet: see billing-launch)` }
        : reported)
  const at = said.findIndex(reported => reported.capability === 'billing')
  const led = at === -1 ? [...said, billingLaunchFinding(launch)] : [...said.slice(0, at), billingLaunchFinding(launch), ...said.slice(at)]
  return { findings: led, settled: launch.launched ? [] : [...PRELAUNCH_FINDINGS] }
}
