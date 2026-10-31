import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixProviderSettings } from '../../src/cli/provider-fix'
import { BILLING_WEBHOOK_PROVISION_EVENTS } from '../../src/convex/catalog'
import type { EmailSyncReport } from '../../src/convex/integrations/email-sync'
import { createPolarFake, type PolarFake } from '../fixtures/polar-fake/server'

// `doctor --fix` at the billing provider, end to end: the catalog read from
// the project, the token from .env.local, the deployment's endpoint found by
// its URL, and each confirmed change made through the provider SDK against
// the fake provider. provider-fix.test.ts holds the planning and the email
// half; here the email half is only asked whether its webhook is off.

const CLOUD = 'https://happy-otter-123.convex.cloud'
const ENDPOINT = 'https://happy-otter-123.convex.site/billing/events'

vi.mock('../../src/convex-cli', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/convex-cli')>(),
  runConvex: vi.fn(async (_rootDir: string, args: string[]) => {
    if (args[0] === 'function-spec') return { stdout: JSON.stringify({ url: CLOUD, functions: [] }), stderr: '' }
    if (args[0] === 'env' && args[1] === 'list') return { stdout: 'AUTH_SECRET\nBILLING_ACCESS_TOKEN\nBILLING_WEBHOOK_SECRET\n', stderr: '' }
    throw new Error(`convex ${args[0]} exited with code 1`)
  }),
}))

let rootDir: string
let fake: PolarFake
let lines: string[]
const print = (line: string) => void lines.push(line)
/** The email half: its webhook is on, so it asks for nothing. */
const emailOn = vi.fn(async () => ({ key: 'full', webhook: { url: 'https://happy-otter-123.convex.site/email/events', action: 'exists', missingEvents: [], enabled: true } }) as unknown as EmailSyncReport)

