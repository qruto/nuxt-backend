/** `nuxt-backend upgrade`'s report as the terminal shows it: a section per step, then what to run next. */
import type { UpgradeReport } from '../upgrade'
import { formatEjected } from './ejected'

/** Indent each line of a block, a diff's. */
const indented = (block: string) => block.split('\n').map(line => `      ${line}`)

/** The header: the version the app moves to, and whether this is a dry run. */
function header(report: UpgradeReport): string[] {
  return [`nuxt-backend upgrade: → ${report.to}${report.dryRun ? ' — dry run, nothing written' : ''}`]
}

/** What the repairs wrote and changed. */
function scaffold(report: UpgradeReport): string[] {
  const { written, changes, diffs = [] } = report.scaffold
  const lines = ['Scaffold (the repairs `doctor --fix` makes)']
  if (written.length === 0 && changes.length === 0) lines.push('  · nothing to repair')
  lines.push(...written.map(file => `  ${report.dryRun ? 'would write' : '✓ wrote'} ${file}`))
  lines.push(...changes.map(change => `  ${report.dryRun ? 'would change' : '✓'} ${change}`))
  return [...lines, ...diffs.flatMap(indented)]
}

const MARKS = { done: '✓', running: '…', pending: '·', failed: '✗' } as const

/** Where the deployment is with each package migration, or why the step did not run. */
function data(report: UpgradeReport): string[] {
  const { deployment, state, reason, migrations } = report.data
  const lines = [`Data (the package's own migrations, ${deployment} deployment)`]
  if (reason) return [...lines, `  ${state === 'failed' ? '✗' : '·'} ${state}: ${reason}`]
  if (state === 'none') lines.push('  · this version has none')
  for (const migration of migrations) {
    const read = migration.processed ? ` (${migration.processed} read)` : ''
    lines.push(`  ${MARKS[migration.state]} ${migration.name.padEnd(20)} ${migration.state}${read} — ${migration.does}${migration.error ? `: ${migration.error}` : ''}`)
  }
  if (state === 'running') lines.push('  The migrations go on in the deployment; run the command again to see them finish.')
  return lines
}

/** The report as the terminal shows it. */
export function formatUpgrade(report: UpgradeReport): string[] {
  return [
    ...header(report),
    '',
    ...scaffold(report),
    '',
    ...(report.ejected.length ? [...formatEjected(report.ejected), ''] : []),
    ...data(report),
    '',
    'Next',
    ...report.next.map(command => `  ${command}`),
  ]
}
