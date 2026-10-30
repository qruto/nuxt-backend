// The monitoring layer's Node side: the DSN the app reads, whether the
// error-reporting SDK is installed, and doctor's monitoring findings. The
// module wires the SDK from the same two facts (src/nuxt/monitoring.ts).

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { runConvex } from './convex-cli'
import { finding, type PreflightFinding } from './findings'

/** The SDK the app reports errors through: an optional peer, wired only when it is installed and a DSN is set. */
export const MONITORING_SDK = '@sentry/nuxt'

/** What Sentry's Vercel integration sets for a build to upload its source maps. */
export const SOURCE_MAP_ENV = ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'] as const

/**
 * The name Sentry's Vercel integration sets the DSN under: a Next.js name,
 * read as it is and never renamed or asked for. `MONITORING_DSN` is filled
 * from it, in the app and (`env push`) on the deployment.
 */
export const INTEGRATION_DSN_ENV = 'NEXT_PUBLIC_SENTRY_DSN'

/**
 * The platform's own names the monitoring layer reads as they are, never
 * renamed and never asked for: the DSN and the source-map upload's names
 * Sentry's Vercel integration sets.
 */
export const MONITORING_PLATFORM_ENV = [INTEGRATION_DSN_ENV, ...SOURCE_MAP_ENV] as const

/**
 * The DSN the app reports to: its own `MONITORING_DSN`, else the
 * `NEXT_PUBLIC_SENTRY_DSN` that Sentry's Vercel integration sets;
 * `undefined` without either.
 */
export function appMonitoringDsn(env: Readonly<Record<string, string | undefined>>): string | undefined {
  return env.MONITORING_DSN?.trim() || env[INTEGRATION_DSN_ENV]?.trim() || undefined
}

/** Whether the SDK resolves from the app's root, as the app's build would find it. */
export function monitoringSdkInstalled(rootDir: string): boolean {
  try {
    createRequire(join(rootDir, 'package.json')).resolve(`${MONITORING_SDK}/package.json`)
    return true
  }
  catch {
    return false
  }
}

/** Whether the app deploys to Vercel: a build there, or a project linked here (`vercel link`). */
export function deploysToVercel(rootDir: string, env: Readonly<Record<string, string | undefined>>): boolean {
  return Boolean(env.VERCEL) || existsSync(join(rootDir, '.vercel', 'project.json'))
}

/**
 * `MONITORING_DSN` on the deployment: unset in dev is the designed state
 * (the local error log stands in); unset on production, the backend's
 * errors and cron check-ins go unreported.
 */
export function monitoringDsnFinding(isSet: boolean, { prod }: { prod: boolean }): PreflightFinding {
  if (isSet) return finding('deployment-monitoring-dsn', 'pass', 'MONITORING_DSN is set on the deployment: its actions report errors, and on production its cron checks in.')
  if (!prod) return finding('deployment-monitoring-dsn', 'pass', 'MONITORING_DSN is not set on this dev deployment: the backend reports nothing, and the dev server\'s local error log stands in.')
  return finding(
    'deployment-monitoring-dsn',
    'warn',
    'MONITORING_DSN is not set on the production deployment: errors in its actions and its cron check-ins go unreported.',
    'Add the DSN to .env.local and run `npx nuxt-backend env push --prod`.',
  )
}

/** What the monitoring checks read, beside the project's files. */
export interface MonitoringCheckInput {
  /** The env visible here: `.env`, `.env.local` and the process env. */
  env: Readonly<Record<string, string | undefined>>
  /** The deployment's env names, `null` when they could not be read. */
  deployed: readonly string[] | null
  prod: boolean
}

/**
 * Whether the app reports: a DSN that reaches an installed SDK. Without a
 * DSN, dev's local error log stands in; under production posture, a linked
 * Vercel project's env cannot be read from here, and anywhere else the app
 * reports nothing.
 */
function appFinding(rootDir: string, env: Readonly<Record<string, string | undefined>>, { dsn, sdk, prod }: { dsn: string | undefined, sdk: boolean, prod: boolean }): PreflightFinding {
  if (dsn) {
    return sdk
      ? finding('monitoring-app', 'pass', `The browser and the Nuxt server report errors through ${MONITORING_SDK}.`)
      : finding('monitoring-app', 'warn', `A DSN is set for the app, but ${MONITORING_SDK} is not installed: the browser and the Nuxt server report nothing.`, `Install it: npm install ${MONITORING_SDK}. The module wires it once it is there.`)
  }
  if (!prod) return finding('monitoring-app', 'pass', 'No DSN is set for the app: in dev, errors go to the dev server\'s local error log (DevTools › Monitoring).')
  // A linked Vercel project keeps its env on Vercel: from here, nothing says whether it has one.
  if (!env.VERCEL && deploysToVercel(rootDir, env)) {
    return finding('monitoring-app', 'pass', 'No DSN for the app is visible here, and its production env is on Vercel, which this check cannot read: Sentry\'s Vercel integration sets NEXT_PUBLIC_SENTRY_DSN there. `vercel env pull .env.local` brings it here to check.')
  }
  return finding(
    'monitoring-app',
    'warn',
    'No DSN is visible to the app: in production the browser and the Nuxt server report nothing.',
    `Set MONITORING_DSN in the app's hosting env and install ${MONITORING_SDK}, or install Sentry's Vercel integration, which sets NEXT_PUBLIC_SENTRY_DSN. Run doctor --prod where the app's production env is visible, such as its build.`,
  )
}

