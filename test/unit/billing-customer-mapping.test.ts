import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// billing-customer-mapping: doctor reads a page of the customer ids the
// billing provider's component maps entities onto, asks the provider for
// each with the token it reaches the provider with, and warns when the
// provider does not know them: the deployment's billing data belongs to
// another organization (#173).

const deployment = vi.hoisted(() => ({ customers: '[]' as string, calls: [] as string[][] }))
vi.mock('../../src/convex-cli', () => ({
  runConvex: vi.fn(async (_rootDir: string, args: string[]) => {
    deployment.calls.push(args)
    if (args[0] === 'env') return { stdout: 'AUTH_SECRET\nSITE_URL\nBILLING_ACCESS_TOKEN\n', stderr: '' }
    if (args.includes('--inline-query') && args.includes('polar')) return { stdout: `${deployment.customers}\n`, stderr: '' }
    if (args.includes('--inline-query')) return { stdout: 'true\n', stderr: '' }
    return { stdout: '{}', stderr: '' }
  }),
}))

/** What the provider answers per customer id: the customer, "not found", or a refusal. */
const provider = vi.hoisted(() => ({ answers: {} as Record<string, 'known' | 'unknown' | 'refused'>, asked: [] as string[] }))
vi.mock('@polar-sh/sdk/funcs/customersGet.js', () => ({
  customersGet: vi.fn(async (_client: unknown, { id }: { id: string }) => {
    provider.asked.push(id)
    const answer = provider.answers[id] ?? 'unknown'
    if (answer === 'known') return { ok: true, value: { id } }
    return { ok: false, error: { statusCode: answer === 'unknown' ? 404 : 401 } }
  }),
}))

const { checkMappedCustomers, customerMappingFindings, MAPPED_CUSTOMERS_QUERY, readMappedCustomers } = await import('../../src/cli/billing/mappings')
const { runDoctorChecks } = await import('../../src/doctor')
const { applyProductionPosture } = await import('../../src/findings')

const client = {} as never
let rootDir: string

beforeEach(() => {
  deployment.customers = '[]'
  deployment.calls.length = 0
  provider.answers = {}
  provider.asked.length = 0
  for (const name of ['CONVEX_DEPLOYMENT', 'CONVEX_DEPLOY_KEY', 'BILLING_ACCESS_TOKEN', 'BACKEND_ENVIRONMENT', 'NUXT_PUBLIC_BACKEND_URL', 'NUXT_PUBLIC_BACKEND_SITE_URL']) vi.stubEnv(name, undefined)
  rootDir = mkdtempSync(join(tmpdir(), 'billing-customer-mapping-'))
  writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\nBILLING_ACCESS_TOKEN=polar_oat_new_sandbox\n')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('the mapped customers', () => {
  it('reads a page of ids off the provider\'s component, on the deployment doctor checks', async () => {
    deployment.customers = '["cus_1", "cus_2"]'
    expect(await readMappedCustomers(rootDir, { prod: false })).toEqual(['cus_1', 'cus_2'])
    expect(deployment.calls.at(-1)).toEqual(['run', '--component', 'polar', '--inline-query', MAPPED_CUSTOMERS_QUERY])
    await readMappedCustomers(rootDir, { prod: true })
    expect(deployment.calls.at(-1)!.slice(0, 2)).toEqual(['run', '--prod'])
  })

  it('reads only the first ten ids, nothing else of a row', async () => {
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (ctx: unknown) => Promise<unknown>
    const read = new AsyncFunction('ctx', MAPPED_CUSTOMERS_QUERY)
    const rows = Array.from({ length: 25 }, (_, index) => ({ id: `cus_${index}`, userId: `entity_${index}`, metadata: { secret: true } }))
    const ids = await read({
      db: {
        query: (table: string) => {
          expect(table).toBe('customers')
          return { take: async (count: number) => rows.slice(0, count) }
        },
      },
    })
    expect(ids).toEqual(rows.slice(0, 10).map(row => row.id))
  })

  it('reads nothing from a deployment that does not answer, or answers something else', async () => {
    deployment.customers = 'Error: no component polar'
    expect(await readMappedCustomers(rootDir, { prod: false })).toBeNull()
    deployment.customers = '[1, 2]'
    expect(await readMappedCustomers(rootDir, { prod: false })).toBeNull()
  })

  it('counts the customers the provider does not know, and tells nothing when it refuses to answer', async () => {
    provider.answers = { cus_1: 'known', cus_2: 'unknown', cus_3: 'unknown' }
    expect(await checkMappedCustomers(client, ['cus_1', 'cus_2', 'cus_3'])).toEqual({ sampled: 3, unknown: 2 })
    expect(provider.asked).toEqual(['cus_1', 'cus_2', 'cus_3'])
    // A refused token is billing-organization's to report, not a stale mapping.
    provider.answers.cus_2 = 'refused'
    expect(await checkMappedCustomers(client, ['cus_1', 'cus_2', 'cus_3'])).toBeNull()
  })
})

