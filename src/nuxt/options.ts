import { pagesOptionProblems } from '../pages'

// The `backend` options a 0.1 config may still hold: refused before anything
// reads them, each named with what replaced it.

/** The Upgrade sections that list the options 0.2 removed, with their replacements. */
const PAGES_SECTION = 'https://nuxt-backend.dev/docs/ship/releases/upgrade#page-paths-the-stylesheet-and-the-webhook-log'
const ENVIRONMENT_SECTION = 'https://nuxt-backend.dev/docs/ship/releases/upgrade#one-variable-says-what-kind-of-deployment-this-is'

/** Options 0.2 removed, each with what to do instead and the Upgrade section that says more. */
const REMOVED_OPTIONS: Readonly<Record<string, { instead: string, section: string }>> = {
  loginPath: { instead: 'The page guard follows `backend.pages.login`: set the path there.', section: PAGES_SECTION },
  mcp: { instead: 'The MCP endpoint for your users\' agents waits for the next release (https://nuxt-backend.dev/docs/start/roadmap): remove the option.', section: PAGES_SECTION },
  siteUrl: { instead: 'The site origin derives from `url`, the `.convex.site` twin of the `.convex.cloud` origin. A self-hosted backend or a custom domain sets `NUXT_PUBLIC_CONVEX_SITE_URL`, the base module\'s own variable.', section: ENVIRONMENT_SECTION },
  autoEnv: { instead: '`npx nuxt-backend dev` provisions a new dev deployment\'s env once, and `npx nuxt-backend env push` forwards the rest: remove the option.', section: ENVIRONMENT_SECTION },
  scaffold: { instead: '`npx nuxt-backend init` scaffolds the backend, and `npx nuxt-backend dev` scaffolds an app with no functions directory: remove the option.', section: ENVIRONMENT_SECTION },
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
 * problem and links the Upgrade page. `moduleDependencies` calls it first,
 * before the login path is read; setup calls it again for options passed
 * inline in `modules`.
 */
export function assertModuleOptions(options: unknown): void {
  if (!options || typeof options !== 'object') return
  const values = options as Record<string, unknown>
  assertRedirects(values.redirects)
  const removed = Object.entries(REMOVED_OPTIONS).filter(([key]) => values[key] !== undefined)
  const problems = [
    ...pagesOptionProblems(values.pages),
    ...removed.map(([key, { instead }]) => `\`${key}\` is gone. ${instead}`),
  ]
  if (problems.length === 0) return
  // A page value that is no path is a pages change, whatever else was removed.
  const sections = [...new Set([...(problems.length > removed.length ? [PAGES_SECTION] : []), ...removed.map(([, { section }]) => section)])]
  const error = new Error(`nuxt-backend: these \`backend\` options changed in 0.2:\n${problems.map(problem => `  - ${problem}`).join('\n')}\nWhat to change: ${sections.join(' and ')}`)
  error.name = 'BackendOptionsError'
  throw error
}
