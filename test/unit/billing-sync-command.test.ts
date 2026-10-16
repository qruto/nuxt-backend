import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { billingSync, runBillingSync, type BillingSyncDeps } from '../../src/cli/billing'
import type { SyncDeployment } from '../../src/cli/billing/deployment'
import type { BillingSyncOptions, BillingSyncResult } from '../../src/cli/billing/sync'
import { COMMAND_CONTRACTS } from '../../src/cli/contract'

// `billing sync` around the provider reconciliation: which deployment it
// writes and the webhook URL that goes with it, where the endpoint's secret
// goes (that deployment, never the screen), when an existing secret is kept,
// and whether the deployment can load the products. The reconciliation itself
// is billing-sync.test.ts's; here it is a stub, and so is the deployment read.

const SECRET = 'whsec_never_on_screen_0123456789'
const DEV_URL = 'https://demo-slug-1.convex.cloud'
const DEV_WEBHOOK = 'https://demo-slug-1.convex.site/billing/events'

let rootDir: string
let lines: string[]

// Everything billing sync reads from the process env: start from none, so a
// value set on the runner cannot stand in for the one under test.
const ENV_VARS = ['BILLING_ENVIRONMENT', 'CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', 'CONVEX_DEPLOYMENT', 'NUXT_PUBLIC_BACKEND_SITE_URL', 'NUXT_PUBLIC_CONVEX_SITE_URL', 'NUXT_PUBLIC_BACKEND_URL', 'NUXT_PUBLIC_CONVEX_URL']

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'billing-sync-command-'))
  mkdirSync(join(rootDir, 'backend'))
  writeFileSync(join(rootDir, 'backend/billing.catalog.ts'), 'export default { plans: {} }\n')
  lines = []
  for (const name of ENV_VARS) vi.stubEnv(name, undefined)
  vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_test')
  vi.spyOn(console, 'error').mockImplementation(line => lines.push(String(line)))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  rmSync(rootDir, { recursive: true, force: true })
})

/** A deployment that can take the secret and load the products. */
function deploymentState(overrides: Partial<SyncDeployment> = {}): SyncDeployment {
  return { url: DEV_URL, envNames: ['AUTH_SECRET', 'SITE_URL', 'BILLING_ACCESS_TOKEN'], billingEnvironment: 'sandbox', ...overrides }
}

/** The provider side: creates the endpoint it is given, unless creating is blocked. */
function providerSync(endpoint: 'create' | 'exists' = 'create') {
  return vi.fn(async (_catalog: unknown, options: BillingSyncOptions): Promise<BillingSyncResult> => {
    const url = options.webhookUrl
    if (!url) return { log: [], ids: { products: {}, meters: {} } }
    if (endpoint === 'exists') {
      return { log: [{ action: 'exists', kind: 'webhook', key: url, id: 'wh_1' }], ids: { products: {}, meters: {} }, webhook: { id: 'wh_1', secret: SECRET, created: false } }
    }
    if (options.webhookBlocked) {
      return { log: [{ action: 'warn', kind: 'webhook', key: url, note: options.webhookBlocked }], ids: { products: {}, meters: {} } }
    }
    return { log: [{ action: 'created', kind: 'webhook', key: url, id: 'wh_1' }], ids: { products: {}, meters: {} }, webhook: { id: 'wh_1', secret: SECRET, created: true } }
  })
}

function deps(overrides: Partial<BillingSyncDeps> & { deployment?: Partial<SyncDeployment> } = {}) {
  const { deployment, ...rest } = overrides
  const setEnv = vi.fn(async () => {})
  const syncProducts = vi.fn(async () => {})
  const readDeployment = vi.fn(async () => deploymentState(deployment))
  return { setEnv, syncProducts, readDeployment, sync: providerSync(), print: (line: string) => lines.push(line), ...rest }
}

const output = () => lines.join('\n')

