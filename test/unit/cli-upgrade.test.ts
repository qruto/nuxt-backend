import { randomBytes } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCommand } from 'citty'
import { main } from '../../src/cli/main'
import { PRODUCTION_DEPLOY, type UpgradeReport } from '../../src/cli/upgrade'
import { migrateData } from '../../src/cli/upgrade/data'
import { backfillPools, POOL_BACKFILL } from '../../src/cli/upgrade/pools'
import { ConvexCliError, runConvex } from '../../src/convex-cli'
import { PACKAGE_MIGRATIONS, type PackageMigrationStatus } from '../../src/convex/package-migrations'
import { checkoutBaseStarter, checkoutDriftedStarter, CUSTOM, customizeStarter, DRIFT, removeFixture } from '../helpers/upgrade-fixture'

// `nuxt-backend upgrade` on the upgrade fixture (test/fixtures/upgrade/): the
// starter as the last release shipped it, with a file, a mount and a
// forwarded env name taken out (DRIFT) where the scaffold's repair is under
// test, so there is always something to repair. It repairs the scaffold and runs
// the package's data migrations, and rewrites none of the app's code. A dry
// run shows each scaffold change as a diff and writes nothing, the run writes
// what the dry run showed, and a second run changes nothing. The deployment
// is a stub of `convex run`; the migrations themselves run in
// test/convex-component/package-migrations.test.ts.

vi.mock('../../src/convex-cli', async importOriginal => ({ ...await importOriginal<typeof import('../../src/convex-cli')>(), runConvex: vi.fn() }))

const parent = join(tmpdir(), 'nuxt-backend-cli-upgrade')
let dir: string
let stdout: string[]
let stderr: string[]

beforeEach(() => {
  for (const name of ['CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT', 'CONVEX_DEPLOYMENT_TOKEN']) vi.stubEnv(name, undefined)
  vi.mocked(runConvex).mockReset()
  stdout = []
  stderr = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void stdout.push(args.map(String).join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void stderr.push(args.map(String).join(' ')))
})

afterEach(() => {
  if (dir) removeFixture(dir)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  process.exitCode = undefined
})

async function upgrade(...args: string[]) {
  stdout = []
  await runCommand(main, { rawArgs: ['upgrade', ...args, '--cwd', dir] })
}

async function upgradeJson(...args: string[]): Promise<UpgradeReport> {
  await upgrade(...args, '--json')
  return JSON.parse(stdout.join('\n')) as UpgradeReport
}

/** Every file of the project and its text. */
function snapshot(root = dir, prefix = ''): Record<string, string> {
  return Object.fromEntries(readdirSync(join(root, prefix)).flatMap((name) => {
    const path = prefix ? `${prefix}/${name}` : name
    return statSync(join(root, path)).isDirectory() ? Object.entries(snapshot(root, path)) : [[path, readFileSync(join(root, path), 'utf-8')]]
  }))
}

/** A deploy key of this type, made up for the test. */
function deployKey(type: string): string {
  return `${type}:test-app|${randomBytes(12).toString('hex')}`
}

const statuses = (state: PackageMigrationStatus['state'], extra: Partial<PackageMigrationStatus> = {}): PackageMigrationStatus[] =>
  PACKAGE_MIGRATIONS.map(({ name, since, does }) => ({ name, since, does, state, processed: state === 'done' ? 3 : 0, ...extra }))

/** The probe that has the deployment list its component paths. */
const LISTING = ['run', '--component', '__nuxt_backend_component_listing__', '--inline-query', 'return null']

/** The Convex CLI's refusal of an unknown component path, which lists the ones mounted. */
const listed = (components: string[]) => new ConvexCliError('convex run exited with code 1', { code: 1, signal: null, timedOut: false, stderrTail: 'Omit `--component` to target the app root.', components })

/** `convex run` naming a function the component does not have. */
const absent = () => new ConvexCliError('convex run exited with code 1', { code: 1, signal: null, timedOut: false, stderrTail: '• lib:get', missingFunction: true })

