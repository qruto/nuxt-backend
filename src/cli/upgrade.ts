import { defineCommand } from 'citty'
import { resolve } from 'node:path'
import { agentsMdVersion, installedVersion } from '../agents'
import { deployKeyType, nonProductionDeployKey, readEnvFiles } from '../env-push'
import { progress, withContract } from './contract'
import { repairProjectFiles } from './repair'
import { type DataReport, migrateData } from './upgrade/data'
import { unifiedDiff } from './upgrade/diff'
import { ejectedChanges, type EjectedChange, formatEjected } from './upgrade/ejected'
import { formatUpgrade } from './upgrade/format'
import { planRepairs } from './upgrade/scaffold'

/** What `upgrade --json` prints. */
export interface UpgradeReport {
  /** The version installed, which the app upgrades to. */
  to: string
  dryRun: boolean
  /** The repairs `doctor --fix` makes: the files written, a line per change, and with `--dry-run` the diffs. */
  scaffold: { written: string[], changes: string[], diffs?: string[] }
  /** The ejected files whose stamp names an older version, with the count of upstream changes since. */
  ejected: EjectedChange[]
  data: DataReport
  /** The commands to run next, in order. */
  next: string[]
}

interface UpgradeOptions {
  dryRun: boolean
  prod: boolean
  print: (line: string) => void
}

/** Production's deploy, as Ship › Deploy runs it: the backend pushed, then the app built against it. */
export const PRODUCTION_DEPLOY = 'npx convex deploy --cmd \'npm run build\' --cmd-url-env-var-name NUXT_PUBLIC_BACKEND_URL'

/** The commands to run next, in order. */
function nextCommands(rootDir: string, report: Omit<UpgradeReport, 'next'>, prod: boolean): string[] {
  const next: string[] = []
  if (report.dryRun) next.push(`npx nuxt-backend upgrade${prod ? ' --prod --yes' : ''}`)
  if (!report.dryRun && report.data.state === 'needs-push') next.push(...prod ? [PRODUCTION_DEPLOY, 'npx nuxt-backend upgrade --prod --yes'] : ['npx nuxt-backend dev', 'npx nuxt-backend upgrade'])
  if (agentsMdVersion(rootDir) !== report.to) next.push('npx nuxt-backend init --agents')
  next.push(`npx nuxt-backend doctor${prod ? ' --prod' : ''}`, 'npx nuxt typecheck')
  return [...new Set(next)]
}

/**
 * Upgrade the app in `rootDir` to the installed version: `doctor --fix`'s
 * repairs of the scaffold, then the package's data migrations on the
 * deployment. It rewrites none of the app's code. A dry run plans the
 * repairs on a scratch copy, writes nothing, and reads where the
 * migrations stand.
 */
export async function runUpgrade(rootDir: string, options: UpgradeOptions): Promise<UpgradeReport> {
  const to = installedVersion(rootDir)
  let scaffold: UpgradeReport['scaffold']
  if (options.dryRun) {
    const planned = await planRepairs(rootDir)
    // A new file's diff would be the whole template: it is listed by name.
    scaffold = { written: planned.written, changes: planned.changes, diffs: planned.files.filter(file => !planned.written.includes(file.path)).map(file => unifiedDiff(file.path, file.before, file.after)) }
  }
  else {
    options.print('[nuxt-backend] upgrade: the repairs doctor --fix makes…')
    scaffold = await repairProjectFiles(rootDir)
  }

  const ejected = await ejectedChanges(rootDir)
  options.print(`[nuxt-backend] upgrade: the package's data migrations, ${options.prod ? 'production' : 'dev'} deployment…`)
  const data = await migrateData(rootDir, { prod: options.prod, dryRun: options.dryRun, print: options.print })
  const report = { to, dryRun: options.dryRun, scaffold, ejected, data }
  return { ...report, next: nextCommands(rootDir, report, options.prod) }
}

/**
 * Why the flags may not run: `--prod` without its confirmation, or a deploy key the Convex CLI would follow to
 * another deployment than the one the flags name. Undefined when they may.
 */
