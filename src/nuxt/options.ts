import { installableProblems } from '../installable'
import { pagesOptionProblems } from '../pages'

// The `backend` options a 0.1 config may still hold: refused before anything
// reads them, each named with what replaced it.

/** The Module options sections on the page keys and on the options 0.2 removed, with their replacements. */
const PAGES_SECTION = 'https://nuxt-backend.dev/docs/reference/configuration/module-options#page-keys'
const REMOVED_SECTION = 'https://nuxt-backend.dev/docs/reference/configuration/module-options#removed-options'

/** Options 0.2 removed, each with what to do instead. */
const REMOVED_OPTIONS: Readonly<Record<string, string>> = {
  loginPath: 'The page guard follows `backend.pages.login`: set the path there.',
  mcp: 'The MCP endpoint for your users\' agents waits for a later release (https://nuxt-backend.dev/docs/start/roadmap): remove the option.',
  siteUrl: 'The site origin derives from `url`, the `.convex.site` twin of the `.convex.cloud` origin. A self-hosted backend or a custom domain sets `NUXT_PUBLIC_CONVEX_SITE_URL`, the base module\'s own variable.',
  autoEnv: '`npx nuxt-backend dev` provisions a new dev deployment\'s env once, and `npx nuxt-backend env push` forwards the rest: remove the option.',
  scaffold: '`npx nuxt-backend init` scaffolds the backend, and `npx nuxt-backend dev` scaffolds an app with no functions directory: remove the option.',
}

/**
 * Whether a value is a path of this site: one leading `/`, never `//` or
 * `/\` (which a browser reads as another origin), and nothing a URL would
 * reinterpret (a control character, a backslash), and still on this site
 * once a URL normalizes it (`/.//evil` is `//evil`).
 */
function isSitePath(value: unknown): value is string {
  const site = 'http://site.invalid'
  // eslint-disable-next-line no-control-regex -- a control character in a path is the thing refused
  if (typeof value !== 'string' || !/^\/(?![/\\])/.test(value) || /[\\\u0000-\u001F\u007F]/.test(value)) return false
  const url = new URL(value, site)
  return url.origin === site && new URL(url.pathname, site).origin === site
}

/**
 * Refuse a `redirects` option that is not a path of this site: the sign-in
 * page sends every person without a usable `?redirect=` there, so an
 * absolute or protocol-relative value would send them off-site.
 */
function assertRedirects(redirects: unknown): void {
  if (redirects === undefined) return
  const isObject = typeof redirects === 'object' && redirects !== null && !Array.isArray(redirects)
  const value = isObject ? (redirects as Record<string, unknown>).afterSignIn : redirects
  if (isObject && (value === undefined || isSitePath(value))) return
  const what = isObject ? 'backend.redirects.afterSignIn' : 'backend.redirects'
  const error = new Error(`nuxt-backend: \`${what}\` is ${JSON.stringify(value) ?? String(value)}. \`redirects\` takes \`{ afterSignIn }\`, a path of this site, such as '/app': one leading '/', never another origin.`)
  error.name = 'BackendOptionsError'
  throw error
}

/**
 * Refuse the module options 0.2 no longer takes: a removed option, and a page
 * value that is not a path (0.1 turned pages off with `false`). Ignored, they
 * would mount the page an app meant to turn off, or send signed-out visitors
 * to `/login` rather than the app's own sign-in path. One error names every
 * problem and links the Module options section that says what replaced it.
 * `moduleDependencies` calls it first, before the login path is read; setup
 * calls it again for options passed inline in `modules`.
 */
export function assertModuleOptions(options: unknown): void {
  if (!options || typeof options !== 'object') return
  const values = options as Record<string, unknown>
  assertRedirects(values.redirects)
  const installable = installableProblems(values.installable)
  if (installable.length > 0) {
    const error = new Error(`nuxt-backend: \`backend.installable\` cannot make a manifest:\n${installable.map(problem => `  - ${problem}`).join('\n')}\nSee https://nuxt-backend.dev/docs/build/email/notifications/installable#colours-maskable-icons-and-other-paths`)
    error.name = 'BackendOptionsError'
    throw error
  }
  const removed = Object.entries(REMOVED_OPTIONS).filter(([key]) => values[key] !== undefined)
  const problems = [
    ...pagesOptionProblems(values.pages),
    ...removed.map(([key, instead]) => `\`${key}\` is gone. ${instead}`),
  ]
  if (problems.length === 0) return
  // A page value that is no path is a page keys change, whatever else was removed.
  const sections = [...(problems.length > removed.length ? [PAGES_SECTION] : []), ...(removed.length > 0 ? [REMOVED_SECTION] : [])]
  const error = new Error(`nuxt-backend: these \`backend\` options changed in 0.2:\n${problems.map(problem => `  - ${problem}`).join('\n')}\nWhat to change: ${sections.join(' and ')}`)
  error.name = 'BackendOptionsError'
  throw error
}