/** `convex run` answering `migrations:status` and `migrations:run` with these, in turn. */
function deployment(...answers: Array<PackageMigrationStatus[] | Error>) {
  writeFileSync(join(dir, '.env.local'), 'CONVEX_DEPLOYMENT=local:test-app\n')
  for (const answer of answers) {
    if (answer instanceof Error) vi.mocked(runConvex).mockRejectedValueOnce(answer)
    else vi.mocked(runConvex).mockResolvedValueOnce({ stdout: JSON.stringify(answer), stderr: '' })
  }
}

describe('a starter that lacks what the scaffold has', () => {
  beforeEach(() => {
    dir = checkoutDriftedStarter(parent)
  })

  it('gains what it lacks, rewrites none of the app\'s code, and then does nothing', async () => {
    const before = snapshot()
    const report = await upgradeJson()
    expect(Object.keys(report).sort()).toEqual(['data', 'dryRun', 'ejected', 'next', 'pools', 'scaffold', 'to'])
    // No dev deployment: the workpools are not asked either.
    expect(report.pools).toMatchObject({ state: 'skipped', pools: [] })
    const after = snapshot()
    expect(Object.keys(after).filter(path => !path.startsWith('backend/') && after[path] !== before[path])).toEqual([])
    expect(readFileSync(join(dir, 'app/pages/index.vue'), 'utf-8')).toBe(before['app/pages/index.vue'])
    expect(report.scaffold.written).toEqual([`backend/${DRIFT.file}`])
    expect(report.scaffold.changes).toEqual([
      `backend/convex.config.ts: mounted ${DRIFT.mount}`,
      `backend/convex.config.ts: forwarded ${DRIFT.forward}`,
    ])
    for (const file of [DRIFT.file, 'convex.config.ts']) expect(after[`backend/${file}`], `backend/${file}`).toBe(readFileSync(join(__dirname, '../../templates/starter/backend', file), 'utf-8'))
    expect((await upgradeJson()).scaffold).toEqual({ written: [], changes: [] })
  })

  it.skipIf(process.platform === 'win32')('never writes through a link in a dry run', async () => {
    // backend/convex.config.ts, the file the repairs change, as a link to a file outside the app.
    const outside = mkdtempSync(join(tmpdir(), 'cli-upgrade-outside-'))
    const target = join(outside, 'convex.config.ts')
    writeFileSync(target, readFileSync(join(dir, 'backend/convex.config.ts')))
    rmSync(join(dir, 'backend/convex.config.ts'))
    symlinkSync(target, join(dir, 'backend/convex.config.ts'))
    const before = readFileSync(target, 'utf-8')
    try {
      expect((await upgradeJson('--dry-run')).scaffold.changes).toHaveLength(2)
      expect(readFileSync(target, 'utf-8')).toBe(before)
    }
    finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('repairs a functions directory above the project on a copy, in a dry run, and writes nothing beside it', async () => {
    // A monorepo: the functions sit beside the app, `functions: "../<name>"` in convex.json.
    const name = `functions-${randomBytes(4).toString('hex')}`
    const functions = join(dirname(dir), name)
    renameSync(join(dir, 'backend'), functions)
    writeFileSync(join(dir, 'convex.json'), JSON.stringify({ functions: `../${name}` }))
    try {
      const before = snapshot(functions)
      const report = await upgradeJson('--dry-run')
      expect(report.scaffold.written).toEqual([`../${name}/${DRIFT.file}`])
      expect(snapshot(functions)).toEqual(before)
      // Before the fix, the scratch copy's `../<name>` was a folder of the temporary directory itself.
      expect(existsSync(join(tmpdir(), name))).toBe(false)
    }
    finally {
      rmSync(functions, { recursive: true, force: true })
    }
  })

  it('shows the scaffold\'s repairs as diffs in a dry run', async () => {
    const before = snapshot()
    const report = await upgradeJson('--dry-run')
    expect(snapshot()).toEqual(before)
    expect(report.scaffold.written).toEqual([`backend/${DRIFT.file}`])
    expect(report.scaffold.diffs).toHaveLength(1)
    const [diff = ''] = report.scaffold.diffs ?? []
    expect(diff).toMatch(/^--- a\/backend\/convex\.config\.ts\n/)
    expect(diff.split('\n').filter(line => /^[+-](?![+-]{2} )/.test(line))).toEqual([
      `+import ${DRIFT.mount} from '@convex-dev/${DRIFT.mount}/convex.config'`,
      `+    ${DRIFT.forward}: app.env.${DRIFT.forward},`,
      `+app.use(${DRIFT.mount})`,
    ])
  })

  it('reads the app\'s own nuxt.config and app.config in a dry run, so it plans what the run writes', async () => {
    customizeStarter(dir)
    const planned = await upgradeJson('--dry-run')
    const carried = { 'backend/brand.generated.ts': CUSTOM.brand, 'backend/labels.generated.ts': CUSTOM.label, 'backend/paths.generated.ts': CUSTOM.login }
    for (const [path, value] of Object.entries(carried)) {
      const diff = planned.scaffold.diffs?.find(text => text.startsWith(`--- a/${path}\n`)) ?? ''
      expect(diff.split('\n').some(line => line.startsWith('+') && line.includes(value)), `${path}: ${diff}`).toBe(true)
    }
    const report = await upgradeJson()
    expect(report.scaffold.changes).toEqual(planned.scaffold.changes)
    // Before the fix the scratch copy had no config to read, and a dry run of the upgraded app emptied all three.
    expect((await upgradeJson('--dry-run')).scaffold).toEqual({ written: [], changes: [], diffs: [] })
  })
})

describe('a starter of the installed version', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(parent, 'starter-'))
    cpSync(join(__dirname, '../../templates/starter'), dir, { recursive: true, filter: source => !/[/\\](?:node_modules|\.nuxt|\.output|\.env\.local)(?:[/\\]|$)/.test(source) })
  })

  it('needs nothing repaired', async () => {
    const report = await upgradeJson('--dry-run')
    expect(report.scaffold).toMatchObject({ written: [], changes: [] })
  })
})