function refusal(rootDir: string, args: { 'prod': boolean, 'yes': boolean, 'dry-run': boolean }): string | undefined {
  if (args.prod && !args.yes && !args['dry-run']) return '--prod migrates the production data: add --yes to confirm, or --dry-run to see where it stands.'
  const env = { ...readEnvFiles(rootDir), ...process.env }
  const foreign = args.prod ? nonProductionDeployKey(env) : deployKeyType(env)
  if (args.prod && foreign) return `CONVEX_DEPLOY_KEY is a ${foreign} deploy key, and the Convex CLI would migrate that deployment instead of production. Use the production deploy key.`
  if (!args.prod && foreign !== null && foreign !== 'dev') return `CONVEX_DEPLOY_KEY is a ${foreign} deploy key, and the Convex CLI follows it whatever the flags say, so the dev data migrations would run on that deployment. Unset it to migrate the dev deployment, or run with --prod --yes for production.`
  return undefined
}

/** Whether the run failed: a migration that failed, or production left unmigrated. */
function failed(report: UpgradeReport, prod: boolean): boolean {
  const productionLeft = prod && !['done', 'none', 'running', 'pending'].includes(report.data.state)
  return report.data.state === 'failed' || productionLeft
}

export const upgrade = withContract('upgrade', {
  sideEffects: ['writes project files', 'writes the dev deployment'],
  byFlag: {
    '--dry-run': ['reads only'],
    '--diff': ['reads only'],
    '--prod --yes': ['writes project files', 'writes production'],
  },
  json: '`{ to, dryRun, scaffold: { written, changes, diffs }, ejected: [{ target, file, from, to, changes }], data: { deployment, state, reason, migrations }, next }`: `data.state` is `done`, `running`, `pending`, `none`, `skipped`, `needs-push` or `failed`; `scaffold.diffs` comes with `--dry-run` only; with `--diff`, `[{ target, file, from, to, changes, diff }]` alone; progress goes to stderr',
  exitCodes: {
    0: 'done: the scaffold repaired; the data migrated, still migrating, waiting for a push, or skipped with no dev deployment',
    1: 'refused, a data migration failed, or with `--prod`, production could not be migrated',
  },
}, defineCommand({
  meta: { name: 'upgrade', description: 'Move the app to the installed version: repair the scaffold as doctor --fix does, and run the package\'s data migrations. It rewrites none of the app\'s code' },
  args: {
    'cwd': { type: 'string', description: 'Project directory', default: '.' },
    'dry-run': { type: 'boolean', description: 'Show what the scaffold repairs would change, as diffs, and where the data migrations stand; write nothing', default: false },
    'diff': { type: 'string', description: 'Print the upstream changes to each ejected file, or to the one named, as a unified diff; write nothing' },
    'prod': { type: 'boolean', description: 'Run the data migrations on the production deployment; needs --yes', default: false },
    'yes': { type: 'boolean', description: 'Confirm --prod: the production data is migrated', default: false },
    'json': { type: 'boolean', description: 'Machine-readable output', default: false },
  },
  async run({ args }) {
    const rootDir = resolve(process.cwd(), args.cwd)
    if (args.diff !== undefined) {
      // Reads only: the upstream diffs of the ejected files, nothing else runs.
      const only = typeof args.diff === 'string' && args.diff !== '' && args.diff !== 'true' ? args.diff : undefined
      const changes = await ejectedChanges(rootDir, { diff: true, only })
      console.log(args.json ? JSON.stringify(changes, null, 2) : (changes.length ? formatEjected(changes) : ['No ejected file names an older version.']).join('\n'))
      return
    }
    const refused = refusal(rootDir, args)
    if (refused) {
      console.error(`[nuxt-backend] upgrade refused: ${refused}`)
      process.exitCode = 1
      return
    }
    const report = await runUpgrade(rootDir, { dryRun: args['dry-run'], prod: args.prod, print: progress(args.json) })
    console.log(args.json ? JSON.stringify(report, null, 2) : formatUpgrade(report).join('\n'))
    if (failed(report, args.prod)) process.exitCode = 1
  },
}))
