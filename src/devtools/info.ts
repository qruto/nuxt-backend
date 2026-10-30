import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { computeDeployment } from '../deployment'
import { detectCapabilities } from '../capabilities'
import { appMonitoringDsn, monitoringSdkInstalled } from '../monitoring'
import { collectPreflightFindings, OPTIONAL_DEPLOYMENT_ENV, REQUIRED_DEPLOYMENT_ENV, type PreflightFinding } from '../preflight'
import { BACKEND_PAGE_DEFS, type BackendPageKey } from '../pages'
import type {
  DevtoolsDeploymentEnv,
  DevtoolsEnvTier,
  DevtoolsPageInfo,
  DevtoolsServerInfo,
} from './rpc-types'

/**
 * The `backend.*` options the panel snapshot reads — structural (not
 * `ModuleOptions`) so this file never imports the module entry.
 */
export interface DevtoolsOptionsInput {
  authRoute?: string
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
  versions: Record<string, string>
  functionsDir: string
  /** The last read of the deployment's env names (`null` until one ran). */
  deploymentEnv: DevtoolsDeploymentEnv | null
  /** The required names a clean `env push` put on the deployment, when known. */
  provisionedNames: ReadonlySet<string> | undefined
  /** The panel's last doctor run, which the capability console reads beside the preflight (`null`: none counts). */
  doctor?: DevtoolsLastDoctorRun | null
}

/**
 * The panel's doctor runs as the capability console reads them: when the last one
 * ran, and the findings of every capability a run covered, each capability's from the
 * newest run that covered it.
 */
export interface DevtoolsLastDoctorRun {
  ranAt: number
  findings: readonly PreflightFinding[]
}

/**
 * The `shadowed` flag per resolved page: an app page already occupies the
 * path (the `taken` set `collectExistingPagePaths` produced inside
 * `extendPages` — the same check the module uses to skip mounting).
 */
export function computeDevtoolsPages(
  resolved: Record<BackendPageKey, string>,
  taken: ReadonlySet<string>,
): DevtoolsPageInfo[] {
  return BACKEND_PAGE_DEFS.map((def) => {
    const path = resolved[def.key]
    return { key: def.key, path, auth: def.auth, shadowed: taken.has(path) }
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
 * The names the deployment holds: the provisioned ones, and every one its
 * last read listed.
 */
function deployedNamesOf({ provisionedNames, deploymentEnv }: BuildDevtoolsInfoInput): Set<string> {
  const deployedNames = new Set(provisionedNames)
  const read = deploymentEnv?.names
  if (!read) return deployedNames
  for (const tier of [read.required, read.optional]) {
    for (const [name, set] of Object.entries(tier)) if (set) deployedNames.add(name)
  }
  return deployedNames
}

/**
 * Assemble the `getInfo()` payload. Pure — the module calls this per RPC
 * request (findings stay live), tests call it with sentinel env values to
 * pin the redaction guarantee: nothing from `env` beyond presence booleans
 * appears in the result.
 */
export function buildDevtoolsInfo(input: BuildDevtoolsInfoInput): DevtoolsServerInfo {
  const { options, deploymentEnv } = input
  const deployedNames = deployedNamesOf(input)
  const read = deploymentEnv?.names
  const deployment = computeDeployment(input.rootDir, input.env)
  const findings = collectPreflightFindings({
    env: input.env,
    siteUrlConfigured: input.siteUrlConfigured,
    deployedNames,
  })
  // Doctor adds the checks only it can make (the routes, the catalog, the
  // mounts). The preflight is re-read on every call, so where both report an
  // id, its live result wins over the run's.
  const checked = [...new Map([...input.doctor?.findings ?? [], ...findings].map(finding => [finding.id, finding])).values()]
  const capabilities = detectCapabilities({
    env: input.env,
    // The app reports errors once the SDK is wired: installed, with a DSN.
    app: { monitoring: Boolean(appMonitoringDsn(input.env)) && monitoringSdkInstalled(input.rootDir) },
    // Only a read lists every name; the provisioned ones say what is
    // there, not what is missing.
    deployed: read ? deployedNames : null,
    ...input.provisionedNames ? { provisioned: input.provisionedNames } : {},
    deployment: deployment.kind,
    findings: checked,
  })
  return {
    functionsDir: input.functionsDir,
    options: {
      authRoute: options.authRoute ?? '/api/auth',
    },
    deployment,
    pages: input.pages,
    findings,
    capabilities,
    doctorRanAt: input.doctor?.ranAt ?? null,
    env: {
      visible: envTier(name => Boolean(input.env[name])),
      deployment: deploymentEnv,
    },
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
