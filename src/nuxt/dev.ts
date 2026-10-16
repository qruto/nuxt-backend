import { detectAgent } from 'std-env'
import type { Nuxt } from '@nuxt/schema'
import { AGENT_HINT } from '../agents'
import { deriveDeploymentUrls, resolveSiteUrl, isDevDeploymentId } from '../deployment'
import { isEnvProvisioned, markEnvProvisioned, provisionedEnvNames, readEnvFiles, runEnvPush } from '../env-push'
import { collectPreflightFindings, formatPreflightSummary, needsSetup, type PreflightFinding } from '../preflight'
import { appComponentIsStarter } from '../scaffold'
import type { ModuleOptions } from '../module'
import { logger } from './logger'
import { resolveMcpOptions } from './mcp'

// What runs only in development: the DevTools gate, the env auto-provision,
// and the environment preflight with its starter `app.vue` check.

/** Whether the Nuxt DevTools UI itself is enabled for this app. */
export function isDevtoolsUiEnabled(nuxt: Nuxt): boolean {
  const devtools = nuxt.options.devtools as boolean | { enabled?: boolean } | undefined
  return typeof devtools === 'boolean' ? devtools : devtools?.enabled !== false
}

/**
 * Dev-startup env auto-provision (`backend.autoEnv`, default on): run the
 * `env push` engine against the `dev:` deployment once per deployment,
 * asynchronously after startup. The stamp under `node_modules/.cache`
 * prevents a `convex env list` spawn on every boot; a failed run leaves no
 * stamp, so the next boot retries. When `npx convex dev` has not provisioned
 * yet (very first run — no `CONVEX_DEPLOYMENT` in `.env.local`), a watcher
 * on `.env.local` picks the deployment up the moment it appears, so the two
 * first-run terminals can start in any order.
 */
export function runDevAutoEnv(options: ModuleOptions, nuxt: Nuxt): void {
  if (!nuxt.options.dev || nuxt.options._prepare || nuxt.options.test || options.autoEnv === false) return
  const rootDir = nuxt.options.rootDir

  const attempt = (): boolean => {
    // Dev-class only: cloud dev (`dev:`), CLI-managed local (`local:`) and
    // anonymous local (`anonymous:`) deployments. Read the id directly — URL
    // derivation has nothing to say about a local backend without written URLs.
    const deployment = process.env.CONVEX_DEPLOYMENT
      ?? readEnvFiles(rootDir).CONVEX_DEPLOYMENT
      ?? deriveDeploymentUrls(rootDir)?.deployment
    if (!isDevDeploymentId(deployment)) return false
    if (isEnvProvisioned(rootDir, deployment)) return true

    void runEnvPush(rootDir, {}).then((run) => {
      if (!run) return
      for (const { action, outcome, error } of run.results) {
        if (outcome === 'set') logger.info(`env push: ${action.name} — ${action.detail}`)
        else if (outcome === 'failed') logger.warn(`env push: ${action.name} failed — ${error}`)
      }
      if (run.results.every(result => result.outcome !== 'failed')) markEnvProvisioned(rootDir, deployment)
    }).catch((error: unknown) => {
      logger.warn(`env auto-provision failed: ${error instanceof Error ? error.message : String(error)}`)
    })
    return true
  }

  if (attempt()) return
  nuxt.hook('builder:watch', (_event, path) => {
    if (!path.replace(/\\/g, '/').endsWith('.env.local')) return
    attempt()
  })
}

/**
 * Whether a backend site URL reaches the base module — from the module option,
 * the package's own env name (the platform's own name still works as a
 * fallback), explicit config, or slug derivation.
 * Shared by the preflight run and the DevTools `getInfo()` builder.
 */
export function isSiteUrlConfigured(options: ModuleOptions, nuxt: Nuxt): boolean {
  return Boolean(
    ((nuxt.options as unknown as Record<string, unknown>).convex as { siteUrl?: string } | undefined)?.siteUrl
    ?? resolveSiteUrl({ siteUrl: options.siteUrl, url: options.url, env: process.env, derived: deriveDeploymentUrls(nuxt.options.rootDir) }),
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
  // services underneath. The platform's names keep working — the base module
  // reads them — but say so once so a new reader learns the neutral one.
  for (const [platform, neutral] of [
    ['NUXT_PUBLIC_CONVEX_URL', 'NUXT_PUBLIC_BACKEND_URL'],
    ['NUXT_PUBLIC_CONVEX_SITE_URL', 'NUXT_PUBLIC_BACKEND_SITE_URL'],
  ] as const) {
    if (process.env[platform] && !process.env[neutral]) {
      logger.info(`${platform} is set; ${neutral} is this package's own name for it (both work).`)
    }
  }
  if (derived?.source === 'deployment' && !options.url && !process.env.NUXT_PUBLIC_BACKEND_URL && !process.env.NUXT_PUBLIC_CONVEX_URL) {
    logger.info(`Backend URLs derived from ${derived.deployment} — no NUXT_PUBLIC_* URL vars needed.`)
  }
  const mcp = resolveMcpOptions(options.mcp)
  const findings = collectPreflightFindings({
    env: process.env,
    siteUrlConfigured,
    mcp: { route: mcp.route },
    deployedNames: provisionedEnvNames(nuxt.options.rootDir),
  })

  // A `create nuxt` starter renders <NuxtWelcome /> and no <NuxtPage />: the
  // module's pages resolve (the auth guard even redirects to /login) but the
  // welcome screen is all anyone sees. Say so once, with the one-line fix.
  if (appComponentIsStarter(nuxt.options.rootDir)) {
    logger.warn(
      'app.vue still renders <NuxtWelcome /> and no <NuxtPage />, so the pages this module registers (/login, /pricing, …) will not render. '
      + 'Replace <NuxtWelcome /> with <NuxtPage /> — `npx nuxt-backend init` does it for you.',
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
