/**
 * Derivation of the two Convex URLs from what `npx convex dev` actually
 * writes. Convex's CLI has no Nuxt detection — for a Nuxt app it records
 * `CONVEX_DEPLOYMENT=dev:<slug>` in `.env.local`, and for a local backend
 * (`local:` / `anonymous:`) also the `CONVEX_URL` / `CONVEX_SITE_URL` it
 * listens on — none of which Nuxt itself reads without `--dotenv`
 * (nuxt-convex-module 0.11+ reads the written URLs from `.env.local`, but in
 * development only, and it never derives them from `CONVEX_DEPLOYMENT`). So
 * without derivation the user must copy both `https://<slug>.convex.cloud` /
 * `.site` URLs by hand before anything works. The written URLs are taken as
 * they are; cloud deployment URLs are otherwise a pure function of the slug,
 * so we derive them and the copy-paste step disappears.
 *
 * Pure and injectable for tests: pass `env` and read files under `rootDir`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { siteFromCloudUrl } from './convex/urls'
import type { DevtoolsDeployment } from './devtools/rpc-types'

/**
 * Whether a `CONVEX_DEPLOYMENT` id names a dev-class deployment: cloud dev
 * (`dev:`), a CLI-managed local backend (`local:`), or the account-less local
 * backend `convex dev` starts in anonymous mode (`anonymous:`). All three are
 * disposable and never production — the line that decides whether the dev
 * boot may provision env, and whether dev-only variables belong.
 */
export function isDevDeploymentId(deployment: string | null | undefined): deployment is string {
  return /^(?:dev|local|anonymous):/.test(deployment ?? '')
}

/**
 * Whether a `CONVEX_DEPLOYMENT` id names a backend on this machine: its URLs
 * are whatever the CLI wrote beside it, never a cloud origin.
 */
export function isLocalDeploymentId(deployment: string | null | undefined): boolean {
  return /^(?:local|anonymous):/.test(deployment ?? '')
}

export interface DerivedDeploymentUrls {
  /** Client/websocket URL, e.g. `https://<slug>.convex.cloud`. */
  url?: string
  /** HTTP actions origin, e.g. `https://<slug>.convex.site`. */
  siteUrl?: string
  /** Where the derivation came from (for log lines / findings). */
  source: 'self-hosted' | 'deployment'
  /** The deployment slug when derived from `CONVEX_DEPLOYMENT`. */
  deployment?: string
}

/**
 * Minimal dotenv parse — KEY=VALUE lines, surrounding quotes stripped, and an
 * unquoted value ends at the first ` #`: the Convex CLI writes
 * `CONVEX_DEPLOYMENT=dev:<slug> # team: …, project: …`, and the comment is
 * not part of the slug. Exported for tests.
 *
 * @internal
 */
