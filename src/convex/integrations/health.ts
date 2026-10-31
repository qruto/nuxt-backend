import { httpActionGeneric, type GenericActionCtx, type GenericDataModel } from 'convex/server'
import { BACKEND_ENV } from '../../env-registry.js'
import { capabilityHealth } from '../../capabilities/health.js'
import { detectCapabilities } from '../../capabilities/status.js'
import { CAPABILITY_SWITCHES, type CapabilityContext, type CapabilityDeployment, type CapabilitySwitch } from '../../capabilities/types.js'
import { readEnv } from '../delivery.js'
import { parseBackendEnvironment } from '../environment.js'
import { isLoopbackUrl } from '../loopback.js'
import { parseMonitoringDsn } from '../monitoring.js'
import { claimedSignInMethod, hasAnyRole, passkeyOnlyAdminRefusal } from './access.js'

// The backend's health, as its own route serves it: every app capability's
// state, detected from the env the deployment holds (names, and the two
// switches' values) with the registry's own `detect`, then summed up by
// `capabilityHealth()`. Nothing is probed beyond that env: a capability fails only
// when its env is set and unusable (a DSN that does not parse). Public
// callers get the coarse form, states and nothing else; an admin, or anyone
// on a deployment named `development`, the detail. The Nuxt app's
// `/api/backend/health` asks it on every request, adding what only the app
// knows. Internal: `registerBackendRoutes` mounts it, and the types here stay
// out of the published declarations.

/** The roles that read the detail by default: the auth admin plugin's default admin role. */
const DEFAULT_HEALTH_DETAIL_ROLES: readonly string[] = ['admin']

/** The deployment kinds the app may name for a deployment that names none itself. */
const CLOUD_KINDS = new Set<CapabilityDeployment>(['cloud-dev', 'production', 'preview', 'self-hosted'])

/** The health the route answers: the summary, each capability's state, and for the detail why. */
interface BackendHealth {
  status: 'ok' | 'degraded' | 'failing'
  capabilities: Partial<Record<string, string>>
  detail?: Partial<Record<string, { reason: string, missingEnv: string[], top: string | null }>>
}

/**
 * What the Nuxt app adds to the backend's own view: facts the backend cannot read itself.
 *
 * @internal
 */
export interface HealthHints {
  /**
   * The deployment kind, as the app was built against it (`production`,
   * `cloud-dev`, …). Only wording, and only for a deployment whose
   * `BACKEND_ENVIRONMENT` names none: a local deployment is told by its
   * own URL.
   */
  deployment?: string | null
  /** Whether the app reports errors itself: an error-reporting SDK wired with a DSN. */
  monitoring?: boolean
}

/**
 * The kind of deployment this is: what its `BACKEND_ENVIRONMENT` says
 * (`env push` derives it from the kind; a `sandbox` demo runs in production
 * mode), else local by its own URL, else what the app says, else production.
 */
function deploymentKind(env: Readonly<Record<string, string | undefined>>, hint: string | null | undefined): CapabilityDeployment {
  const local = isLoopbackUrl(env.CONVEX_CLOUD_URL)
  switch (parseBackendEnvironment(env.BACKEND_ENVIRONMENT)) {
    case 'development': return local ? 'local' : 'cloud-dev'
    case 'preview': return 'preview'
    case 'sandbox':
    case 'production': return local ? 'self-hosted' : 'production'
  }
  if (local) return 'local'
  if (hint && CLOUD_KINDS.has(hint as CapabilityDeployment)) return hint as CapabilityDeployment
  return env.CONVEX_CLOUD_URL?.includes('.convex.cloud') ? 'production' : 'self-hosted'
}

/**
 * The failures the deployment can tell from its own env: a `MONITORING_DSN`
 * that is set and does not parse, so the backend reports nothing.
 */
function envFailures(env: Readonly<Record<string, string | undefined>>): CapabilityContext['findings'] {
  const dsn = env.MONITORING_DSN
  if (!dsn || parseMonitoringDsn(dsn)) return []
  return [{
    id: 'deployment-monitoring-dsn',
    capability: 'monitoring',
    title: 'Deployment MONITORING_DSN',
    status: 'fail',
    message: 'MONITORING_DSN is set on the deployment but is not a DSN (https://<key>@<host>/<project id>): the backend reports nothing.',
    fixHint: 'Set the DSN the monitoring service gives the project.',
    docsUrl: 'https://nuxt-backend.dev/d/deployment-monitoring-dsn',
  }]
}