const TRIAL_CATALOG = 'export default { plans: { pro: { name: \'Pro\', prices: { month: 900 }, trial: { days: 14 } } } }\n'

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'provider-fix-billing-'))
  mkdirSync(join(rootDir, 'backend'))
  writeFileSync(join(rootDir, 'backend/billing.catalog.ts'), TRIAL_CATALOG)
  writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\nBILLING_ACCESS_TOKEN=polar_oat_sandbox\n')
  for (const name of ['CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT', 'BILLING_ACCESS_TOKEN', 'BACKEND_ENVIRONMENT', 'NUXT_PUBLIC_CONVEX_SITE_URL']) vi.stubEnv(name, undefined)
  fake = createPolarFake({ baseUrl: 'http://127.0.0.1:4747', fetcher: async () => new Response('Accepted', { status: 202 }) })
  // Trial abuse prevention off, every relied-on customer email off: what the fake starts with but the first.
  fake.state.organization.settings = { subscriptionSettings: { preventTrialAbuse: false } }
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => fake.handle(new Request(input, init)))
  lines = []
  emailOn.mockClear()
})
afterEach(async () => {
  await fake.idle()
  fake.close()
  rmSync(rootDir, { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

/** The endpoint the provider holds for the deployment, as a sync left it, then turned off after failed deliveries. */
function disabledEndpoint() {
  fake.ensureEndpoint(ENDPOINT, 'whsec_kept')
  const endpoint = Object.values(fake.state.endpoints).find(entry => entry.url === ENDPOINT)!
  endpoint.enabled = false
  return endpoint
}

const organization = () => fake.state.organization.settings ?? {}

describe('doctor --fix at the billing provider', () => {
  it('makes the setting changes a person confirms, and names the ones left as they are', async () => {
    const confirm = vi.fn(async ({ description }: { description: string }) => description.includes('trial abuse'))
    const report = await fixProviderSettings(rootDir, { prod: false, confirm, print, email: false })
    expect(confirm.mock.calls.map(([change]) => change.description)).toEqual([
      'Turn on trial abuse prevention, so one customer cannot start the same trial again.',
      'Turn on the trial reminder, so a customer hears before a trial turns into a charge.',
      expect.stringMatching(/^Turn the provider's .+ customer emails back on\.$/),
    ])
    expect(report).toEqual({ applied: ['trial-abuse'], skipped: ['trial-reminders', 'customer-emails'], reenabled: [] })
    expect(organization().subscriptionSettings).toMatchObject({ preventTrialAbuse: true })
    // The emails nobody confirmed stay off at the provider.
    expect(Object.values(organization().customerEmailSettings ?? { orderConfirmation: false }).every(on => on === false)).toBe(true)
    expect(lines).toEqual([
      '[nuxt-backend] doctor --fix: billing provider: Turn on trial abuse prevention, so one customer cannot start the same trial again.',
      '[nuxt-backend] doctor --fix: left as they are (not confirmed): trial-reminders, customer-emails.',
    ])
  })

  it('turns the deployment\'s endpoint back on once its route answers the probe, with every event, and says to replay', async () => {
    const endpoint = disabledEndpoint()
    const probe = vi.fn(async () => ({ state: 'mounted' as const }))
    const report = await fixProviderSettings(rootDir, { prod: false, confirm: async ({ description }) => description.includes('webhook endpoint'), print, email: false }, { probe })
    expect(probe).toHaveBeenCalledWith(ENDPOINT)
    expect(endpoint.enabled).toBe(true)
    expect(endpoint.events).toEqual(expect.arrayContaining([...BILLING_WEBHOOK_PROVISION_EVENTS]))
    expect(report.applied).toEqual(['webhook-enabled', 'webhook-events'])
    expect(report.reenabled).toEqual(['billing'])
    expect(lines).toContain('[nuxt-backend] Replay what the provider held back while it was off: the admin console\'s Webhooks tab, https://nuxt-backend.dev/docs/ship/operate/replay.')
  })

  it('keeps the endpoint off while its route fails the probe, and still offers the events it lacks', async () => {
    const endpoint = disabledEndpoint()
    const confirm = vi.fn(async () => true)
    const report = await fixProviderSettings(rootDir, { prod: false, confirm, print, email: false }, { probe: async () => ({ state: 'missing', status: 404 }) })
    expect(endpoint.enabled).toBe(false)
    expect(report.applied).not.toContain('webhook-enabled')
    expect(report.applied).toContain('webhook-events')
    expect(report.reenabled).toEqual([])
    expect(lines[0]).toBe('[nuxt-backend] doctor --fix: the billing webhook endpoint stays off: its route does not answer the probe yet. Fix the route (doctor\'s billing-webhook-route), then run doctor --fix again.')
  })

  it('leaves the provider alone without a token, or without a catalog, and asks nothing', async () => {
    const reached = vi.fn(fake.handle)
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => reached(new Request(input, init)))
    const confirm = vi.fn(async () => true)
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\n')
    expect(await fixProviderSettings(rootDir, { prod: false, confirm, print, email: false })).toEqual({ applied: [], skipped: [], reenabled: [] })
    // Production's token is the shell's alone: the one in .env.local is development's.
    writeFileSync(join(rootDir, '.env.local'), 'BILLING_ACCESS_TOKEN=polar_oat_sandbox\n')
    expect((await fixProviderSettings(rootDir, { prod: true, confirm, print, email: false })).applied).toEqual([])
    rmSync(join(rootDir, 'backend/billing.catalog.ts'))
    expect((await fixProviderSettings(rootDir, { prod: false, confirm, print, email: false })).applied).toEqual([])
    expect(reached).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    expect(lines).toEqual([])
  })

  it('says a change the provider refused, and goes on to the email half', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      if (request.method === 'PATCH' && new URL(request.url).pathname.startsWith('/v1/organizations/')) {
        return Response.json({ error: 'NotPermitted', detail: 'The access token lacks organizations:write.' }, { status: 403 })
      }
      return fake.handle(request)
    })
    const report = await fixProviderSettings(rootDir, { prod: false, confirm: async () => true, print }, { emailSync: emailOn })
    expect(report.applied).toEqual([])
    expect(lines[0]).toMatch(/^\[nuxt-backend\] doctor --fix: the billing provider refused a change: /)
    expect(emailOn).toHaveBeenCalledWith(rootDir, { prod: false, dryRun: true })
    expect(organization().subscriptionSettings).toMatchObject({ preventTrialAbuse: false })
  })
})
