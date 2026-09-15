/**
 * Derivation of the two Convex URLs from what `npx convex dev` actually
 * writes. Convex's CLI has no Nuxt detection — for a Nuxt app it records only
 * `CONVEX_DEPLOYMENT=dev:<slug>` in `.env.local` — so without derivation the
 * user must copy both `https://<slug>.convex.cloud` / `.site` URLs by hand
 * before anything works. Cloud deployment URLs are a pure function of the
 * slug, so we derive them and the copy-paste step disappears.
 *
 * Pure and injectable for tests: pass `env` and read files under `rootDir`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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
 * Minimal dotenv parse — KEY=VALUE lines, surrounding quotes stripped.
 * Exported for tests.
 *
 * @internal
 */
export function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const match = line.match(/^[ \t]*([A-Z_]\w*)[ \t]*=(.*)$/i)
    if (match) env[match[1]!] = match[2]!.trim().replace(/^["']|["']$/g, '')
  }
  return env
}

/**
 * `https://<slug>.convex.cloud` → `https://<slug>.convex.site`; null otherwise.
 * Exported for tests.
 *
 * @internal
 */
export function siteFromCloudUrl(url: string): string | null {
  const match = url.match(/^(https:\/\/[a-z0-9-]+\.convex)\.cloud\/?$/)
  return match ? `${match[1]}.site` : null
}

/**
 * The HTTP-actions origin, from every way it can be known, in precedence
 * order: an explicit site URL, the site-URL env names, the derived deployment
 * URL, and finally the client URL's cloud origin mapped to its `.site` twin —
 * the platform-build case, where `npx convex deploy --cmd-url-env-var-name`
 * exposes only the client URL and nothing else is derivable.
 */
export function resolveSiteUrl(input: {
  siteUrl?: string
  url?: string
  env: Record<string, string | undefined>
  derived: DerivedDeploymentUrls | null
}): string | undefined {
  const explicit = input.siteUrl ?? input.env.NUXT_PUBLIC_BACKEND_SITE_URL ?? input.env.NUXT_PUBLIC_CONVEX_SITE_URL ?? input.derived?.siteUrl
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
 *   predict — set `NUXT_PUBLIC_BACKEND_SITE_URL` explicitly).
 * - `CONVEX_DEPLOYMENT` (`dev:<slug>`, `prod:<slug>`, or a bare slug) → both
 *   cloud URLs.
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
  const slug = deployment.includes(':') ? deployment.slice(deployment.lastIndexOf(':') + 1) : deployment
  if (!/^[a-z0-9-]+$/.test(slug)) return null
  return {
    url: `https://${slug}.convex.cloud`,
    siteUrl: `https://${slug}.convex.site`,
    source: 'deployment',
    deployment,
  }
}