describe('billing sync — the webhook secret', () => {
  it('provisions the endpoint of the deployment it writes, stores its secret there, and never prints it', async () => {
    const steps = deps()
    const { exitCode, report } = await runBillingSync(rootDir, {}, steps)

    expect(exitCode).toBe(0)
    expect(steps.sync).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ webhookUrl: DEV_WEBHOOK }))
    expect(steps.setEnv).toHaveBeenCalledWith(rootDir, 'BILLING_WEBHOOK_SECRET', SECRET)
    expect(report).toMatchObject({ deployment: DEV_URL, webhook: { url: DEV_WEBHOOK, action: 'created', secret: 'stored' } })
    expect(output()).toContain('deployment demo-slug-1')
    expect(output()).not.toContain(SECRET)
    expect(JSON.stringify(report)).not.toContain(SECRET)
  })

  it('fails when the secret can\'t be stored, and points at a command that asks for it rather than one that carries it', async () => {
    const steps = deps({ setEnv: vi.fn(() => Promise.reject(new Error('convex env set exited with code 1: no deployment'))) })
    const { exitCode, report } = await runBillingSync(rootDir, {}, steps)

    expect(exitCode).toBe(1)
    expect(report?.webhook).toMatchObject({ action: 'created', secret: 'not-stored' })
    expect(output()).toContain('convex env set exited with code 1: no deployment')
    expect(output()).toContain('`npx convex env set BILLING_WEBHOOK_SECRET` asks for it')
    expect(output()).toContain('Run billing sync again')
    expect(output()).not.toMatch(/BILLING_WEBHOOK_SECRET <secret>/)
    expect(output()).not.toContain(SECRET)
  })

  it('stores an existing endpoint\'s secret on a deployment that lacks it', async () => {
    const steps = deps({ sync: providerSync('exists') })
    const { exitCode, report } = await runBillingSync(rootDir, {}, steps)

    expect(exitCode).toBe(0)
    expect(steps.setEnv).toHaveBeenCalledWith(rootDir, 'BILLING_WEBHOOK_SECRET', SECRET)
    expect(report?.webhook).toMatchObject({ action: 'exists', secret: 'stored' })
  })

  it('keeps a secret the deployment already holds unless --force', async () => {
    const holding = { envNames: ['AUTH_SECRET', 'SITE_URL', 'BILLING_ACCESS_TOKEN', 'BILLING_WEBHOOK_SECRET'] }
    const kept = deps({ sync: providerSync('exists'), deployment: holding })
    const { report } = await runBillingSync(rootDir, {}, kept)
    expect(kept.setEnv).not.toHaveBeenCalled()
    expect(report?.webhook).toMatchObject({ action: 'exists', secret: 'kept', note: expect.stringContaining('--force') })

    const forced = deps({ sync: providerSync('exists'), deployment: holding })
    const { report: replaced } = await runBillingSync(rootDir, { force: true }, forced)
    expect(forced.setEnv).toHaveBeenCalledWith(rootDir, 'BILLING_WEBHOOK_SECRET', SECRET)
    expect(replaced?.webhook).toMatchObject({ action: 'exists', secret: 'stored' })
  })

  it('creates no endpoint whose secret would replace the deployment\'s own, unless --force', async () => {
    const holding = { envNames: ['BILLING_ACCESS_TOKEN', 'BILLING_WEBHOOK_SECRET'] }
    const blocked = deps({ deployment: holding })
    const { exitCode, report } = await runBillingSync(rootDir, {}, blocked)
    expect(exitCode).toBe(0)
    expect(blocked.sync).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ webhookBlocked: expect.stringContaining('--force') }))
    expect(blocked.setEnv).not.toHaveBeenCalled()
    expect(report?.webhook).toMatchObject({ url: DEV_WEBHOOK, action: 'skipped', secret: 'kept' })
    expect(output()).toContain('not created')

    const forced = deps({ deployment: holding })
    const { report: created } = await runBillingSync(rootDir, { force: true }, forced)
    expect(forced.sync).toHaveBeenCalledWith(expect.anything(), expect.not.objectContaining({ webhookBlocked: expect.anything() }))
    expect(created?.webhook).toMatchObject({ action: 'created', secret: 'stored' })
  })

  it('stores the secret before it writes the id map', async () => {
    const order: string[] = []
    const steps = deps({ setEnv: vi.fn(async () => {
      order.push(existsSync(join(rootDir, 'backend/billing.generated.ts')) ? 'after the id map' : 'before the id map')
    }) })
    await runBillingSync(rootDir, {}, steps)
    expect(order).toEqual(['before the id map'])
  })
})

