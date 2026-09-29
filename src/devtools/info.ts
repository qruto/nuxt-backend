import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { BACKEND_MCP_SCOPES, DEFAULT_MCP_EXCHANGE_PATH, type BackendMcpScope } from '../convex/constants'
import { deriveDeploymentUrls, resolveSiteUrl } from '../deployment'
import { collectPreflightFindings, OPTIONAL_DEPLOYMENT_ENV, REQUIRED_DEPLOYMENT_ENV } from '../preflight'
import { BACKEND_PAGE_DEFS, type BackendPageKey } from '../pages'
import type { BackendMcpToolName } from '../runtime/server/mcp/builtin'
import type {
  DevtoolsDeployment,
  DevtoolsDeploymentEnv,
  DevtoolsEnvTier,
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
  workspaces?: boolean
}

/** The resolved `backend.mcp` facts the panel needs (`null` = disabled). */
export interface DevtoolsMcpInput {
  route: string
  builtin?: false | Partial<Record<string, boolean>>
}

export interface BuildDevtoolsInfoInput {
  rootDir: string
  /**
   * What the dev server sees: `.env`, `.env.local` and its process env,
   * merged. Reduced to presence booleans, never values.
   */
  env: Record<string, string | undefined>
  siteUrlConfigured: boolean
  options: DevtoolsOptionsInput
  pages: DevtoolsPageInfo[]
  mcp: DevtoolsMcpInput | null
  versions: Record<string, string>
  functionsDir: string
  /** The last read of the deployment's env names (`null` until one ran). */
  deploymentEnv: DevtoolsDeploymentEnv | null
  /** The required names a clean `env push` put on the deployment, when known. */
  provisionedNames: ReadonlySet<string> | undefined
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
 * Presence booleans over the two-tier deployment env contract, for a set of
 * names. Only names cross the RPC — the values (secrets among them) never
 * leave the process.
 */
export function envTier(isSet: (name: string) => boolean): DevtoolsEnvTier {
  return {
    required: Object.fromEntries(REQUIRED_DEPLOYMENT_ENV.map(name => [name, isSet(name)])),
    optional: Object.fromEntries(Object.keys(OPTIONAL_DEPLOYMENT_ENV).map(name => [name, isSet(name)])),
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

// The OAuth scope each built-in tool asks for (the `scope` in its tool file;
// a unit test pins the two together). Exhaustive: adding a tool to
// `BackendMcpToolName` without listing it here fails compilation, so the
// panel's tool list can't silently go stale.
const BUILTIN_TOOL_SCOPES: Record<BackendMcpToolName, BackendMcpScope> = {
  'profile-get': 'profile',
  'profile-update': 'profile:write',
  'billing-plans': 'billing:read',
  'billing-subscription': 'billing:read',
  'credits-balance': 'billing:read',
  'billing-checkout-link': 'billing:checkout',
  'billing-portal-link': 'billing:checkout',
  'workspace-list': 'workspace:read',
  'workspace-members': 'workspace:read',
}

/** The agent surface as the panel reports it, per-tool disables applied. */
export function computeMcpStatus(mcp: DevtoolsMcpInput | null): DevtoolsMcpStatus {
  if (!mcp) return { enabled: false, tools: [], scopes: [] }
  const disabled = mcp.builtin
  return {
    enabled: true,
    route: mcp.route,
    exchangePath: DEFAULT_MCP_EXCHANGE_PATH,
    tools: Object.entries(BUILTIN_TOOL_SCOPES).map(([name, scope]) => ({
      name,
      scope,
      enabled: disabled !== false && disabled?.[name] !== false,
    })),
    scopes: [...BACKEND_MCP_SCOPES],
  }
}

/**
 * Assemble the `getInfo()` payload. Pure — the module calls this per RPC
 * request (findings stay live), tests call it with sentinel env values to
 * pin the redaction guarantee: nothing from `env` beyond presence booleans
 * appears in the result.
 */
export function buildDevtoolsInfo(input: BuildDevtoolsInfoInput): DevtoolsServerInfo {
  const { options, deploymentEnv } = input
  const deployedNames = new Set(input.provisionedNames)
  const read = deploymentEnv?.names
  if (read) {
    for (const tier of [read.required, read.optional]) {
      for (const [name, set] of Object.entries(tier)) if (set) deployedNames.add(name)
    }
  }
  return {
    functionsDir: input.functionsDir,
    options: {
      installation: options.installation ?? 'default',
      scaffold: options.scaffold !== false,
      css: options.css !== false,
      autoEnv: options.autoEnv !== false,
      workspaces: options.workspaces !== false,
      authRoute: options.authRoute ?? '/api/auth',
      loginPath: options.loginPath ?? null,
      pagesEnabled: options.pages !== false,
    },
    deployment: computeDeployment(input.rootDir, input.env),
    pages: input.pages,
    findings: collectPreflightFindings({
      env: input.env,
      siteUrlConfigured: input.siteUrlConfigured,
      ...(input.mcp ? { mcp: { route: input.mcp.route } } : {}),
      deployedNames,
    }),
    env: {
      visible: envTier(name => Boolean(input.env[name])),
      deployment: deploymentEnv,
    },
    mcp: computeMcpStatus(input.mcp),
    versions: input.versions,
  }
}

/**
 * Map a backend source file named by the panel (`"billing.ts"`, extension
 * optional) to its path under the functions dir, for the DevTools
 * open-in-editor action. The name crosses the RPC from the iframe, so only
 * plain relative paths inside the functions dir resolve (segments split on
 * either separator, so a backslash-spelled traversal is caught on Windows
 * too); anything else returns `{}`.
 */
export function resolveBackendSource(rootDir: string, functionsDir: string, file: string): { filepath?: string } {
  if (!file || file.split(/[\\/]/).some(segment => segment === '' || segment === '.' || segment === '..')) {
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
      // fallow-ignore-next-line security-sink -- the names come from the fixed list above, never from a request; dev-only panel; verified 2026-09-17
      versions[name] = (require(`${name}/package.json`) as { version: string }).version
    }
    catch {
      // Not resolvable from the app — leave the entry out.
    }
  }
  return versions
}
