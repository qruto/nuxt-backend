import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { addNitroPlugin, addPlugin, addServerHandler, type Resolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { defu } from 'defu'
import { computeDeployment } from '../deployment'
import { readEnvFiles } from '../env-push'
import { appMonitoringDsn, MONITORING_SDK, monitoringSdkVersion, sdkServesTunnel, SOURCE_MAP_ENV, TUNNEL_SDK_VERSION } from '../monitoring'
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
  /** Whether the installed SDK has the managed tunnel ({@link TUNNEL_SDK_VERSION} or later). */
  tunnel: boolean
  /** Both: the module installs the SDK's module with the package's config. */
  wired: boolean
  /** The env the decision read: `.env`, `.env.local`, then the process env over them. */
  env: Readonly<Record<string, string | undefined>>
  /** The installed SDK's version, for the build's warning. */
  version?: string
}

/** The env a build reads: `.env`, `.env.local`, then the process env over them. */
function buildEnv(rootDir: string): Record<string, string | undefined> {
  return { ...readEnvFiles(rootDir), ...process.env }
}

/**
 * Whether to wire the SDK: only when it is installed and a DSN is set, so an
 * app without either never bundles it, and never imports it.
 */
export function resolveMonitoring(rootDir: string, env: Readonly<Record<string, string | undefined>> = buildEnv(rootDir), installed: (rootDir: string) => string | null = monitoringSdkVersion): MonitoringWiring {
  const dsn = appMonitoringDsn(env)
  const version = installed(rootDir)
  const sdk = version !== null
  return { ...dsn ? { dsn } : {}, sdk, tunnel: sdkServesTunnel(version), wired: Boolean(dsn) && sdk, env, ...version ? { version } : {} }
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
  /** Whether the package's client reports through the managed tunnel: the SDK has it, and the package's server config is the one that answers it. */
  tunnel: boolean
}

/** The SDK's config files of one kind in the app, as the SDK's module finds them: at the root of any layer, the app's own first. */
const CONFIG_EXTENSIONS = ['ts', 'js', 'mjs', 'cjs', 'mts', 'cts']

/** Whether the app (or one of its layers) has its own `sentry.<kind>.config.*`, which the SDK uses in place of the package's. */
export function ownSdkConfig(nuxt: Pick<Nuxt, 'options'>, kind: 'client' | 'server'): boolean {
  const roots = nuxt.options._layers?.map(layer => layer.cwd) ?? [nuxt.options.rootDir]
  return roots.some(root => CONFIG_EXTENSIONS.some(extension => existsSync(resolve(root, `sentry.${kind}.config.${extension}`))))
}

/**
 * How the browser's reports leave: through the managed tunnel, when the SDK
 * has it and the package's own server config answers it; otherwise straight
 * to the ingest, which needs the DSN's origin in `connect-src`. An app's own
 * client config may or may not set `tunnel`, so its DSN's origin is let out
 * too.
 */
export function reportPath(wiring: Pick<MonitoringWiring, 'tunnel'>, own: { client: boolean, server: boolean }): { tunnel: boolean, direct: boolean } {
  const tunnel = wiring.tunnel && !own.server
  return { tunnel, direct: !tunnel || own.client }
}

/**
 * Register the monitoring layer's runtime: the DSN in runtime config, the
 * health route, the SDK's tagging and capture where it is wired, and in dev
 * the local error log.
 */
export function registerMonitoring(resolver: Resolver, nuxt: Nuxt, wiring: MonitoringWiring = monitoringWiring(nuxt)): void {
  const { env } = wiring
  const own = wiring.wired ? { client: ownSdkConfig(nuxt, 'client'), server: ownSdkConfig(nuxt, 'server') } : { client: false, server: false }
  const path = reportPath(wiring, own)
  const runtimeConfig = nuxt.options.runtimeConfig
  runtimeConfig.public.backend = {
    ...(runtimeConfig.public.backend as Record<string, unknown> | undefined),
    monitoring: { dsn: wiring.wired ? wiring.dsn! : '', environment: env.BACKEND_ENVIRONMENT || env.VERCEL_ENV || 'production', tunnel: wiring.wired && path.tunnel } satisfies MonitoringPublicConfig,
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
    if (path.direct) {
      // Reports that go straight to the ingest need its origin in the security
      // headers. Nitro runs the policy hook in plugin order, and the base
      // module's plugin narrows `connect-src`, so this one goes in once every
      // module has set up: ahead of the base module's it would find the
      // directive unset, and leave it.
      nuxt.hook('modules:done', () => {
        const csp = resolver.resolve('./runtime/server/monitoring/csp')
        addNitroPlugin({ nitro2: csp, nitro3: csp })
      })
    }
    warnOnDirectReports(wiring, own)
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
 * Say once at build time when the browser's reports skip the managed tunnel:
 * an SDK too old for it, or a config file of the app's own that the
 * package's other config can't pair with.
 */
function warnOnDirectReports(wiring: MonitoringWiring, own: { client: boolean, server: boolean }): void {
  if (!wiring.tunnel) {
    logger.warn(`Monitoring: ${MONITORING_SDK} ${wiring.version ?? ''} is older than ${TUNNEL_SDK_VERSION}, so the browser reports straight to the ingest, whose origin the security headers let out, and ad blockers drop them. Upgrade it to ^${TUNNEL_SDK_VERSION} for the managed tunnel.`)
    return
  }
  if (own.server && !own.client) {
    logger.warn('Monitoring: the app has its own sentry.server.config, so the package\'s browser config sends its reports straight to the ingest (its origin let out in connect-src) rather than through a tunnel nothing may answer. For the tunnel, add Sentry.serveTunnelIntegration() to your server config and a sentry.client.config with tunnel: true.')
  }
  else if (own.client) {
    logger.warn('Monitoring: the app has its own sentry.client.config: the security headers let its DSN\'s ingest out in connect-src. Set tunnel: true in it to report through the managed tunnel' + (own.server ? ', with Sentry.serveTunnelIntegration() in your server config.' : ', which the package\'s server config answers.'))
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
