import { BACKEND_ENV, type BackendEnvEntry } from '../env-registry'
import { CAPABILITIES } from './registry'
import type { CapabilityName } from './types'

const INTRO = `# Nothing here is required in development: the backend URL derives from the
# deployment the Convex CLI writes, and AUTH_SECRET, SITE_URL and
# BACKEND_ENVIRONMENT are provisioned on the first run. Add keys as you
# connect services, then run \`npx nuxt-backend env push\`.`

/** The platform's own names close the file: read, never authored here. */
const PLATFORM = `# ── Platform ──
# The Convex CLI appends CONVEX_DEPLOYMENT here. Read it; never rename it.`

/** The names pushed to dev deployments alone, with their values: on by default there. */
const DEV_ONLY = `# ── Dev only ──
# \`nuxt-backend dev\` sets these on a dev deployment, and \`env push\` never
# carries them to a preview or production.`

/** The capabilities whose names `.env.example` lists, in the order it groups them. */
const GROUP_ORDER: readonly CapabilityName[] = ['data', 'email', 'billing', 'ai', 'protection', 'monitoring']

/**
 * The `.env.example` that `init` writes: the names the env registry lists
 * there (its `dotenv`), grouped by purpose, then the dev-only names with
 * their values, and the platform's own group last.
 */
export function renderEnvExample(): string {
  const groups = GROUP_ORDER.map((name) => {
    const capability: { title: string, dotenvTitle?: string, env: readonly string[] } = CAPABILITIES[name]
    const listed = capability.env.filter((env) => {
      const entry = BACKEND_ENV[env as keyof typeof BACKEND_ENV] as BackendEnvEntry
      return entry.dotenv && !entry.devOnly
    })
    return [`# ── ${capability.dotenvTitle ?? capability.title} ──`, ...listed.map(env => `# ${env}=`)].join('\n')
  })
  const devOnly = (Object.entries(BACKEND_ENV) as Array<[string, BackendEnvEntry]>)
    .filter(([, entry]) => entry.dotenv && entry.devOnly)
    .map(([name, entry]) => `# ${name}=${entry.example ?? ''}`)
  return `${[INTRO, ...groups, [DEV_ONLY, ...devOnly].join('\n'), PLATFORM].join('\n\n')}\n`
}
