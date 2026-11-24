import { BACKEND_PAGE_DEFS, type ModulePagesOptions } from '../pages'

// Which auth an app runs. Better Auth is the package's own and the default:
// every page, the page guard, workspaces, billing, AI credits and the account
// features are written against it. Convex Auth is an opt-in: the base
// module's own integration of @convex-dev/auth, sign-in only, with what
// Better Auth carries turned off rather than rebuilt over it.

/** The two auth providers: `'better-auth'` (the default) and `'convex-auth'`. */
export type AuthProvider = 'better-auth' | 'convex-auth'

/** Where the docs say what Convex Auth mode runs and what it turns off. */
export const CONVEX_AUTH_DOCS_URL = 'https://nuxt-backend.dev/docs/build/auth/convex-auth'

/** The provider an option names: `'convex-auth'` only when it says so, else Better Auth. */
export function authProviderOf(option: unknown): AuthProvider {
  return option === 'convex-auth' ? 'convex-auth' : 'better-auth'
}

/** Refuse an `auth` option that names neither provider, rather than read it as Better Auth. */
export function authOptionProblems(option: unknown): string[] {
  if (option === undefined || option === 'better-auth' || option === 'convex-auth') return []
  return [`\`backend.auth\` is \`${JSON.stringify(option) ?? typeof option}\`. It takes \`'better-auth'\` (the default) or \`'convex-auth'\`.`]
}

/**
 * The base module's auth switches for a provider. Better Auth: its
 * integration with the package's client, and Convex Auth off even where
 * @convex-dev/auth is installed. Convex Auth: the base module's own
 * integration, Better Auth off, and its Polar integration off with it, as the
 * package's billing runs on Better Auth's accounts.
 */
export function baseAuthOverrides(provider: AuthProvider, { betterAuth, loginPath }: { betterAuth: Record<string, unknown>, loginPath: string }): Record<string, unknown> {
  if (provider === 'convex-auth') return { betterAuth: false, convexAuth: { loginPath }, polar: false }
  return { betterAuth, convexAuth: false, polar: true }
}

/**
 * The `pages` option with every page off, for Convex Auth mode: each
 * ready-made page reads the Better Auth session. The paths stay published as
 * `false`, so a link to one is never drawn.
 */
export function pagesOff(): ModulePagesOptions {
  return Object.fromEntries(BACKEND_PAGE_DEFS.map(def => [def.key, false])) as ModulePagesOptions
}

/** What a Convex Auth app is told once, at startup and by doctor: what runs, and what is off. */
export const CONVEX_AUTH_NOTICE = 'Convex Auth mode (`backend.auth: \'convex-auth\'`): sign-in runs on @convex-dev/auth through the base module (magic links, OAuth, passkeys, passwords). '
  + 'The package\'s pages, its page guard, workspaces, billing, AI credits and the account features are off, as they run on Better Auth\'s accounts. '
  + 'Guard a page with `definePageMeta({ middleware: \'convex-auth\' })`.'