describe('billing-customer-mapping', () => {
  it('passes when nothing is mapped yet, or the provider knows every customer sampled', () => {
    expect(customerMappingFindings(null, { prod: false })).toEqual([])
    expect(customerMappingFindings({ sampled: 0, unknown: 0 }, { prod: false })[0]).toMatchObject({ id: 'billing-customer-mapping', capability: 'billing', status: 'pass' })
    expect(customerMappingFindings({ sampled: 4, unknown: 0 }, { prod: false })[0]).toMatchObject({ status: 'pass', message: expect.stringContaining('4 customers') })
  })

  it('warns that the billing data belongs to another organization, with the reset that fixes a dev deployment', () => {
    const [warn] = customerMappingFindings({ sampled: 3, unknown: 3 }, { prod: false })
    expect(warn).toMatchObject({ id: 'billing-customer-mapping', status: 'warn', docsUrl: 'https://nuxt-backend.dev/d/billing-customer-mapping' })
    expect(warn!.message).toContain('belongs to another organization')
    expect(warn!.message).toContain('customer_unknown')
    expect(warn!.fixHint).toContain('npx nuxt-backend billing reset')
  })

  it('names deleted customers too when only some are unknown', () => {
    const [warn] = customerMappingFindings({ sampled: 10, unknown: 1 }, { prod: false })
    expect(warn!.message).toContain('does not know 1 of the 10 customers')
    expect(warn!.message).toContain('deleted at the provider')
    expect(warn!.message).toContain('that entity')
  })

  it('never offers the reset on production, and fails there', () => {
    const findings = customerMappingFindings({ sampled: 2, unknown: 2 }, { prod: true })
    expect(findings[0]!.fixHint).not.toContain('npx nuxt-backend billing reset')
    expect(findings[0]!.fixHint).toContain('npx convex env set --prod BILLING_ACCESS_TOKEN')
    expect(applyProductionPosture(findings)[0]).toMatchObject({ status: 'fail' })
  })

  it('reports in doctor\'s billing capability, with the token visible here', async () => {
    deployment.customers = '["cus_old_1", "cus_old_2"]'
    const findings = await runDoctorChecks(rootDir, { prod: false, only: ['billing'] })
    expect(findings.find(finding => finding.id === 'billing-customer-mapping')).toMatchObject({ status: 'warn' })
    expect(provider.asked).toEqual(['cus_old_1', 'cus_old_2'])
  })

  it('reads nothing off the deployment without a token, or when billing is not checked', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\n')
    deployment.customers = '["cus_old_1"]'
    const findings = await runDoctorChecks(rootDir, { prod: false, only: ['billing'] })
    expect(findings.some(finding => finding.id === 'billing-customer-mapping')).toBe(false)
    expect(deployment.calls.some(args => args.includes('polar'))).toBe(false)
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\nBILLING_ACCESS_TOKEN=polar_oat_new_sandbox\n')
    await runDoctorChecks(rootDir, { prod: false, only: ['auth'] })
    expect(deployment.calls.some(args => args.includes('polar'))).toBe(false)
  })
})