/**
 * The app's side of monitoring: whether its DSN reaches an installed SDK,
 * whether a Vercel deploy uploads the source maps that make its stacks
 * readable, and the reminder that only the backend's dashboard turns on its
 * own exception reporting.
 */
export function monitoringFindings(rootDir: string, { env, deployed, prod }: MonitoringCheckInput): PreflightFinding[] {
  const dsn = appMonitoringDsn(env)
  const sdk = monitoringSdkInstalled(rootDir)
  const findings: PreflightFinding[] = [appFinding(rootDir, env, { dsn, sdk, prod })]
  if (dsn && sdk && deploysToVercel(rootDir, env)) {
    const unset = SOURCE_MAP_ENV.filter(name => !env[name])
    findings.push(unset.length === 0
      ? finding('monitoring-source-maps', 'pass', 'A Vercel build uploads its source maps: SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are set.')
      : finding(
          'monitoring-source-maps',
          'warn',
          `The app deploys to Vercel, and ${unset.join(', ')} ${unset.length === 1 ? 'is' : 'are'} not visible here: a build without them uploads no source maps, so stack traces stay minified.`,
          'Install Sentry\'s Vercel integration: it sets them on the project, and each deploy uploads its source maps and names its release. `vercel env pull .env.local` brings them here to check.',
        ))
  }
  if (prod || deployed?.includes('MONITORING_DSN')) {
    findings.push(finding('monitoring-backend-exceptions', 'pass', 'Queries and mutations cannot post a report: their errors are reported where they are called, with the function and its error code. For the backend\'s own report of every exception, turn on exception reporting in its dashboard (a Pro plan setting).'))
  }
  return findings
}

/** One usage limit of a deployment, as `npx convex deployment usage-limits list --json` prints it. */
export interface DeploymentUsageLimit {
  metric: string
  window: 'day' | 'month'
  limitType: 'warning' | 'disable'
  limit: number
  enabled: boolean
  triggered?: boolean
}

/** The usage limits of production, `null` when they cannot be read (no login, an older CLI, no deployment). */
export async function readUsageLimits(rootDir: string): Promise<DeploymentUsageLimit[] | null> {
  try {
    const { stdout } = await runConvex(rootDir, ['deployment', 'usage-limits', 'list', '--prod', '--json'])
    const parsed = JSON.parse(stdout) as unknown
    return Array.isArray(parsed) ? parsed.filter((limit): limit is DeploymentUsageLimit => typeof limit?.metric === 'string' && typeof limit?.limitType === 'string') : null
  }
  catch {
    return null
  }
}

/** The command that sets a warning on a metric, for a finding's fix. */
const warningCommand = (metric: string, limit: string) => `npx convex deployment usage-limits set --prod --metric ${metric} --window month --type warning --limit ${limit}`

/**
 * Whether production warns before its usage runs away: Convex's own usage
 * limits, whose `warning` type emails the team on a production deployment.
 * The deployment cannot read its usage itself, so this alert is Convex's.
 * With models through the Convex AI Gateway, the gateway's dollars want one
 * too (`aiGatewayCostDollars`).
 */
export function usageAlertsFinding(limits: readonly DeploymentUsageLimit[] | null, { convexGateway }: { convexGateway: boolean }): PreflightFinding {
  if (limits === null) {
    return finding('monitoring-usage-alerts', 'pass', 'Production\'s usage limits could not be read here (`npx convex deployment usage-limits list --prod` needs a login with access to the project). A `warning` limit emails the team before usage runs away.')
  }
  const warned = new Set(limits.filter(limit => limit.limitType === 'warning' && limit.enabled).map(limit => limit.metric))
  const missing = [...warned.size === 0 ? ['functionCalls'] : [], ...convexGateway && !warned.has('aiGatewayCostDollars') ? ['aiGatewayCostDollars'] : []]
  const triggered = limits.filter(limit => limit.enabled && limit.triggered).map(limit => `${limit.metric} (${limit.limitType}, per ${limit.window})`)
  if (missing.length > 0) {
    return finding(
      'monitoring-usage-alerts',
      'warn',
      `Production has no active warning usage limit on ${missing.join(' or ')}: nothing tells the team its usage is running away until a bill or a disable limit does.`,
      missing.map(metric => warningCommand(metric, metric === 'aiGatewayCostDollars' ? '<dollars>' : '<calls>')).join('; '),
    )
  }
  if (triggered.length > 0) return finding('monitoring-usage-alerts', 'warn', `Production is past ${triggered.length === 1 ? 'a usage limit' : 'usage limits'}: ${triggered.join(', ')}.`, 'Look at the usage in the Convex dashboard, then raise the limit or find what spends it.')
  return finding('monitoring-usage-alerts', 'pass', `Production warns the team by email once usage passes its limits: ${[...warned].sort().join(', ')}.`)
}