/**
 * The capabilities' context as the deployment sees itself: the env names it holds
 * (the registry's, by presence), the two switches' values, its kind, the
 * failures its env shows, and what the app adds.
 *
 * @internal
 */
export function deploymentLayerContext(env: Readonly<Record<string, string | undefined>>, hints: HealthHints = {}): CapabilityContext {
  const deployed = new Set(Object.keys(BACKEND_ENV).filter(name => Boolean(env[name])))
  const switches: Partial<Record<CapabilitySwitch, string>> = {}
  for (const name of CAPABILITY_SWITCHES) if (env[name]) switches[name] = env[name]
  return {
    env: {},
    deployed,
    switches,
    deployment: deploymentKind(env, hints.deployment),
    findings: envFailures(env),
    ...hints.monitoring !== undefined ? { app: { monitoring: hints.monitoring } } : {},
  }
}

/** The deployment's own env, as the runtime has it. */
function runtimeEnv(): Record<string, string | undefined> {
  const names = [...Object.keys(BACKEND_ENV), 'CONVEX_CLOUD_URL']
  return Object.fromEntries(names.map(name => [name, readEnv(name)]))
}

/**
 * The hints a request carries: `?deployment=production&monitoring=1`.
 *
 * @internal
 */
export function readHealthHints(url: string): HealthHints {
  const params = new URL(url).searchParams
  const monitoring = params.get('monitoring')
  return {
    deployment: params.get('deployment'),
    ...monitoring === null ? {} : { monitoring: monitoring === '1' },
  }
}

/**
 * The account behind a request's bearer, as `setupAuth`'s auth component reads it.
 *
 * @internal
 */
export interface HealthAuth {
  safeGetAuthUser?: (ctx: never) => Promise<{ role?: string | null, banned?: boolean | null, passkeyOnly?: boolean | null } | null | undefined>
}

/**
 * Whether the caller is an admin: a person's own session, its account
 * holding a detail role, read fresh, and on a sandbox the package's admin
 * rule (a passkey-only account, signed in to this session with a passkey).
 */
async function isAdmin(ctx: GenericActionCtx<GenericDataModel>, auth: HealthAuth | undefined, roles: readonly string[]): Promise<boolean> {
  if (!auth?.safeGetAuthUser) return false
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return false
  const user = await auth.safeGetAuthUser(ctx as never).catch(() => null)
  if (!user || user.banned || !hasAnyRole(user.role || 'user', [...roles])) return false
  return !passkeyOnlyAdminRefusal(user, claimedSignInMethod(identity as unknown as Record<string, unknown>), 'health')
}

/**
 * The backend's health for one request: the detail for an admin, or on a
 * deployment named `development` (`env push` names a dev deployment so, and
 * nothing else); the coarse form for everyone else.
 *
 * @internal
 */
export async function backendHealth(ctx: GenericActionCtx<GenericDataModel>, request: Request, auth?: HealthAuth, roles: readonly string[] = DEFAULT_HEALTH_DETAIL_ROLES): Promise<BackendHealth> {
  const env = runtimeEnv()
  const statuses = detectCapabilities(deploymentLayerContext(env, readHealthHints(request.url)))
  const detail = parseBackendEnvironment(env.BACKEND_ENVIRONMENT) === 'development' || await isAdmin(ctx, auth, roles)
  return detail ? capabilityHealth(statuses, { detail: true }) : capabilityHealth(statuses)
}

/**
 * The route's handler: the health as JSON, never cached, `503` once a capability fails.
 *
 * @internal
 */
export function healthRoute(auth?: HealthAuth, roles?: readonly string[]) {
  return httpActionGeneric(async (ctx, request) => {
    const health = await backendHealth(ctx, request, auth, roles)
    return Response.json(health, {
      status: health.status === 'failing' ? 503 : 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  })
}
