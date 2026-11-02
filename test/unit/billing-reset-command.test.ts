import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BillingSyncReport } from '../../src/cli/billing'

// `billing reset` (#173): start a dev deployment's billing over in the
// organization BILLING_ACCESS_TOKEN names now. It refuses anything but a dev
// deployment that bills in the sandbox, syncs the catalog before it clears
// anything, empties the provider component's customers and subscriptions and
// the backend's entitlement cache, and queues the free plan again.

const deployment = vi.hoisted(() => ({ calls: [] as string[][], imported: [] as string[], failing: null as string | null }))
vi.mock('../../src/convex-cli', () => ({
  runConvex: vi.fn(async (_rootDir: string, args: string[]) => {
    deployment.calls.push(args)
    if (deployment.failing && args.includes(deployment.failing)) throw new Error(`convex ${args[0]} exited with code 1`)
    // What the reset imports: read while the file exists.
    if (args[0] === 'import') deployment.imported.push(readFileSync(args.at(-1)!, 'utf8'))
    return { stdout: 'null', stderr: '' }
  }),
}))

const { runBillingReset } = await import('../../src/cli/billing/reset')
const { COMMAND_CONTRACTS } = await import('../../src/cli/contract')
await import('../../src/cli/billing')

let rootDir: string
let lines: string[]
let errors: string[]

const ENV_VARS = ['BACKEND_ENVIRONMENT', 'CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', 'CONVEX_DEPLOYMENT', 'BILLING_ACCESS_TOKEN']

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'billing-reset-'))
  mkdirSync(join(rootDir, 'backend'))
  writeFileSync(join(rootDir, 'backend/billing.catalog.ts'), 'export default { plans: { free: { name: \'Free\', prices: { month: 0 } }, pro: { name: \'Pro\', prices: { month: 1000 } } } }\n')
  writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\n')
  deployment.calls.length = 0
  deployment.imported.length = 0
  deployment.failing = null
  lines = []
  errors = []
  for (const name of ENV_VARS) vi.stubEnv(name, undefined)
  vi.spyOn(console, 'error').mockImplementation(line => errors.push(String(line)))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  rmSync(rootDir, { recursive: true, force: true })
})

/** What a sync that went ahead reports; `generated` is the id map's path when it rewrote it. */
function syncReport(generated: string | null = null): BillingSyncReport {
  return {
    environment: 'sandbox',
    dryRun: false,
    deployment: 'https://happy-otter-123.convex.cloud',
    log: [],
    generated,
    webhook: { url: null, action: 'skipped', secret: 'none' },
    products: { status: 'synced' },
  }
}

function deps({ environment = null, sync = { exitCode: 0 as const, report: syncReport() } }: { environment?: 'production' | 'sandbox' | 'development' | null, sync?: { exitCode: 0 | 1, report: BillingSyncReport | null, refusal?: string } } = {}) {
  return {
    sync: vi.fn(async () => sync),
    readEnvironment: vi.fn(async () => environment),
    print: (line: string) => lines.push(line),
  }
}

describe('billing reset — what it refuses', () => {
  it.each(['prod:happy-otter-123|key', 'preview:team:project|key', 'project:team:project|key', 'legacy-key-with-no-type'])('refuses a deploy key that is no dev one (%s), before it reads anything', async (key) => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', key)
    const options = deps()
    const { exitCode, refusal } = await runBillingReset(rootDir, options)
    expect(exitCode).toBe(1)
    expect(refusal).toContain('clears a dev deployment only')
    expect(options.readEnvironment).not.toHaveBeenCalled()
    expect(options.sync).not.toHaveBeenCalled()
    expect(deployment.calls).toEqual([])
  })

  it('refuses a deployment that bills in production, before it syncs or clears', async () => {
    const options = deps({ environment: 'production' })
    const { exitCode, refusal } = await runBillingReset(rootDir, options)
    expect(exitCode).toBe(1)
    expect(refusal).toContain('bills in production')
    expect(errors.join('\n')).toContain('billing reset refused')
    expect(options.sync).not.toHaveBeenCalled()
    expect(deployment.calls).toEqual([])
  })

  it('clears nothing when the sync is refused', async () => {
    const options = deps({ sync: { exitCode: 1, report: null, refusal: 'BILLING_ACCESS_TOKEN is not set' } })
    const { exitCode, report, refusal } = await runBillingReset(rootDir, options)
    expect({ exitCode, report, refusal }).toEqual({ exitCode: 1, report: null, refusal: 'BILLING_ACCESS_TOKEN is not set' })
    expect(deployment.calls).toEqual([])
  })
})

