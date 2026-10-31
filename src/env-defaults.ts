/**
 * `env push --defaults preview|dev` — the project's env defaults: the values
 * Convex gives every new deployment of a type when it creates one
 * (`convex env default set --type <type>`).
 *
 * A preview deployment is created by `convex deploy` and pushed to in the
 * same run, and its first push fails on the required AUTH_SECRET and SITE_URL
 * unless the build's `--cmd` sets them in between (`env push --preview`) or
 * the project's defaults already hold them. The defaults written here are
 * that pair, plus `BACKEND_ENVIRONMENT` (`preview`, or `development` for dev
 * defaults): mail in test mode and billing in the sandbox. Dev defaults also
 * publish the dev inbox to pages (`EMAIL_DEV_INBOX=1`).
 *
 * SITE_URL is the one value that cannot be made up. A preview's origin is its
 * own (one per branch on most hosts), so the default is whatever origin the
 * caller names (`--site-url`), and each preview build then sets its exact one
 * with `env push --preview <name> --site-url <its origin>`. A dev default is
 * the dev server's own origin unless named.
 *
 * Production never gets defaults from here. Values reach the Convex CLI on
 * stdin, as with `env push`; only names are ever read back.
 */
import { DEV_ONLY_DEPLOYMENT_ENV, REQUIRED_DEPLOYMENT_ENV } from './env-registry'
import { DEV_SITE_URL, envNames, executeEnvPush, generateAuthSecret, type EnvPushAction, type EnvPushRunResult, type ExecuteEnvPushOptions } from './env-push'
import { runConvex } from './convex-cli'

/** The deployment types `--defaults` writes. Never production. */
export const ENV_DEFAULT_TYPES = ['preview', 'dev'] as const

export type EnvDefaultType = (typeof ENV_DEFAULT_TYPES)[number]

/** The names `--defaults` writes: the required pair and the kind of deployment; dev defaults add the dev-only names (the dev inbox). */
export const ENV_DEFAULT_NAMES: readonly string[] = [...REQUIRED_DEPLOYMENT_ENV, 'BACKEND_ENVIRONMENT']

/** The names `--defaults` writes for one deployment type. */
function defaultNamesOf(type: EnvDefaultType): readonly string[] {
  return type === 'dev' ? [...ENV_DEFAULT_NAMES, ...Object.keys(DEV_ONLY_DEPLOYMENT_ENV)] : ENV_DEFAULT_NAMES
}

export interface EnvDefaultsPlanInput {
  type: EnvDefaultType
  /** The names the project already has defaults for. */
  defaultNames: readonly string[]
  /** The SITE_URL default: replaces one already set. Required for previews unless one is. */
  siteUrl?: string
  /** Names whose default may be replaced: AUTH_SECRET is generated again. */
  force?: ReadonlySet<string>
}

/** The value `--defaults` writes for a name, or `undefined` when only the caller can give it. */
function defaultValue(name: string, type: EnvDefaultType, siteUrl: string | undefined): string | undefined {
  if (name === 'AUTH_SECRET') return generateAuthSecret()
  if (name === 'SITE_URL') return siteUrl ?? (type === 'dev' ? DEV_SITE_URL : undefined)
  if (name in DEV_ONLY_DEPLOYMENT_ENV) return DEV_ONLY_DEPLOYMENT_ENV[name]
  return type === 'dev' ? 'development' : 'preview'
}

/**
 * Decide what to do per default. Pure; exported for tests — `runEnvDefaults`
 * is the flow the CLI calls.
 *
 * @internal
 */
export function planEnvDefaults({ type, defaultNames, siteUrl, force }: EnvDefaultsPlanInput): EnvPushAction[] {
  const present = new Set(defaultNames)
  return defaultNamesOf(type).map((name): EnvPushAction => {
    const replace = force?.has(name) || (name === 'SITE_URL' && siteUrl !== undefined)
    if (present.has(name) && !replace) return { name, action: 'skip', detail: 'already a project default (--force to replace)' }
    const value = defaultValue(name, type, siteUrl)
    if (value === undefined) {
      return { name, action: 'missing', detail: 'required — pass the origin new previews start with: --site-url <url>' }
    }
    const detail = name === 'AUTH_SECRET' ? `generated (${type} default)` : name === 'SITE_URL' ? (siteUrl === undefined ? 'dev default' : 'from --site-url') : `${type} default`
    return { name, action: present.has(name) ? 'update' : 'provision', value, detail }
  })
}

/**
 * The names the project has defaults for, for one deployment type (`convex
 * env default list --names-only`). Null when they cannot be read: no login,
 * or a deployment with no project, such as an anonymous one.
 */
export async function projectEnvDefaultNames(rootDir: string, type: EnvDefaultType): Promise<string[] | null> {
  try {
    const { stdout } = await runConvex(rootDir, ['env', 'default', 'list', '--names-only', '--type', type])
    return envNames(stdout)
  }
  catch {
    return null
  }
}

/** `convex env default set --type <type> NAME`, the value on its stdin (see `setDeploymentEnv`). */
export async function setProjectEnvDefault(rootDir: string, type: EnvDefaultType, name: string, value: string): Promise<void> {
  await runConvex(rootDir, ['env', 'default', 'set', '--type', type, name], { input: value })
}

/**
 * Write the project's env defaults for one deployment type. Null when they
 * cannot be read. With a required value missing — a preview's SITE_URL that
 * was not given — nothing is written: defaults without it would not let a
 * preview's first push through anyway.
 */
export async function runEnvDefaults(
  rootDir: string,
  options: { type: EnvDefaultType, siteUrl?: string, dryRun?: boolean, force?: ReadonlySet<string>, setEnv?: ExecuteEnvPushOptions['setEnv'] },
): Promise<EnvPushRunResult | null> {
  const defaultNames = await projectEnvDefaultNames(rootDir, options.type)
  if (defaultNames === null) return null
  const actions = planEnvDefaults({ type: options.type, defaultNames, ...(options.siteUrl ? { siteUrl: options.siteUrl } : {}), ...(options.force ? { force: options.force } : {}) })
  const missingRequired = actions.filter(action => action.action === 'missing').map(action => action.name)
  const results = missingRequired.length > 0
    ? actions.map(action => ({ action, outcome: 'skipped' as const }))
    : await executeEnvPush(rootDir, actions, {
        dryRun: options.dryRun,
        setEnv: options.setEnv ?? ((dir, name, value) => setProjectEnvDefault(dir, options.type, name, value)),
      })
  return { deployment: `defaults:${options.type}`, dev: false, deployedNames: defaultNames, results, missingRequired }
}