describe('the data migrations', () => {
  beforeEach(() => {
    dir = checkoutBaseStarter(parent)
  })

  it('start on the dev deployment and are followed until done', async () => {
    deployment(statuses('pending'), statuses('done'))
    const report = await upgradeJson()
    expect(vi.mocked(runConvex).mock.calls.map(([, args]) => args)).toEqual([
      ['run', '--component', 'backend', 'migrations:status', '{}'],
      ['run', '--component', 'backend', 'migrations:run', '{}'],
      LISTING,
    ])
    expect(report.data).toEqual({ deployment: 'dev', state: 'done', migrations: statuses('done') })
    expect(process.exitCode).toBeUndefined()
  })

  it('are read, not started, in a dry run, and left alone once done', async () => {
    deployment(statuses('pending'))
    expect((await upgradeJson('--dry-run')).data.state).toBe('pending')
    deployment(statuses('done'))
    expect((await upgradeJson()).data.state).toBe('done')
    // A dry run lists no component: the backfill is pending.
    expect(vi.mocked(runConvex).mock.calls.map(([, args]) => args.at(-2))).toEqual(['migrations:status', 'migrations:status', '--inline-query'])
  })

  it('wait for a push when the deployment runs an older backend', async () => {
    // What the CLI's error keeps of its output: the end of the component's function list.
    deployment(new ConvexCliError('convex run failed', { code: 1, signal: null, timedOut: false, stderrTail: '• webhooks:trim • webhooks:find • webhooks:listRecent' }))
    const report = await upgradeJson()
    expect(report.data).toMatchObject({ state: 'needs-push', reason: 'the dev deployment runs a backend older than this version: push it first' })
    expect(report.next.slice(0, 2)).toEqual(['npx nuxt-backend dev', 'npx nuxt-backend upgrade'])
    expect(process.exitCode).toBeUndefined()
  })

  it('start one that failed again, and fail the command when it fails again', async () => {
    deployment(statuses('failed', { error: 'boom' }), statuses('failed', { error: 'boom' }))
    expect((await upgradeJson()).data.state).toBe('failed')
    expect(vi.mocked(runConvex).mock.calls.map(([, args]) => args.at(-2))).toEqual(['migrations:status', 'migrations:run', '--inline-query'])
    expect(process.exitCode).toBe(1)
  })

  it('resume one that failed or was canceled on an earlier run', async () => {
    deployment(statuses('failed', { error: 'canceled' }), statuses('running'), statuses('done'))
    expect(await migrateData(dir, { prod: false, dryRun: false, interval: 0 })).toMatchObject({ state: 'done' })
    expect(vi.mocked(runConvex).mock.calls.map(([, args]) => args.at(-2))).toEqual(['migrations:status', 'migrations:run', 'migrations:status'])
  })

  it('run on production with --prod --yes and a production key', async () => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', deployKey('prod'))
    deployment(statuses('pending'), statuses('done'))
    const report = await upgradeJson('--prod', '--yes')
    expect(report.data).toMatchObject({ deployment: 'production', state: 'done' })
    expect(vi.mocked(runConvex).mock.calls.map(([, args]) => args)).toEqual([
      ['run', '--component', 'backend', '--prod', 'migrations:status', '{}'],
      ['run', '--component', 'backend', '--prod', 'migrations:run', '{}'],
      ['run', '--prod', ...LISTING.slice(1)],
    ])
  })

  it('fail --prod when production runs an older backend', async () => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', deployKey('prod'))
    deployment(new ConvexCliError('convex run failed', { code: 1, signal: null, timedOut: false, stderrTail: 'Could not find function for \'migrations:status\' in \'backend\'. Did you forget to run `npx convex dev`?' }))
    const report = await upgradeJson('--prod', '--yes')
    expect(report.data.state).toBe('needs-push')
    // Production's deploy first: the same command again would meet the same backend.
    expect(report.next.slice(0, 2)).toEqual([PRODUCTION_DEPLOY, 'npx nuxt-backend upgrade --prod --yes'])
    expect(process.exitCode).toBe(1)
  })

  it('are followed through the scheduler, and go on past the wait', async () => {
    deployment(statuses('pending'), statuses('running'), statuses('running'), statuses('done'))
    const lines: string[] = []
    expect(await migrateData(dir, { prod: false, dryRun: false, interval: 0, print: line => void lines.push(line) })).toMatchObject({ state: 'done' })
    expect(lines).toEqual(['[nuxt-backend] upgrade: 0 of 2 package migrations done…', '[nuxt-backend] upgrade: 0 of 2 package migrations done…'])
    deployment(statuses('pending'), statuses('running'))
    expect(await migrateData(dir, { prod: false, dryRun: false, wait: 0 })).toMatchObject({ state: 'running' })
  })
})