describe('billing sync — the webhook URL', () => {
  it('says why it leaves the webhook alone with --webhook off', async () => {
    const steps = deps()
    const { report } = await runBillingSync(rootDir, { webhook: 'off' }, steps)

    expect(steps.sync).toHaveBeenCalledWith(expect.anything(), expect.not.objectContaining({ webhookUrl: expect.anything() }))
    expect(report?.webhook).toMatchObject({ url: null, action: 'skipped', secret: 'none' })
    expect(output()).toContain('--webhook off')
  })

  it('leaves the webhook of a deployment on this machine alone, and says so', async () => {
    const steps = deps({ deployment: { url: 'http://127.0.0.1:3210' } })
    const { exitCode, report } = await runBillingSync(rootDir, {}, steps)

    expect(exitCode).toBe(0)
    expect(steps.sync).toHaveBeenCalledWith(expect.anything(), expect.not.objectContaining({ webhookUrl: expect.anything() }))
    expect(report?.webhook).toMatchObject({ action: 'skipped', note: expect.stringContaining('this machine') })
    expect(output()).toContain('Webhook skipped')
  })

  it('leaves it alone when the deployment cannot be read, in a sandbox sync', async () => {
    const steps = deps({ deployment: { url: null, envNames: null, billingEnvironment: null } })
    const { exitCode, report } = await runBillingSync(rootDir, {}, steps)

    expect(exitCode).toBe(0)
    expect(report).toMatchObject({ deployment: null, webhook: { action: 'skipped' }, products: { status: 'skipped' } })
    expect(steps.syncProducts).not.toHaveBeenCalled()
  })

  it('refuses an endpoint on another deployment than the one its secret would go to', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'NUXT_PUBLIC_CONVEX_SITE_URL=https://happy-otter-123.convex.site\n')
    const steps = deps()
    const { exitCode } = await runBillingSync(rootDir, {}, steps)

    expect(exitCode).toBe(1)
    expect(steps.sync).not.toHaveBeenCalled()
    expect(output()).toMatch(/happy-otter-123's, but its secret would be stored on demo-slug-1/)
  })

  it('takes --webhook as given, and still refuses it on another deployment', async () => {
    const custom = deps()
    await runBillingSync(rootDir, { webhook: 'https://api.example.com/billing/events' }, custom)
    expect(custom.sync).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ webhookUrl: 'https://api.example.com/billing/events' }))

    const elsewhere = deps()
    const { exitCode } = await runBillingSync(rootDir, { webhook: 'https://other-slug-9.convex.site/billing/events' }, elsewhere)
    expect(exitCode).toBe(1)
    expect(elsewhere.sync).not.toHaveBeenCalled()
  })
})

