import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { billingSync, runBillingSync, type BillingSyncDeps } from '../../src/cli/billing'
import { COMMAND_CONTRACTS } from '../../src/cli/contract'

// `billing sync` around the provider reconciliation: what it writes, where a
// new webhook endpoint's secret goes (the deployment, never the screen), and
// the deployment's product refresh. The reconciliation itself is
// billing-sync.test.ts's; here it is a stub.

const SECRET = 'whsec_never_on_screen_0123456789'

let rootDir: string
let lines: string[]

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'billing-sync-command-'))
  mkdirSync(join(rootDir, 'backend'))
  writeFileSync(join(rootDir, 'backend/billing.catalog.ts'), 'export default { plans: {} }\n')
  lines = []
  vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_test')
  vi.stubEnv('BILLING_ENVIRONMENT', '')
  vi.stubEnv('CONVEX_DEPLOY_KEY', '')
  vi.stubEnv('CONVEX_DEPLOYMENT_TOKEN', '')
  vi.spyOn(console, 'error').mockImplementation(line => lines.push(String(line)))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  rmSync(rootDir, { recursive: true, force: true })
})

function deps(overrides: Partial<BillingSyncDeps> = {}) {
  const setEnv = vi.fn(async () => {})
  const syncProducts = vi.fn(async () => {})
  const sync = vi.fn(async () => ({
    log: [{ action: 'created' as const, kind: 'webhook' as const, key: 'https://demo.convex.site/billing/events', id: 'wh_1' }],
    ids: {} as never,
    webhookSecret: SECRET,
  }))
  return { setEnv, syncProducts, sync, print: (line: string) => lines.push(line), ...overrides }
}

describe('billing sync', () => {
  it('stores a new webhook endpoint\'s secret on the deployment, and never prints it', async () => {
    const steps = deps()
    const { exitCode, report } = await runBillingSync(rootDir, { webhook: 'https://demo.convex.site/billing/events' }, steps)

    expect(exitCode).toBe(0)
    expect(steps.setEnv).toHaveBeenCalledWith(rootDir, 'BILLING_WEBHOOK_SECRET', SECRET)
    expect(lines.join('\n')).not.toContain(SECRET)
    expect(JSON.stringify(report)).not.toContain(SECRET)
    expect(report?.webhook).toEqual({ url: 'https://demo.convex.site/billing/events', action: 'created', secret: 'stored' })
  })

  it('writes the id map and refreshes the deployment\'s products', async () => {
    const steps = deps()
    const { report } = await runBillingSync(rootDir, { webhook: 'off' }, steps)

    expect(steps.syncProducts).toHaveBeenCalledWith(rootDir, false)
    expect(report?.products).toBe('synced')
    expect(existsSync(join(rootDir, 'backend/billing.generated.ts'))).toBe(true)
    expect(readFileSync(report!.generated!, 'utf8')).toContain('sandbox')
  })

  it('fails when a new secret can\'t be stored, and points at the dashboard instead of printing it', async () => {
    const steps = deps({ setEnv: vi.fn(() => Promise.reject(new Error('no deployment'))) })
    const { exitCode, report } = await runBillingSync(rootDir, { webhook: 'https://demo.convex.site/billing/events' }, steps)

    expect(exitCode).toBe(1)
    expect(report?.webhook?.secret).toBe('not-stored')
    const output = lines.join('\n')
    expect(output).toContain('Copy it from the provider dashboard')
    expect(output).not.toContain(SECRET)
  })

  it('reports a failed product refresh without failing the sync', async () => {
    const steps = deps({ syncProducts: vi.fn(() => Promise.reject(new Error('not deployed'))) })
    const { exitCode, report } = await runBillingSync(rootDir, {}, steps)

    expect(exitCode).toBe(0)
    expect(report?.products).toBe('failed')
    expect(lines.join('\n')).toContain('npx convex run billing:syncProducts')
  })

  it('writes and refreshes nothing on a dry run', async () => {
    const steps = deps({ sync: vi.fn(async () => ({ log: [], ids: {} as never })) })
    const { report } = await runBillingSync(rootDir, { dryRun: true }, steps)

    expect(report).toMatchObject({ dryRun: true, generated: null, products: 'skipped' })
    expect(steps.syncProducts).not.toHaveBeenCalled()
    expect(existsSync(join(rootDir, 'backend/billing.generated.ts'))).toBe(false)
  })

  it('writes production with --env production, and refuses a dev deploy key there', async () => {
    const steps = deps()
    await runBillingSync(rootDir, { environment: 'production' }, steps)
    expect(steps.syncProducts).toHaveBeenCalledWith(rootDir, true)

    vi.stubEnv('CONVEX_DEPLOY_KEY', 'dev:brave-fox-123|secret')
    const refused = deps()
    const { exitCode } = await runBillingSync(rootDir, { environment: 'production' }, refused)
    expect(exitCode).toBe(1)
    expect(refused.sync).not.toHaveBeenCalled()
    expect(lines.join('\n')).toContain('--env production refused')
  })
})

describe('its contract', () => {
  it('declares what it may change, what --json prints and its exit codes', () => {
    const contract = COMMAND_CONTRACTS.get('billing sync')!
    expect(contract.sideEffects).toEqual(['writes provider accounts', 'writes project files', 'writes the dev deployment', 'writes production'])
    expect(Object.keys(contract.exitCodes)).toEqual(['0', '1'])
    expect((billingSync.meta as { description: string }).description).toMatch(/\[writes provider accounts; writes project files; writes the dev deployment; writes production\]$/)
    expect(billingSync.args).toHaveProperty('json')
  })

  it('is stated on the CLI page: side effects and every exit code', () => {
    const page = readFileSync(new URL('../../website/content/docs/10.reference/09.cli/index.md', import.meta.url), 'utf8')
    const section = page.slice(page.indexOf('## `billing sync`'))
    expect(section).toContain('**Side effects:**')
    for (const code of Object.keys(COMMAND_CONTRACTS.get('billing sync')!.exitCodes)) expect(section).toContain(`\`${code}\``)
    expect(section).toContain('| `--json` |')
  })
})