describe('billing reset — the reset', () => {
  it('syncs the sandbox catalog, clears the three tables in order, then queues the free plan', async () => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', 'dev:happy-otter-123|key')
    const options = deps({ environment: 'development' })
    const { exitCode, report } = await runBillingReset(rootDir, options)
    expect(exitCode).toBe(0)
    expect(options.sync).toHaveBeenCalledWith(rootDir, { environment: 'sandbox' }, expect.objectContaining({ print: options.print }))
    expect(deployment.calls.map(args => args.slice(0, -1))).toEqual([
      ['import', '--component', 'polar', '--table', 'customers', '--replace', '--yes', '--format', 'jsonArray'],
      ['import', '--component', 'polar', '--table', 'subscriptions', '--replace', '--yes', '--format', 'jsonArray'],
      ['run', '--component', 'backend', 'billing:clear'],
      ['run', 'billing:startFreePlan'],
    ])
    expect(deployment.calls.at(-1)!.at(-1)).toBe('{}')
    // An empty file replaces each table: nothing is imported.
    expect(deployment.imported.map(text => JSON.parse(text))).toEqual([[], []])
    expect(report).toEqual({
      sync: syncReport(),
      cleared: [
        { component: 'polar', table: 'customers', status: 'cleared' },
        { component: 'polar', table: 'subscriptions', status: 'cleared' },
        { component: 'backend', table: 'billingEntitlements', status: 'cleared' },
      ],
      freePlan: { status: 'queued' },
    })
    expect(lines).toContain('[nuxt-backend] Cleared polar:customers.')
  })

  it('pushes a rewritten id map before the free plan starts, so the new organization\'s free product is subscribed', async () => {
    const { exitCode } = await runBillingReset(rootDir, deps({ sync: { exitCode: 0, report: syncReport(join(rootDir, 'backend/billing.generated.ts')) } }))
    expect(exitCode).toBe(0)
    expect(deployment.calls.at(-1)).toEqual(['run', '--push', '--typecheck', 'disable', 'billing:startFreePlan', '{}'])
  })

  it('starts no free plan for a catalog without one', async () => {
    writeFileSync(join(rootDir, 'backend/billing.catalog.ts'), 'export default { plans: { pro: { name: \'Pro\', prices: { month: 1000 } } } }\n')
    const { exitCode, report } = await runBillingReset(rootDir, deps())
    expect(exitCode).toBe(0)
    expect(report!.freePlan).toEqual({ status: 'skipped', note: 'the catalog has no free plan' })
    expect(deployment.calls.some(args => args.includes('billing:startFreePlan'))).toBe(false)
  })

  it('stops at a table it cannot clear, and starts no free plan over half-cleared data', async () => {
    deployment.failing = 'subscriptions'
    const { exitCode, report } = await runBillingReset(rootDir, deps())
    expect(exitCode).toBe(1)
    expect(report!.cleared.map(entry => entry.status)).toEqual(['cleared', 'failed', 'skipped'])
    expect(report!.cleared[1]!.note).toContain('polar:subscriptions could not be cleared')
    expect(report!.freePlan).toEqual({ status: 'skipped', note: 'the billing data was not cleared' })
    expect(deployment.calls.some(args => args.includes('billing:clear') || args.includes('billing:startFreePlan'))).toBe(false)
  })

  it('fails with the command to run when the free plan cannot be queued, and with the sync\'s own failure', async () => {
    deployment.failing = 'billing:startFreePlan'
    const failed = await runBillingReset(rootDir, deps())
    expect(failed.exitCode).toBe(1)
    expect(failed.report!.freePlan.note).toContain('npx convex run billing:startFreePlan \'{}\'')
    deployment.failing = null
    const unstored = await runBillingReset(rootDir, deps({ sync: { exitCode: 1, report: syncReport() } }))
    expect(unstored.exitCode).toBe(1)
    expect(unstored.report!.freePlan.status).toBe('queued')
  })
})

describe('billing reset — its contract', () => {
  it('writes the dev deployment, never production', () => {
    const contract = COMMAND_CONTRACTS.get('billing reset')!
    expect(contract.sideEffects).toContain('writes the dev deployment')
    expect(contract.sideEffects).not.toContain('writes production')
    expect(contract.byFlag).toBeUndefined()
  })
})