describe('the workpool backfill', () => {
  beforeEach(() => {
    dir = checkoutBaseStarter(parent)
  })

  /** The deployment's answers: the migrations done, then the listing, then each pool's in turn. */
  function pools(components: string[], ...answers: Array<'started' | Error>) {
    deployment(statuses('done'), listed(components))
    for (const answer of answers) {
      if (answer instanceof Error) vi.mocked(runConvex).mockRejectedValueOnce(answer)
      else vi.mocked(runConvex).mockResolvedValueOnce({ stdout: '', stderr: '' })
    }
  }

  it('starts on every pool the deployment mounts, nested ones included, and asks no batch worker', async () => {
    pools(['backend', 'backend/resend/emailWorkpool', 'backend/resend/emailWorkpool/batchWorker', 'workpool', 'workpool/batchWorker'], absent(), 'started', 'started')
    const report = await upgradeJson()
    expect(report.pools).toEqual({ state: 'started', pools: ['backend/resend/emailWorkpool', 'workpool'], failed: [] })
    expect(vi.mocked(runConvex).mock.calls.slice(1).map(([, args]) => args)).toEqual([
      LISTING,
      ['run', '--component', 'backend', POOL_BACKFILL, '{}'],
      ['run', '--component', 'backend/resend/emailWorkpool', POOL_BACKFILL, '{}'],
      ['run', '--component', 'workpool', POOL_BACKFILL, '{}'],
    ])
    expect(process.exitCode).toBeUndefined()
  })

  it('says none when no pool has the backfill yet, and does not fail', async () => {
    pools(['workpool', 'workpool/batchWorker'], absent())
    expect((await upgradeJson()).pools).toEqual({ state: 'none', pools: [], failed: [] })
    expect(process.exitCode).toBeUndefined()
  })

  it('fails the command when a pool refuses it, and still starts the rest', async () => {
    pools(['workflow/workpool', 'workpool'], new ConvexCliError('convex run exited with code 1', { code: 1, signal: null, timedOut: false, stderrTail: 'Server Error' }), 'started')
    const report = await upgradeJson()
    expect(report.pools).toEqual({ state: 'failed', pools: ['workpool'], failed: [{ component: 'workflow/workpool', reason: 'convex run exited with code 1' }] })
    expect(process.exitCode).toBe(1)
  })

  it('is skipped when the deployment lists no components', async () => {
    deployment(statuses('done'), new Error('network down'))
    expect((await upgradeJson()).pools).toEqual({ state: 'skipped', pools: [], failed: [], reason: 'the deployment did not list its components: network down' })
  })

  it('asks pools four at a time, and a dry run asks none', async () => {
    const paths = Array.from({ length: 6 }, (_, index) => `pool${index}`)
    let open = 0
    let most = 0
    const run = vi.fn(async (_root: string, args: string[]) => {
      if (args.includes('--inline-query')) throw listed(paths)
      open++
      most = Math.max(most, open)
      await new Promise(resolve => setTimeout(resolve, 1))
      open--
      return { stdout: '', stderr: '' }
    })
    expect((await backfillPools(dir, { prod: false, dryRun: false }, run)).pools).toEqual(paths)
    expect(most).toBe(4)
    run.mockClear()
    expect(await backfillPools(dir, { prod: false, dryRun: true }, run)).toMatchObject({ state: 'pending', pools: [] })
    expect(run).not.toHaveBeenCalled()
  })
})

describe('what it refuses, before it reads or writes anything', () => {
  beforeEach(() => {
    dir = checkoutBaseStarter(parent)
  })

  it.each([
    [['--prod'], [], '--prod migrates the production data: add --yes to confirm, or --dry-run to see where it stands.'],
    [['--prod', '--yes'], ['dev'], 'CONVEX_DEPLOY_KEY is a dev deploy key, and the Convex CLI would migrate that deployment instead of production. Use the production deploy key.'],
    [[], ['prod'], 'CONVEX_DEPLOY_KEY is a prod deploy key, and the Convex CLI follows it whatever the flags say, so the dev data migrations would run on that deployment. Unset it to migrate the dev deployment, or run with --prod --yes for production.'],
  ])('%j with a %j deploy key', async (args, key, message) => {
    if (key[0]) vi.stubEnv('CONVEX_DEPLOY_KEY', deployKey(key[0]))
    const before = snapshot()
    await upgrade(...args)
    expect(stderr).toEqual([`[nuxt-backend] upgrade refused: ${message}`])
    expect(process.exitCode).toBe(1)
    expect(snapshot()).toEqual(before)
    expect(runConvex).not.toHaveBeenCalled()
  })
})