describe('billing sync --env production', () => {
  beforeEach(() => {
    // .env.local names the dev deployment, and its site URL is dev's.
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\nNUXT_PUBLIC_CONVEX_SITE_URL=https://happy-otter-123.convex.site\n')
  })

  const production = (deployment: Partial<SyncDeployment> = {}) => deps({ deployment: { url: 'https://prod-slug-42.convex.cloud', billingEnvironment: 'production', envNames: ['BILLING_ACCESS_TOKEN', 'BILLING_ENVIRONMENT'], ...deployment } })

  it('reads production, and provisions production\'s endpoint — never the dev site URL .env.local names', async () => {
    const steps = production()
    const { exitCode, report } = await runBillingSync(rootDir, { environment: 'production' }, steps)

    expect(exitCode).toBe(0)
    expect(steps.readDeployment).toHaveBeenCalledWith(rootDir, true)
    expect(steps.sync).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ environment: 'production', webhookUrl: 'https://prod-slug-42.convex.site/billing/events' }))
    expect(steps.syncProducts).toHaveBeenCalledWith(rootDir, true)
    expect(report?.deployment).toBe('https://prod-slug-42.convex.cloud')
    expect(output()).toContain('production deployment prod-slug-42')
  })

  it('takes a custom domain from the process env over the derived site', async () => {
    vi.stubEnv('NUXT_PUBLIC_BACKEND_SITE_URL', 'https://api.example.com/')
    const steps = production()
    await runBillingSync(rootDir, { environment: 'production' }, steps)
    expect(steps.sync).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ webhookUrl: 'https://api.example.com/billing/events' }))
  })

  it('refuses when production cannot be read and no --webhook says where its endpoint goes', async () => {
    const steps = production({ url: null, envNames: null, billingEnvironment: null })
    const { exitCode } = await runBillingSync(rootDir, { environment: 'production' }, steps)

    expect(exitCode).toBe(1)
    expect(steps.sync).not.toHaveBeenCalled()
    expect(output()).toContain('--env production refused')
    expect(output()).toContain('--webhook')
  })

  it('refuses a dev or preview deploy key, which would put the secret on that deployment', async () => {
    for (const key of ['dev:brave-fox-123|secret', 'preview:team:app|secret']) {
      vi.stubEnv('CONVEX_DEPLOY_KEY', key)
      const steps = production()
      const { exitCode } = await runBillingSync(rootDir, { environment: 'production' }, steps)
      expect(exitCode).toBe(1)
      expect(steps.readDeployment).not.toHaveBeenCalled()
      expect(steps.sync).not.toHaveBeenCalled()
    }
    expect(output()).toContain('--env production refused')
  })
})

describe('billing sync — the environment', () => {
  it('repeats an unknown --env back, but never a value read from the env', async () => {
    const typed = deps()
    expect((await runBillingSync(rootDir, { environment: 'staging' }, typed)).exitCode).toBe(1)
    expect(output()).toContain('Unknown billing environment \'staging\'')

    lines = []
    vi.stubEnv('BILLING_ENVIRONMENT', 'polar_oat_pasted_into_the_wrong_name')
    const fromEnv = deps()
    expect((await runBillingSync(rootDir, {}, fromEnv)).exitCode).toBe(1)
    expect(output()).toContain('BILLING_ENVIRONMENT is neither sandbox nor production')
    expect(output()).not.toContain('polar_oat_pasted_into_the_wrong_name')
    expect(fromEnv.sync).not.toHaveBeenCalled()
  })
})

describe('billing sync — a sandbox sync and the deploy key', () => {
  // The Convex CLI follows the key whatever the flags say: a production key
  // would get the sandbox secret, a project key would pick a deployment of
  // its own.
  it.each([
    ['a production key', 'prod:prod-slug-42|secret'],
    ['a legacy key, which is a production one', 'legacy-admin-key-without-type'],
    ['a project key', 'project:team:app|secret'],
  ])('refuses %s', async (_label, key) => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', key)
    const steps = deps()
    const { exitCode } = await runBillingSync(rootDir, {}, steps)

    expect(exitCode).toBe(1)
    expect(steps.readDeployment).not.toHaveBeenCalled()
    expect(steps.sync).not.toHaveBeenCalled()
    expect(output()).toContain('Sandbox sync refused')
  })

  it('refuses a production key kept in .env.local too', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOY_KEY=prod:prod-slug-42|secret\n')
    const { exitCode } = await runBillingSync(rootDir, {}, deps())
    expect(exitCode).toBe(1)
  })

  it('goes ahead with a dev key, writing the deployment it names', async () => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', 'dev:demo-slug-1|secret')
    const steps = deps()
    const { exitCode } = await runBillingSync(rootDir, {}, steps)
    expect(exitCode).toBe(0)
    expect(steps.setEnv).toHaveBeenCalled()
  })
})

