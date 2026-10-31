import { defineEventHandler, getRequestHeader, setResponseStatus, useRuntimeConfig, type RequestEvent } from 'nuxt/server'
import { convexAuth } from 'nuxt-convex-module/better-auth/server'
import { DEFAULT_HEALTH_PATH } from '../../../convex/constants.js'
import { readSiteUrl } from '../site-url'

// `/api/backend/health`: the app's health for uptime checks. Every app
// capability's state comes from the backend's own health route, which detects
// them from the env the deployment holds; the app adds what only it knows
// (whether it reports errors through a wired SDK, the kind of deployment it
// was built against) and the caller's session, so an admin gets the detail.
// The public gets the states and nothing else. `503` once a capability fails (an
// env set but unusable, such as a DSN that does not parse), and when the
// backend cannot be reached: then only the data capability can be told.

/** How long the app waits for the backend's answer before it calls it unreachable. */
const BACKEND_TIMEOUT_MS = 5000

/** The states a capability can be in, as the backend reports them. */
const STATES = new Set(['live', 'test', 'missing', 'failing'])

/** The health the route answers: the summary and each capability's state, and for an admin the detail. */
export interface AppHealth {
  status: 'ok' | 'degraded' | 'failing'
  capabilities: Record<string, string>
  detail?: Record<string, { reason: string, missingEnv: string[], top: string | null }>
}

/** An app whose backend did not answer: its data capability is failing, and nothing else can be told. */
const UNREACHABLE: AppHealth = { status: 'failing', capabilities: { data: 'failing' } }

/** Whether the backend answered with a health, and nothing else. */
function isHealth(value: unknown): value is AppHealth {
  if (typeof value !== 'object' || value === null) return false
  const { status, capabilities } = value as Record<string, unknown>
  return (status === 'ok' || status === 'degraded' || status === 'failing')
    && typeof capabilities === 'object' && capabilities !== null
    && Object.values(capabilities).every(state => typeof state === 'string' && STATES.has(state))
}

/**
 * Whether the app reports errors: the module wired the SDK, which it does
 * only with the SDK installed and a DSN set, and then it puts the DSN in
 * runtime config. A DSN in the env with no SDK to report through says
 * nothing.
 */
function appReports(): boolean {
  const config = useRuntimeConfig() as { public?: { backend?: { monitoring?: { dsn?: string } } } }
  return Boolean(config.public?.backend?.monitoring?.dsn)
}

/** The caller's session token, when the request carries a session; none for an anonymous check. */
async function sessionToken(event: RequestEvent): Promise<string | undefined> {
  if (!getRequestHeader(event, 'cookie')) return undefined
  try {
    return await convexAuth(event).getToken()
  }
  catch {
    return undefined
  }
}

/** The app's health: the backend's, with what the app adds. */
export async function readAppHealth(event: RequestEvent): Promise<AppHealth> {
  const siteUrl = readSiteUrl()
  const config = (useRuntimeConfig() as { backendHealth?: { deployment?: string } }).backendHealth
  if (!siteUrl) return UNREACHABLE
  const query = new URLSearchParams({ monitoring: appReports() ? '1' : '0', ...config?.deployment ? { deployment: config.deployment } : {} })
  const token = await sessionToken(event)
  try {
    // fallow-ignore-next-line security-sink -- destination is the deployment site URL from runtime config and the fixed health path, never the request; verified 2026-10-19
    const response = await fetch(`${siteUrl}${DEFAULT_HEALTH_PATH}?${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    })
    if (!response.ok && response.status !== 503) return UNREACHABLE
    const body: unknown = await response.json()
    return isHealth(body) ? body : UNREACHABLE
  }
  catch {
    return UNREACHABLE
  }
}

export default defineEventHandler(async (event) => {
  const health = await readAppHealth(event)
  event.res.headers.set('Cache-Control', 'no-store')
  setResponseStatus(event, health.status === 'failing' ? 503 : 200)
  return health
})
