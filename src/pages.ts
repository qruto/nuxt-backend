import { DEFAULT_INVITATION_PATH, DEFAULT_LOGIN_PATH, DEFAULT_PRICING_PATH, DEFAULT_PROFILE_PATH, DEFAULT_SECURITY_PATH, DEFAULT_SETTINGS_PATH } from './convex/constants'

/**
 * Ready-made pages the module mounts by default. Each key is `true` (mount at
 * the default path), a string (mount at a custom path), or `false` (bring
 * your own page). An app page at the same path always wins — the module
 * detects it and skips its own.
 */
export interface ModulePagesOptions {
  /** Sign-in page (public). Default path `/login` — also the auth middleware's redirect target. */
  login?: boolean | string
  /** Pricing page (public). Default path `/pricing`. */
  pricing?: boolean | string
  /** Workspace / plan / credits settings (auth). Default path `/settings`. */
  settings?: boolean | string
  /** Account profile (auth). Default path `/profile`. */
  profile?: boolean | string
  /** Passkeys / sessions / deletion (auth). Default path `/security`. */
  security?: boolean | string
  /** Invitation accept page (auth). Default path `/accept-invitation` — keep in sync with the Convex-side `organization.invitationPath`. */
  acceptInvitation?: boolean | string
}

export type BackendPageKey = keyof ModulePagesOptions

export interface BackendPageDef {
  key: BackendPageKey
  defaultPath: string
  /** Page file name under `runtime/vue/pages/`. */
  file: string
  /** Mount behind the `auth` route middleware. */
  auth: boolean
}

export const BACKEND_PAGE_DEFS: readonly BackendPageDef[] = [
  { key: 'login', defaultPath: DEFAULT_LOGIN_PATH, file: 'login', auth: false },
  { key: 'pricing', defaultPath: DEFAULT_PRICING_PATH, file: 'pricing', auth: false },
  { key: 'settings', defaultPath: DEFAULT_SETTINGS_PATH, file: 'settings', auth: true },
  { key: 'profile', defaultPath: DEFAULT_PROFILE_PATH, file: 'profile', auth: true },
  { key: 'security', defaultPath: DEFAULT_SECURITY_PATH, file: 'security', auth: true },
  { key: 'acceptInvitation', defaultPath: DEFAULT_INVITATION_PATH, file: 'accept-invitation', auth: true },
]

/** `/settings/` → `/settings`; guarantees a leading slash; `''` stays `''`. */
export function normalizePagePath(path: string): string {
  const prefixed = path.startsWith('/') ? path : `/${path}`
  const trimmed = prefixed.replace(/\/+$/, '')
  return trimmed || '/'
}

/**
 * The mount path for one page key, or `null` when disabled (`pages: false`,
 * `pages.<key>: false`, or an empty custom path).
 */
export function resolvePagePath(pages: ModulePagesOptions | false | undefined, key: BackendPageKey): string | null {
  if (pages === false) return null
  const def = BACKEND_PAGE_DEFS.find(entry => entry.key === key)!
  const value = pages?.[key]
  if (value === false) return null
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized ? normalizePagePath(normalized) : null
  }
  return def.defaultPath
}

/** Every page key with its resolved path — `''` when disabled. Published to `runtimeConfig.public.backend.pages`. */
export function resolvedBackendPages(pages: ModulePagesOptions | false | undefined): Record<BackendPageKey, string> {
  return Object.fromEntries(
    BACKEND_PAGE_DEFS.map(def => [def.key, resolvePagePath(pages, def.key) ?? '']),
  ) as Record<BackendPageKey, string>
}

interface PageLike {
  path: string
  children?: PageLike[]
}

/**
 * Every absolute path an app already registered, children included (relative
 * child paths joined onto the parent), trailing slashes normalized — the set
 * the module checks before mounting a default page, so app pages always
 * shadow module pages.
 */
export function collectExistingPagePaths(pages: PageLike[], parent = ''): Set<string> {
  const paths = new Set<string>()
  for (const page of pages) {
    const absolute = page.path.startsWith('/')
      ? page.path
      : `${parent}/${page.path}`
    const normalized = normalizePagePath(absolute)
    paths.add(normalized)
    if (page.children?.length) {
      for (const child of collectExistingPagePaths(page.children, normalized === '/' ? '' : normalized)) {
        paths.add(child)
      }
    }
  }
  return paths
}