export function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const match = line.match(/^[ \t]*([A-Z_]\w*)[ \t]*=(.*)$/i)
    if (!match) continue
    const raw = match[2]!.trim()
    const quoted = raw.match(/^(["'])(.*)\1/)
    env[match[1]!] = quoted ? quoted[2]! : raw.replace(/\s+#.*$/, '')
  }
  return env
}

/**
 * The HTTP-actions origin, from every way it can be known, in precedence
 * order: the base module's own `NUXT_PUBLIC_CONVEX_SITE_URL` (a custom domain
 * or a self-hosted backend), the derived deployment URL, and finally the
 * client URL's cloud origin mapped to its `.site` twin — the platform-build
 * case, where `npx convex deploy --cmd-url-env-var-name` exposes only the
 * client URL and nothing else is derivable.
 */
export function resolveSiteUrl(input: {
  url?: string
  env: Record<string, string | undefined>
  derived: DerivedDeploymentUrls | null
}): string | undefined {
  const explicit = input.env.NUXT_PUBLIC_CONVEX_SITE_URL ?? input.derived?.siteUrl
  if (explicit) return explicit
  const cloudUrl = input.url ?? input.env.NUXT_PUBLIC_BACKEND_URL ?? input.env.NUXT_PUBLIC_CONVEX_URL ?? input.derived?.url
  return cloudUrl ? siteFromCloudUrl(cloudUrl) ?? undefined : undefined
}

/**
 * Derive the Convex URLs from the environment: explicit process env wins over
 * `.env.local` over `.env` (the same precedence Nuxt itself applies).
 *
 * - `CONVEX_SELF_HOSTED_URL` → that origin as `url`; `siteUrl` stays underived
 *   (self-hosted serves HTTP actions on a separate origin the slug can't
 *   predict — set `NUXT_PUBLIC_CONVEX_SITE_URL` explicitly).
 * - `CONVEX_URL` (+ `CONVEX_SITE_URL`) written beside `CONVEX_DEPLOYMENT` →
 *   taken verbatim (a `local:` / `anonymous:` backend on `127.0.0.1:<port>`,
 *   or the `--start` environment); a `.site` twin is mapped from a cloud URL.
 * - `CONVEX_DEPLOYMENT` (`dev:<slug>`, `prod:<slug>`, or a bare slug) → both
 *   cloud URLs. A local id without written URLs derives nothing.
 */
export function deriveDeploymentUrls(
  rootDir: string,
  env: Record<string, string | undefined> = process.env,
): DerivedDeploymentUrls | null {
  const merged: Record<string, string> = {}
  for (const name of ['.env', '.env.local']) {
    const path = join(rootDir, name)
    if (existsSync(path)) Object.assign(merged, parseEnvFile(readFileSync(path, 'utf-8')))
  }
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) merged[key] = value
  }

  const selfHosted = merged.CONVEX_SELF_HOSTED_URL
  if (selfHosted) {
    return { url: selfHosted.replace(/\/+$/, ''), source: 'self-hosted' }
  }

  const deployment = merged.CONVEX_DEPLOYMENT
  if (!deployment) return null

  // The CLI writes the deployment's own URLs next to its id — for a local or
  // anonymous backend they are the only way to know the port, and for a
  // cloud one they equal what the slug derives to. Take them when present.
  const written = merged.CONVEX_URL?.replace(/\/+$/, '')
  if (written) {
    const writtenSite = merged.CONVEX_SITE_URL?.replace(/\/+$/, '') ?? siteFromCloudUrl(written) ?? undefined
    return { url: written, ...(writtenSite ? { siteUrl: writtenSite } : {}), source: 'deployment', deployment }
  }
  // A local backend without its written URLs cannot be guessed at.
  if (isLocalDeploymentId(deployment)) return null

  const slug = deployment.includes(':') ? deployment.slice(deployment.lastIndexOf(':') + 1) : deployment
  if (!/^[a-z0-9-]+$/.test(slug)) return null
  return {
    url: `https://${slug}.convex.cloud`,
    siteUrl: `https://${slug}.convex.site`,
    source: 'deployment',
    deployment,
  }
}

/**
 * The deployment the app talks to, from what the dev server sees. The id and
 * URLs are not secrets (the client URL reaches every browser); deploy keys are
 * never read.
 */
export function computeDeployment(rootDir: string, env: Record<string, string | undefined>): DevtoolsDeployment {
  const derived = deriveDeploymentUrls(rootDir, env)
  const id = env.CONVEX_DEPLOYMENT ?? derived?.deployment
  const url = env.NUXT_PUBLIC_BACKEND_URL ?? env.NUXT_PUBLIC_CONVEX_URL ?? derived?.url
  const siteUrl = resolveSiteUrl({ env, derived })
  const urls = { ...(url ? { url } : {}), ...(siteUrl ? { siteUrl } : {}) }
  if (derived?.source === 'self-hosted') return { kind: 'self-hosted', ...urls }
  if (!id) return { kind: 'none', ...urls }
  const prefix = id.includes(':') ? id.slice(0, id.indexOf(':')) : ''
  const kind = ({ dev: 'cloud-dev', local: 'local', anonymous: 'anonymous', prod: 'production', preview: 'preview' } as const)[prefix] ?? 'cloud-dev'
  const name = id.slice(id.lastIndexOf(':') + 1)
  const cloud = kind === 'cloud-dev' || kind === 'production' || kind === 'preview'
  return {
    kind,
    id,
    ...urls,
    ...(cloud && /^[a-z0-9-]+$/.test(name) ? { dashboardUrl: `https://dashboard.convex.dev/d/${name}` } : {}),
  }
}
