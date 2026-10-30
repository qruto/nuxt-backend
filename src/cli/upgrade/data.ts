/**
 * `nuxt-backend upgrade`'s data half: the package's own data migrations
 * (src/convex/package-migrations.ts), run on the selected deployment through
 * the `backend` component's `migrations:status` and `migrations:run`, with
 * `convex run --component backend`. A deployment runs the code it was last
 * pushed, so one that predates them has neither function yet: the new
 * backend has to be pushed first.
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { ConvexCliError, runConvex } from '../../convex-cli'
import { PACKAGE_MIGRATIONS, type PackageMigrationStatus } from '../../convex/package-migrations'
import { configuredDeployment, deployKeyType, deploymentFlags, readEnvFiles } from '../../env-push'

/**
 * Where the data half ended: every migration `done`, some still `running`
 * on the deployment's scheduler, or `pending` (a dry run); `none` when the
 * package has none; `skipped` when no deployment answered; `needs-push`
 * when the deployment runs an older backend; `failed` when a migration
 * stopped on an error.
 */
export type DataState = 'done' | 'running' | 'pending' | 'none' | 'skipped' | 'needs-push' | 'failed'

/** What the data half did, on which deployment. */
export interface DataReport {
  deployment: 'dev' | 'production'
  state: DataState
  /** Why it was skipped, needs a push, or failed. */
  reason?: string
  /** Each package migration and where the deployment is with it; the registry's, unread, when the deployment did not answer. */
  migrations: PackageMigrationStatus[]
}

/** The component the scaffold mounts, whose functions the migrations are. */
const COMPONENT = 'backend'

/**
 * A `convex run` that found no such function: the deployment runs a backend
 * older than the migrations. The CLI says "Could not find function …" and
 * then lists the component's functions, one `• module:name` a line; the
 * error keeps the last lines of its output, which are that list.
 */
function missingFunction(error: unknown): boolean {
  const text = error instanceof ConvexCliError ? error.stderrTail : String(error)
  return /could not find function|•\s*[\w/.-]+:\w+/i.test(text)
}

/** One of the component's migration functions, run on the deployment. */
async function call(rootDir: string, fn: 'status' | 'run', prod: boolean): Promise<PackageMigrationStatus[]> {
  const { stdout } = await runConvex(rootDir, ['run', '--component', COMPONENT, ...deploymentFlags({ prod }), `migrations:${fn}`, '{}'], { timeout: 60_000 })
  return JSON.parse(stdout) as PackageMigrationStatus[]
}

/** The state a set of migrations is in, together. */
function overall(migrations: readonly PackageMigrationStatus[]): DataState {
  if (migrations.length === 0) return 'none'
  if (migrations.some(migration => migration.state === 'failed')) return 'failed'
  if (migrations.every(migration => migration.state === 'done')) return 'done'
  return migrations.some(migration => migration.state === 'running') ? 'running' : 'pending'
}

/** The registry's migrations, as a deployment that did not answer is reported. */
function unread(): PackageMigrationStatus[] {
  return PACKAGE_MIGRATIONS.map(({ name, since, does }) => ({ name, since, does, state: 'pending', processed: 0 }))
}

export interface DataOptions {
  prod: boolean
  /** Read where each migration stands, and start none. */
  dryRun: boolean
  /** How long to follow the migrations once started, in milliseconds; they go on after it. */
  wait?: number
  /** How often to read their state while following them. */
  interval?: number
  print?: (line: string) => void
}

/** Whether a set of migrations is at rest: all done, none to run, or one failed. */
const settled = (state: DataState) => state === 'done' || state === 'none' || state === 'failed'

/** Where the deployment is with each migration; a report instead when it did not tell. */
async function readStatus(rootDir: string, options: DataOptions): Promise<PackageMigrationStatus[] | DataReport> {
  const deployment = options.prod ? 'production' : 'dev'
  if (!options.prod && !configuredDeployment(rootDir) && deployKeyType({ ...readEnvFiles(rootDir), ...process.env }) === null) {
    return { deployment, state: 'skipped', reason: 'no dev deployment is configured: `npx nuxt-backend dev` sets one up', migrations: unread() }
  }
  try {
    return await call(rootDir, 'status', options.prod)
  }
  catch (error) {
    if (missingFunction(error)) return { deployment, state: 'needs-push', reason: `the ${deployment} deployment runs a backend older than this version: push it first`, migrations: unread() }
    return { deployment, state: options.prod ? 'failed' : 'skipped', reason: `the ${deployment} deployment did not answer: ${error instanceof Error ? error.message : String(error)}`, migrations: unread() }
  }
}

/** Follow started migrations until they settle or `wait` runs out; a read that fails is tried again. */
async function follow(rootDir: string, started: PackageMigrationStatus[], options: DataOptions): Promise<PackageMigrationStatus[]> {
  let migrations = started
  const deadline = Date.now() + (options.wait ?? 120_000)
  while (!settled(overall(migrations)) && Date.now() < deadline) {
    options.print?.(`[nuxt-backend] upgrade: ${migrations.filter(migration => migration.state === 'done').length} of ${migrations.length} package migrations done…`)
    await sleep(options.interval ?? 1_500)
    migrations = await call(rootDir, 'status', options.prod).catch(() => migrations)
  }
  return migrations
}

/**
 * Run the package migrations the deployment has not finished, and follow
 * them until they are done, one fails, or `wait` runs out (they go on, on
 * the deployment's scheduler). One that failed or was canceled on an earlier
 * run is started again, and resumes where it stopped. A dry run reads where
 * they stand.
 */
export async function migrateData(rootDir: string, options: DataOptions): Promise<DataReport> {
  const deployment = options.prod ? 'production' : 'dev'
  const status = await readStatus(rootDir, options)
  if (!Array.isArray(status)) return status
  const before = overall(status)
  if (options.dryRun || before === 'done' || before === 'none') return { deployment, state: before, migrations: status }
  let started: PackageMigrationStatus[]
  try {
    started = await call(rootDir, 'run', options.prod)
  }
  catch (error) {
    return { deployment, state: 'failed', reason: `starting the migrations failed: ${error instanceof Error ? error.message : String(error)}`, migrations: status }
  }
  const migrations = await follow(rootDir, started, options)
  const state = overall(migrations)
  return { deployment, state: state === 'pending' ? 'running' : state, migrations }
}
