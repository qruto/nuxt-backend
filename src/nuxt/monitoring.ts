import { addNitroPlugin, addPlugin, addServerHandler, type Resolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { defu } from 'defu'
import { computeDeployment } from '../deployment'
import { readEnvFiles } from '../env-push'
import { appMonitoringDsn, MONITORING_SDK, monitoringSdkInstalled, SOURCE_MAP_ENV } from '../monitoring'
import { HEALTH_ROUTE, LOCAL_LOG_ROUTE } from '../convex/constants'
import { logger } from './logger'

// The monitoring layer in the Nuxt app: the error-reporting SDK, wired when
// it is installed and a DSN is set; the DSN in runtime config, so app code
// never names the service; the health route; and in dev, the local error
// log DevTools lists.

/** The SDK's Nuxt module, which the module installs when it wires the SDK. */
const SDK_MODULE = `${MONITORING_SDK}/module`

/** The directory of the SDK's config files and capture plugins: its config names are the SDK's own. */
const SDK_DIR = './runtime/monitoring/sdk'

/** Whether the module wires the SDK, and why. */
export interface MonitoringWiring {
  /** The DSN the app reports to; `undefined` without one. */
  dsn?: string
  /** Whether the SDK is installed in the app. */
  sdk: boolean
  /** Both: the module installs the SDK's module with the package's config. */
  wired: boolean
  /** The env the decision read: `.env`, `.env.local`, then the process env over them. */
  env: Readonly<Record<string, string | undefined>>
}

/** The env a build reads: `.env`, `.env.local`, then the process env over them. */
function buildEnv(rootDir: string): Record<string, string | undefined> {
  return { ...readEnvFiles(rootDir), ...process.env }
}

/**
 * Whether to wire the SDK: only when it is installed and a DSN is set, so an
 * app without either never bundles it, and never imports it.
 */
export function resolveMonitoring(rootDir: string, env: Readonly<Record<string, string | undefined>> = buildEnv(rootDir), installed: (rootDir: string) => boolean = monitoringSdkInstalled): MonitoringWiring {
  const dsn = appMonitoringDsn(env)
  const sdk = installed(rootDir)
  return { ...dsn ? { dsn } : {}, sdk, wired: Boolean(dsn) && sdk, env }
}

/**
 * One decision per Nuxt instance: the module's dependencies are resolved
 * before its setup runs, and both must agree on whether the SDK is wired,
 * or its module would be installed without the capture plugins.
 */
const wirings = new WeakMap<Nuxt, MonitoringWiring>()

/** The wiring of this Nuxt instance: decided once, on first ask. */
export function monitoringWiring(nuxt: Nuxt): MonitoringWiring {
  let wiring = wirings.get(nuxt)
  if (!wiring) wirings.set(nuxt, wiring = resolveMonitoring(nuxt.options.rootDir))
  return wiring
}

/**
 * The SDK's module as a dependency of this one, when it is wired: its
 * defaults point it at the package's own client and server config, which
 * an app's own `sentry.client.config.ts` or `sentry.server.config.ts` (at
 * its root) replaces. Everything else, source maps and releases included,
 * is the SDK module's own, as are the app's `sentry: { … }` options.
 */
export function monitoringDependency(wiring: MonitoringWiring, resolver: Resolver): Record<string, { defaults: { configDir: string } }> {
  if (!wiring.wired) return {}
  return { [SDK_MODULE]: { defaults: { configDir: resolver.resolve(SDK_DIR) } } }
}

/** The public runtime config the client reads its DSN from. */
export interface MonitoringPublicConfig {
  /** The DSN the browser reports to, and the server without one in its own env; empty when the SDK is not wired. */
  dsn: string
  /** The environment its reports name: `BACKEND_ENVIRONMENT` where the host sets it, else the host's (`VERCEL_ENV`), else `production`. */
  environment: string
}

/**
 * Register the monitoring layer's runtime: the DSN in runtime config, the
 * health route, the SDK's tagging and capture where it is wired, and in dev
 * the local error log.
 */
export function registerMonitoring(resolver: Resolver, nuxt: Nuxt, wiring: MonitoringWiring = monitoringWiring(nuxt)): void {
  const { env } = wiring
  const runtimeConfig = nuxt.options.runtimeConfig
  runtimeConfig.public.backend = {
    ...(runtimeConfig.public.backend as Record<string, unknown> | undefined),
    monitoring: { dsn: wiring.wired ? wiring.dsn! : '', environment: env.BACKEND_ENVIRONMENT || env.VERCEL_ENV || 'production' } satisfies MonitoringPublicConfig,
  } as unknown as typeof runtimeConfig.public.backend
  const kind = computeDeployment(nuxt.options.rootDir, env).kind
  runtimeConfig.backendHealth = {
    // A deployment that names no environment of its own cannot tell a cloud
    // dev deployment from production: the build names it, for the detail's
    // wording (empty when it knows none).
    deployment: kind === 'none' ? '' : kind,
  }

  // The handlers are written against `nuxt/server`, the plugins import no
  // server runtime: one file each serves both Nitro majors.
  addServerHandler({ route: HEALTH_ROUTE, method: 'get', handler: { nuxt: resolver.resolve('./runtime/server/monitoring/health') } })

  if (wiring.wired) {
    addPlugin({ src: resolver.resolve(`${SDK_DIR}/capture.client`), mode: 'client' })
    // Replay after consent and the feedback widget, each when the app config asks for it.
    addPlugin({ src: resolver.resolve(`${SDK_DIR}/observe.client`), mode: 'client' })
    const capture = resolver.resolve(`${SDK_DIR}/capture.server`)
    addNitroPlugin({ nitro2: capture, nitro3: capture })
    warnWithoutSourceMaps(env)
  }

  // Dev only, and never under a test runner, where nothing reads the log.
  if (nuxt.options.dev && !nuxt.options.test) {
    addServerHandler({ route: LOCAL_LOG_ROUTE, handler: { nuxt: resolver.resolve('./runtime/server/monitoring/local-log-route') } })
    // An error's message can hold markup, and a burst of them is normal:
    // nuxt-security's XSS validator and rate limiter stay off the log (the
    // route refuses other sites itself). Inert without nuxt-security.
    const routeRules = (nuxt.options.routeRules ??= {})
    routeRules[LOCAL_LOG_ROUTE] = defu(routeRules[LOCAL_LOG_ROUTE], { security: { xssValidator: false as const, rateLimiter: false as const } })
    const localLog = resolver.resolve('./runtime/server/monitoring/local-log')
    addNitroPlugin({ nitro2: localLog, nitro3: localLog })
    addPlugin({ src: resolver.resolve('./runtime/vue/plugins/monitoring-log.client'), mode: 'client' })
  }
}

/**
 * On a Vercel build, say once when the SDK will upload no source maps: the
 * build sees none of the names Sentry's Vercel integration sets.
 */
function warnWithoutSourceMaps(env: Readonly<Record<string, string | undefined>>): void {
  if (!env.VERCEL) return
  const unset = SOURCE_MAP_ENV.filter(name => !env[name])
  if (unset.length === 0) return
  logger.warn(`Monitoring: this Vercel build sees no ${unset.join(', ')}, so it uploads no source maps and error stacks stay minified. Install Sentry's Vercel integration, which sets them.`)
}
