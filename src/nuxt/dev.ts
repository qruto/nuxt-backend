import { detectAgent } from 'std-env'
import { addPlugin, type Resolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { AGENT_HINT } from '../agents'
import { deriveDeploymentUrls, resolveSiteUrl } from '../deployment'
import { resolveFunctionsDir } from '../aliases'
import { buildDevtoolsInfo, readPackageVersions } from '../devtools/info'
import type { DevtoolsPageInfo } from '../devtools/rpc-types'
import { provisionedEnvNames, readEnvFiles } from '../env-push'
import { collectPreflightFindings, formatPreflightSummary, needsSetup, type PreflightFinding } from '../preflight'
import { appComponentIsStarter } from '../scaffold'
import type { ModuleOptions } from '../module'
import { logger } from './logger'

// What runs only in development: the DevTools gate, and the environment
// preflight with its starter `app.vue` check. The dev server writes nothing
// to the app and provisions nothing: `nuxt-backend init` scaffolds, and
// `nuxt-backend dev` provisions the dev deployment's env.

/** Whether the Nuxt DevTools UI itself is enabled for this app. */
export function isDevtoolsUiEnabled(nuxt: Nuxt): boolean {
  const devtools = nuxt.options.devtools as boolean | { enabled?: boolean } | undefined
  return typeof devtools === 'boolean' ? devtools : devtools?.enabled !== false
}

/**
 * Whether a backend site URL reaches the base module — from explicit config,
 * the base module's own env name (a custom domain), or derivation from the
 * backend URL or the deployment slug.
 * Shared by the preflight run and the DevTools `getInfo()` builder.
 */
export function isSiteUrlConfigured(options: ModuleOptions, nuxt: Nuxt): boolean {
  return Boolean(
    ((nuxt.options as unknown as Record<string, unknown>).convex as { siteUrl?: string } | undefined)?.siteUrl
    ?? resolveSiteUrl({ url: options.url, env: process.env, derived: deriveDeploymentUrls(nuxt.options.rootDir) }),
  )
}

/**
 * Dev-startup environment preflight. Reports findings, never throws — a dev
 * server must still boot with an incomplete environment.
 */
export function runPreflight(options: ModuleOptions, nuxt: Nuxt): void {
  if (!nuxt.options.dev || nuxt.options._prepare || nuxt.options.test) return

  const derived = deriveDeploymentUrls(nuxt.options.rootDir)
  const siteUrlConfigured = isSiteUrlConfigured(options, nuxt)
  // This package names its own environment after what it does, not after the
  // services underneath. The platform's name keeps working — the base module
  // reads it — but say so once so a new reader learns the neutral one.
  if (process.env.NUXT_PUBLIC_CONVEX_URL && !process.env.NUXT_PUBLIC_BACKEND_URL) {
    logger.info('NUXT_PUBLIC_CONVEX_URL is set; NUXT_PUBLIC_BACKEND_URL is this package\'s own name for it (both work).')
  }
  if (derived?.source === 'deployment' && !options.url && !process.env.NUXT_PUBLIC_BACKEND_URL && !process.env.NUXT_PUBLIC_CONVEX_URL) {
    logger.info(`Backend URLs derived from ${derived.deployment} — no NUXT_PUBLIC_* URL vars needed.`)
  }
  const findings = collectPreflightFindings({
    env: process.env,
    siteUrlConfigured,
    deployedNames: provisionedEnvNames(nuxt.options.rootDir),
  })

  // A `create nuxt` starter renders <NuxtWelcome /> and no <NuxtPage />: the
  // module's pages resolve (the auth guard even redirects to /login) but the
  // welcome screen is all anyone sees. Say so once, with the one-line fix.
  if (appComponentIsStarter(nuxt.options.rootDir)) {
    logger.warn(
      'app.vue still renders <NuxtWelcome /> and no <NuxtPage />, so the pages this module registers (/login, /pricing, …) will not render. '
      + 'Replace <NuxtWelcome /> with <NuxtLayout><NuxtPage /></NuxtLayout> — `npx nuxt-backend init` does it for you, and adds the app shell as the default layout.',
    )
  }

  reportPreflight(findings)
}

/** Each finding at its level, the summary line, and what a coding agent should run. */
function reportPreflight(findings: PreflightFinding[]): void {
  for (const finding of findings) {
    if (finding.status === 'fail') {
      logger.error(`${finding.title}: ${finding.message}${finding.fixHint ? `\n  ↳ ${finding.fixHint}` : ''}`)
    }
    else if (finding.status === 'warn') {
      logger.warn(`${finding.title}: ${finding.message}${finding.fixHint ? `\n  ↳ ${finding.fixHint}` : ''}`)
    }
  }
  logger.info(`backend preflight: ${formatPreflightSummary(findings)}`)

  // A coding agent reads this output to decide what to run next; say what
  // applies here while setup still needs attention.
  if (needsSetup(findings) && detectAgent().name) {
    logger.info(AGENT_HINT)
  }
}

/**
 * The Backend tab in Nuxt DevTools: its RPC and the bridge plugin. Only where
 * a panel can be opened: in dev, with the DevTools UI on and `devtools` not
 * off, and never under a test runner, where nothing ever opens one.
 */
export async function registerDevtoolsPanel(options: ModuleOptions, resolver: Resolver, nuxt: Nuxt, pagesInfo: { list: DevtoolsPageInfo[] }): Promise<void> {
  if (nuxt.options.dev && !nuxt.options.test && options.devtools !== false && isDevtoolsUiEnabled(nuxt)) {
    // Lazy import keeps the DevTools wiring out of production module evaluation.
    const { setupDevtools } = await import('../devtools/index')
    const functionsDir = resolveFunctionsDir(nuxt.options.rootDir)
    const siteUrlConfigured = isSiteUrlConfigured(options, nuxt)
    const versions = readPackageVersions(nuxt.options.rootDir)
    const rootDir = nuxt.options.rootDir
    setupDevtools(resolver, nuxt, {
      rootDir,
      functionsDir,
      // Rebuilt per RPC call so preflight findings (and the shadowed-page
      // list `extendPages` fills during build) stay live in the panel. The
      // env is what the dev server sees: its env files under its process env.
      getInfo: (deploymentEnv, doctor) => buildDevtoolsInfo({
        rootDir,
        env: { ...readEnvFiles(rootDir), ...process.env },
        siteUrlConfigured,
        options,
        pages: pagesInfo.list,
        versions,
        functionsDir,
        deploymentEnv,
        provisionedNames: provisionedEnvNames(rootDir),
        doctor,
      }),
    })
    // Appended so it runs after the plugins that provide the Convex client
    // and the auth session.
    addPlugin({ src: resolver.resolve('./runtime/devtools/plugin.client'), mode: 'client' }, { append: true })
  }
}
