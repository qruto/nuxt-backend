import { describe, expect, it } from 'vitest'
import type { UpgradeReport } from '../../src/cli/upgrade'
import { formatUpgrade } from '../../src/cli/upgrade/format'

// `nuxt-backend upgrade` at a terminal: the report as the lines a person
// reads, a section per step and the commands to run next. Built from the
// report alone, so each case here is a report the command can produce.

function report(overrides: Partial<UpgradeReport> = {}): UpgradeReport {
  return {
    to: '0.2.0',
    dryRun: false,
    scaffold: { written: [], changes: [] },
    ejected: [],
    data: { deployment: 'dev', state: 'done', migrations: [] },
    pools: { state: 'none', pools: [], failed: [] },
    next: ['npx nuxt-backend doctor', 'npx nuxt typecheck'],
    ...overrides,
  }
}

/** The lines of one section: from its heading to the blank line after it. */
function section(lines: string[], heading: string): string[] {
  const start = lines.findIndex(line => line.startsWith(heading))
  const end = lines.indexOf('', start)
  return lines.slice(start, end === -1 ? undefined : end)
}

describe('upgrade at a terminal', () => {
  it('says a dry run writes nothing, and shows each repair it would make with its diff', () => {
    const lines = formatUpgrade(report({
      dryRun: true,
      scaffold: { written: ['backend/billing.ts'], changes: ['convex.json: functions → backend'], diffs: ['--- a/convex.json\n+++ b/convex.json\n@@ -1 +1 @@'] },
    }))
    expect(lines[0]).toBe('nuxt-backend upgrade: → 0.2.0 — dry run, nothing written')
    expect(section(lines, 'Scaffold')).toEqual([
      'Scaffold (the repairs `doctor --fix` makes)',
      '  would write backend/billing.ts',
      '  would change convex.json: functions → backend',
      '      --- a/convex.json',
      '      +++ b/convex.json',
      '      @@ -1 +1 @@',
    ])
  })

  it('says what a run wrote, and that a scaffold already right needs nothing', () => {
    const wrote = formatUpgrade(report({ scaffold: { written: ['backend/billing.ts'], changes: ['restored backend/email.ts'] } }))
    expect(wrote[0]).toBe('nuxt-backend upgrade: → 0.2.0')
    expect(section(wrote, 'Scaffold').slice(1)).toEqual(['  ✓ wrote backend/billing.ts', '  ✓ restored backend/email.ts'])

    expect(section(formatUpgrade(report()), 'Scaffold').slice(1)).toEqual(['  · nothing to repair'])
  })

  it('lists the ejected files only when there are some', () => {
    expect(formatUpgrade(report()).some(line => line.startsWith('Ejected files'))).toBe(false)
    const lines = formatUpgrade(report({ ejected: [{ target: 'PricingPlanCard', file: 'app/components/PricingPlanCard.vue', from: '0.1.0', to: '0.2.0', changes: 2 }] }))
    expect(section(lines, 'Ejected files')).toEqual([
      'Ejected files',
      `  ${'PricingPlanCard'.padEnd(20)} ${'0.1.0 → 0.2.0'.padEnd(18)} 2 upstream changes`,
      `  ${' '.repeat(20)} npx nuxt-backend upgrade --diff PricingPlanCard`,
    ])
  })

  it('shows each package migration with how far it read, and why one failed', () => {
    const lines = formatUpgrade(report({
      data: {
        deployment: 'production',
        state: 'failed',
        migrations: [
          { name: 'personalWorkspaces', since: '0.2.0', does: 'gives every account its personal workspace', state: 'done', processed: 120 },
          { name: 'activeWorkspaces', since: '0.2.0', does: 'sets each session\'s active workspace', state: 'failed', processed: 0, error: 'the read limit was hit' },
        ],
      },
    }))
    expect(section(lines, 'Data')).toEqual([
      'Data (the package\'s own migrations, production deployment)',
      `  ✓ ${'personalWorkspaces'.padEnd(20)} done (120 read) — gives every account its personal workspace`,
      `  ✗ ${'activeWorkspaces'.padEnd(20)} failed — sets each session's active workspace: the read limit was hit`,
    ])
  })

  it('says migrations still running go on in the deployment, and to run it again', () => {
    const lines = formatUpgrade(report({ data: { deployment: 'dev', state: 'running', migrations: [{ name: 'personalWorkspaces', since: '0.2.0', does: 'gives every account its personal workspace', state: 'running', processed: 40 }] } }))
    expect(section(lines, 'Data').slice(1)).toEqual([
      `  … ${'personalWorkspaces'.padEnd(20)} running (40 read) — gives every account its personal workspace`,
      '  The migrations go on in the deployment; run the command again to see them finish.',
    ])
  })

  it('says a version with no migrations has none, and why the data step did not run', () => {
    expect(section(formatUpgrade(report({ data: { deployment: 'dev', state: 'none', migrations: [] } })), 'Data').slice(1)).toEqual(['  · this version has none'])
    expect(section(formatUpgrade(report({ data: { deployment: 'dev', state: 'needs-push', reason: 'the deployment runs an older backend', migrations: [] } })), 'Data').slice(1))
      .toEqual(['  · needs-push: the deployment runs an older backend'])
    expect(section(formatUpgrade(report({ data: { deployment: 'dev', state: 'failed', reason: 'convex run exited with code 1', migrations: [] } })), 'Data').slice(1))
      .toEqual(['  ✗ failed: convex run exited with code 1'])
  })

  it('shows the pools the workpool backfill started on, and the ones that refused it', () => {
    const lines = formatUpgrade(report({ pools: { state: 'failed', pools: ['workpool', 'backend/resend/emailWorkpool'], failed: [{ component: 'workflow/workpool', reason: 'convex run exited with code 1' }] } }))
    expect(section(lines, 'Workpools')).toEqual([
      'Workpools (the backfill each pool runs before workpool 0.5)',
      '  ✓ workpool: started; it goes on in the deployment',
      '  ✓ backend/resend/emailWorkpool: started; it goes on in the deployment',
      '  ✗ workflow/workpool: convex run exited with code 1',
    ])
  })

  it('says no pool has the backfill, and why the pool step did not run', () => {
    expect(section(formatUpgrade(report()), 'Workpools').slice(1)).toEqual(['  · no pool on the deployment has the backfill'])
    expect(section(formatUpgrade(report({ pools: { state: 'pending', pools: [], failed: [], reason: 'a dry run starts nothing' } })), 'Workpools').slice(1))
      .toEqual(['  · pending: a dry run starts nothing'])
  })

  it('ends with the commands to run next, in order', () => {
    const lines = formatUpgrade(report({ next: ['npx nuxt-backend dev', 'npx nuxt-backend upgrade', 'npx nuxt-backend doctor'] }))
    expect(lines.slice(lines.indexOf('Next'))).toEqual(['Next', '  npx nuxt-backend dev', '  npx nuxt-backend upgrade', '  npx nuxt-backend doctor'])
  })
})
