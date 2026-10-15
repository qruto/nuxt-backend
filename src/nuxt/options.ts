import { pagesOptionProblems } from '../pages'

// The `backend` options a 0.1 config may still hold: refused before anything
// reads them, each named with what replaced it.

/** The Upgrade section that lists every option 0.2 removed, with its replacement. */
const UPGRADE_URL = 'https://nuxt-backend.dev/docs/ship/migrate/upgrade#pages-the-stylesheet-and-the-webhook-log-are-always-on'

/** Options 0.2 removed, each with what to do instead. */
const REMOVED_OPTIONS: Readonly<Record<string, string>> = {
  loginPath: 'The `auth` middleware follows `backend.pages.login`: set the path there.',
  css: 'The stylesheet always loads, layered, so your own CSS wins: restyle through the `--bk-*` tokens or the `data-*` hooks.',
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
  const problems = [
    ...pagesOptionProblems(values.pages),
    ...Object.entries(REMOVED_OPTIONS)
      .filter(([key]) => values[key] !== undefined)
      .map(([key, instead]) => `\`${key}\` is gone. ${instead}`),
  ]
  if (problems.length === 0) return
  const error = new Error(`nuxt-backend: these \`backend\` options changed in 0.2:\n${problems.map(problem => `  - ${problem}`).join('\n')}\nWhat to change: ${UPGRADE_URL}`)
  error.name = 'BackendOptionsError'
  throw error
}
