import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { collectPreflightFindings, OPTIONAL_DEPLOYMENT_ENV, REQUIRED_DEPLOYMENT_ENV } from '../preflight'
import { BACKEND_PAGE_DEFS, type BackendPageKey } from '../pages'
import type { BackendAppConfigInput } from '../runtime/config'
import type { BackendMcpToolName } from '../runtime/server/mcp/builtin'
import type {
  DevtoolsEnvPresence,
  DevtoolsMcpStatus,
  DevtoolsPageInfo,
  DevtoolsServerInfo,
} from './rpc-types'

/**
 * The `backend.*` options the panel snapshot reads — structural (not
 * `ModuleOptions`) so this file never imports the module entry.
 */
export interface DevtoolsOptionsInput {
  installation?: string
  scaffold?: 'auto' | false
  css?: boolean
  autoEnv?: boolean
  authRoute?: string
  loginPath?: string
  pages?: unknown
}

/** The resolved `backend.mcp` facts the panel needs (`null` = disabled). */
export interface DevtoolsMcpInput {
  route: string
  builtin?: false | Partial<Record<string, boolean>>
}

export interface BuildDevtoolsInfoInput {
  /** Environment to inspect — reduced to presence booleans, never values. */
  env: Record<string, string | undefined>
  siteUrlConfigured: boolean
  options: DevtoolsOptionsInput
  pages: DevtoolsPageInfo[]
  appConfig: BackendAppConfigInput | undefined
  mcp: DevtoolsMcpInput | null
  versions: Record<string, string>
  functionsDir: string
}

/**
 * The `shadowed` flag per resolved page: an app page already occupies the
 * path (the `taken` set `collectExistingPagePaths` produced inside
 * `extendPages` — the same check the module uses to skip mounting). Disabled
 * pages are omitted.
 */
export function computeDevtoolsPages(
  resolved: Record<BackendPageKey, string>,
  taken: ReadonlySet<string>,
): DevtoolsPageInfo[] {
  return BACKEND_PAGE_DEFS.flatMap((def) => {
    const path = resolved[def.key]
    if (!path) return []
    return [{ key: def.key, path, auth: def.auth, shadowed: taken.has(path) }]
  })
}

/**
 * Presence booleans over the two-tier deployment env contract. Only names
 * cross the RPC — the values (secrets among them) never leave the process.
 */
export function collectEnvPresence(env: Record<string, string | undefined>): DevtoolsEnvPresence {
  return {
    required: Object.fromEntries(REQUIRED_DEPLOYMENT_ENV.map(name => [name, Boolean(env[name])])),
    optional: Object.fromEntries(Object.keys(OPTIONAL_DEPLOYMENT_ENV).map(name => [name, Boolean(env[name])])),
  }
}

// Exhaustiveness pin: adding a tool to `BackendMcpToolName` without listing it
// here fails compilation, so the panel's tool count can't silently go stale.
const BUILTIN_TOOL_NAMES: Record<BackendMcpToolName, true> = {
  'profile-get': true,
  'profile-update': true,
  'billing-plans': true,
  'billing-subscription': true,
  'credits-balance': true,
  'billing-checkout-link': true,
  'billing-portal-link': true,
  'workspace-list': true,
  'workspace-members': true,
}

/** The agent surface as the panel reports it, per-tool disables applied. */
export function computeMcpStatus(mcp: DevtoolsMcpInput | null): DevtoolsMcpStatus {
  if (!mcp) return { enabled: false, builtinTools: [] }
  if (mcp.builtin === false) return { enabled: true, route: mcp.route, builtinTools: [] }
  const disabled = mcp.builtin
  return {
    enabled: true,
    route: mcp.route,
    builtinTools: Object.keys(BUILTIN_TOOL_NAMES).filter(name => disabled?.[name] !== false),
  }
}

/**
 * Assemble the `getInfo()` payload. Pure — the module calls this per RPC
 * request (findings stay live), tests call it with sentinel env values to
 * pin the redaction guarantee: nothing from `env` beyond presence booleans
 * appears in the result.
 */
export function buildDevtoolsInfo(input: BuildDevtoolsInfoInput): DevtoolsServerInfo {
  const { options } = input
  return {
    functionsDir: input.functionsDir,
    options: {
      installation: options.installation ?? 'default',
      scaffold: options.scaffold !== false,
      css: options.css !== false,
      autoEnv: options.autoEnv !== false,
      authRoute: options.authRoute ?? '/api/auth',
      loginPath: options.loginPath ?? null,
      pagesEnabled: options.pages !== false,
    },
    pages: input.pages,
    findings: collectPreflightFindings({
      env: input.env,
      siteUrlConfigured: input.siteUrlConfigured,
      ...(input.mcp ? { mcp: { route: input.mcp.route } } : {}),
    }),
    env: collectEnvPresence(input.env),
    appConfig: {
      billing: {
        plans: [...(input.appConfig?.billing?.plans ?? [])],
        packs: [...(input.appConfig?.billing?.packs ?? [])],
      },
      brand: {
        name: input.appConfig?.brand?.name,
        logo: input.appConfig?.brand?.logo,
      },
    },
    mcp: computeMcpStatus(input.mcp),
    versions: input.versions,
  }
}

/**
 * Map a backend source file named by the panel (`"billing.ts"`, extension
 * optional) to its path under the functions dir, for the DevTools
 * open-in-editor action. The name crosses the RPC from the iframe, so only
 * plain relative paths inside the functions dir resolve; anything else
 * returns `{}`.
 */
export function resolveBackendSource(rootDir: string, functionsDir: string, file: string): { filepath?: string } {
  if (!file || file.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
    return {}
  }
  const base = join(rootDir, functionsDir, file)
  for (const candidate of [base, `${base}.ts`, `${base}.js`]) {
    if (existsSync(candidate)) return { filepath: candidate }
  }
  return {}
}

/**
 * Installed versions of the packages a bug report needs, resolved from the
 * app (this package and its base reach the app via the module, so both are
 * resolvable from `rootDir`). Missing entries are simply omitted.
 */
export function readPackageVersions(rootDir: string): Record<string, string> {
  const require = createRequire(join(rootDir, 'package.json'))
  const versions: Record<string, string> = {}
  for (const name of ['nuxt-backend', 'nuxt-convex-module', 'convex', 'nuxt']) {
    try {
      versions[name] = (require(`${name}/package.json`) as { version: string }).version
    }
    catch {
      // Not resolvable from the app — leave the entry out.
    }
  }
  return versions
}