describe('billing sync — the products', () => {
  it('writes the id map and loads the deployment\'s products', async () => {
    const steps = deps()
    const { report } = await runBillingSync(rootDir, { webhook: 'off' }, steps)

    expect(steps.syncProducts).toHaveBeenCalledWith(rootDir, false)
    expect(report?.products).toEqual({ status: 'synced' })
    expect(existsSync(join(rootDir, 'backend/billing.generated.ts'))).toBe(true)
    expect(readFileSync(report!.generated!, 'utf8')).toContain('sandbox')
  })

  it('reports the real error of a failed load, without failing the sync', async () => {
    const steps = deps({ syncProducts: vi.fn(() => Promise.reject(new Error('convex run exited with code 1: Uncaught Error: 401 Unauthorized'))) })
    const { exitCode, report } = await runBillingSync(rootDir, {}, steps)

    expect(exitCode).toBe(0)
    expect(report?.products).toMatchObject({ status: 'failed', note: expect.stringContaining('401 Unauthorized') })
    expect(output()).toContain('401 Unauthorized')
    expect(output()).toContain('npx convex run billing:syncProducts')
  })

  it('does not try before the deployment has its access token, and says what to run', async () => {
    const steps = deps({ deployment: { envNames: ['AUTH_SECRET', 'SITE_URL'] } })
    const { exitCode, report } = await runBillingSync(rootDir, {}, steps)

    expect(exitCode).toBe(0)
    expect(steps.syncProducts).not.toHaveBeenCalled()
    expect(report?.products).toMatchObject({ status: 'skipped', note: expect.stringContaining('npx nuxt-backend env push') })
    expect(output()).toContain('npx convex run billing:syncProducts')
  })

  it('does not load the other environment\'s catalog', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\n')
    // Production's BILLING_ENVIRONMENT is unset, so it runs sandbox.
    const steps = deps({ deployment: { url: 'https://prod-slug-42.convex.cloud', envNames: ['BILLING_ACCESS_TOKEN'], billingEnvironment: 'sandbox' } })
    const { report } = await runBillingSync(rootDir, { environment: 'production' }, steps)

    expect(steps.syncProducts).not.toHaveBeenCalled()
    expect(report?.products).toMatchObject({ status: 'skipped', note: expect.stringContaining('npx convex env set --prod BILLING_ENVIRONMENT production') })
  })

  it('writes and loads nothing on a dry run', async () => {
    const steps = deps({ sync: vi.fn(async () => ({ log: [], ids: { products: {}, meters: {} } })) })
    const { report } = await runBillingSync(rootDir, { dryRun: true }, steps)

    expect(report).toMatchObject({ dryRun: true, generated: null, products: { status: 'skipped' } })
    expect(steps.setEnv).not.toHaveBeenCalled()
    expect(steps.syncProducts).not.toHaveBeenCalled()
    expect(existsSync(join(rootDir, 'backend/billing.generated.ts'))).toBe(false)
  })
})

describe('its contract', () => {
  it('declares what it may change, what --json prints and its exit codes', () => {
    const contract = COMMAND_CONTRACTS.get('billing sync')!
    expect(contract.sideEffects).toEqual(['writes provider accounts', 'writes project files', 'writes the dev deployment', 'writes production'])
    expect(Object.keys(contract.exitCodes)).toEqual(['0', '1'])
    expect((billingSync.meta as { description: string }).description).toMatch(/\[writes provider accounts; writes project files; writes the dev deployment; writes production\]$/)
    expect(billingSync.args).toHaveProperty('json')
    expect(billingSync.args).toHaveProperty('force')
  })

  it('is stated on the CLI page: side effects, every exit code and every flag', () => {
    const page = readFileSync(new URL('../../website/content/docs/10.reference/09.cli/index.md', import.meta.url), 'utf8')
    const section = page.slice(page.indexOf('## `billing sync`'))
    expect(section).toContain('**Side effects:**')
    for (const code of Object.keys(COMMAND_CONTRACTS.get('billing sync')!.exitCodes)) expect(section).toContain(`\`${code}\``)
    for (const flag of Object.keys(billingSync.args as Record<string, unknown>).filter(flag => flag !== 'cwd')) expect(section).toContain(`| \`--${flag}`)
  })
})
