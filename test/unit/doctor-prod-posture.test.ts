import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCommand } from 'citty'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from '../../src/cli/main'
import type { StatusReport } from '../../src/cli/status'
import type { EmailPosture } from '../../src/convex/email-posture'
import { runConvex } from '../../src/convex-cli'

// `doctor --prod` reads what production's env names alone cannot say: the
// two switches' values and SITE_URL's origin (`convex env get`), and the
// facts the deployment derives from its own email env (`posture:email`),
// then probes the site SITE_URL names. A setting left at its unset default
// fails; the same setting chosen on purpose warns. `status --prod` shows the
// same findings. The Convex CLI is mocked; the site answers from a stub.

const PUBLIC = 'https://app.test'
const PRODUCTION = 'https://prod-slug-42.convex.cloud'

const deployed = vi.hoisted(() => ({
  names: [] as string[],
  values: {} as Record<string, string>,
  posture: null as unknown,
}))

vi.mock('../../src/convex-cli', () => ({
  runConvex: vi.fn(async (_rootDir: string, args: string[]) => {
    if (args[0] === 'env' && args[1] === 'get') return { stdout: `${deployed.values[args.at(-1)!] ?? ''}\n`, stderr: '' }
    if (args[0] === 'env') return { stdout: `${deployed.names.join('\n')}\n`, stderr: '' }
    if (args[0] === 'function-spec') return { stdout: JSON.stringify({ url: 'https://prod-slug-42.convex.cloud', functions: [] }), stderr: '' }
    if (args[0] === 'run' && args.includes('posture:email')) {
      if (deployed.posture === null) throw new Error('Could not find function for \'posture:email\'')
      return { stdout: JSON.stringify(deployed.posture), stderr: '' }
    }
    if (args[0] === 'run') return { stdout: '{}', stderr: '' }
    return { stdout: '', stderr: '' }
  }),
}))

/** Production's site, healthy, unless `open` makes its health endpoint show its detail to anyone. */
const site = vi.hoisted(() => ({ open: false, asked: [] as string[] }))

function siteAnswer(url: URL, init: RequestInit | undefined): Response {
  site.asked.push(`${init?.method ?? 'GET'} ${url.pathname}`)
  const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } })
  switch (url.pathname) {
    case '/':
      return new Response(`<script>window.__NUXT__.config={public:{convex:{url:"${PRODUCTION}"}}}</script>`, {
        headers: { 'content-type': 'text/html', 'strict-transport-security': 'max-age=31536000', 'content-security-policy': `connect-src 'self' ${PRODUCTION} wss://prod-slug-42.convex.cloud` },
      })
    case '/settings':
      return new Response(null, { status: 302, headers: { location: '/login' } })
    case '/api/backend/health':
      return json(site.open ? { status: 'ok', capabilities: { auth: 'live' }, detail: { auth: { reason: 'x', missingEnv: [], top: null } } } : { status: 'ok', capabilities: { auth: 'live' } })
    default:
      return new Response('not found', { status: 404 })
  }
}

let rootDir: string

/** Every name a live production sets. */
const LIVE = ['AUTH_SECRET', 'SITE_URL', 'BACKEND_ENVIRONMENT', 'EMAIL_API_KEY', 'EMAIL_FROM', 'EMAIL_WEBHOOK_SECRET', 'BILLING_ACCESS_TOKEN', 'BILLING_WEBHOOK_SECRET']

const HEALTHY: EmailPosture = {
  sender: { domain: 'acme.dev' },
  provider: { access: 'full', domain: { status: 'verified', sending: true }, week: { sent: 500, delivered: 495, bounced: 5, complained: 0 }, quota: { monthly: 2400 } },
}

const MACHINE_ENV = ['NUXT_PUBLIC_CONVEX_SITE_URL', 'NUXT_PUBLIC_BACKEND_URL', 'NUXT_PUBLIC_CONVEX_URL', 'CONVEX_DEPLOYMENT', 'CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', 'SITE_URL', 'EMAIL_API_KEY', 'EMAIL_FROM', 'BACKEND_ENVIRONMENT', 'BILLING_ACCESS_TOKEN', 'VERCEL']

beforeEach(() => {
  deployed.names = [...LIVE]
  deployed.values = { BACKEND_ENVIRONMENT: 'production', SITE_URL: `${PUBLIC}/` }
  deployed.posture = HEALTHY
  site.open = false
  site.asked = []
  for (const name of MACHINE_ENV) vi.stubEnv(name, undefined)
  rootDir = mkdtempSync(join(tmpdir(), 'doctor-posture-'))
  writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\n')
  mkdirSync(join(rootDir, 'backend/_generated'), { recursive: true })
  vi.mocked(runConvex).mockClear()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    // The webhook routes on the deployment answer as mounted ones do.
    return url.origin === PUBLIC ? siteAnswer(url, init) : new Response('unsigned', { status: 401 })
  }))
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  process.exitCode = undefined
})

async function doctor(args: string[] = []) {
  await runCommand(main, { rawArgs: ['doctor', '--json', '--prod', ...args, '--cwd', rootDir] })
  const report = JSON.parse(vi.mocked(console.log).mock.calls.flat().join('\n')) as { findings: Array<{ id: string, capability: string, status: string, message: string }> }
  return Object.fromEntries(report.findings.map(finding => [finding.id, finding]))
}

const gets = () => vi.mocked(runConvex).mock.calls.map(([, args]) => args).filter(args => args[0] === 'env' && args[1] === 'get')

describe('production\'s environment and sender', () => {
  it('fail when left at their unset defaults: every provider in its test mode, the onboarding sender', async () => {
    deployed.names = LIVE.filter(name => !['BACKEND_ENVIRONMENT', 'EMAIL_FROM'].includes(name))
    deployed.posture = { sender: 'unset', provider: HEALTHY.provider }
    const findings = await doctor()
    expect(findings['deployment-backend-environment']).toMatchObject({ status: 'fail', capability: 'data', message: expect.stringContaining('not set on production') })
    expect(findings['deployment-email-from']).toMatchObject({ status: 'fail', message: expect.stringContaining('onboarding address') })
    expect(process.exitCode).toBe(1)
    // An unset name is never read.
    expect(gets().map(args => args.at(-1))).toEqual(['SITE_URL'])
  })

  it.each(['development', 'preview'])('fails production that says %s, which keeps every provider in its test mode', async (value) => {
    deployed.values = { ...deployed.values, BACKEND_ENVIRONMENT: value }
    const findings = await doctor()
    expect(findings['deployment-backend-environment']).toMatchObject({ status: 'fail', message: expect.stringContaining(`BACKEND_ENVIRONMENT is ${value} on production`) })
    expect(process.exitCode).toBe(1)
  })

  it('warns, never fails, a value that is none of the four kinds, which the backend reads as unset', async () => {
    deployed.values = { ...deployed.values, BACKEND_ENVIRONMENT: 'prod' }
    expect((await doctor())['deployment-backend-environment']).toMatchObject({ status: 'warn', message: expect.stringContaining('could not be read as') })
  })

  it('warn when chosen on purpose: a deliberate sandbox', async () => {
    deployed.names = LIVE.filter(name => name !== 'EMAIL_FROM')
    deployed.values = { ...deployed.values, BACKEND_ENVIRONMENT: 'sandbox' }
    deployed.posture = { sender: 'unset', provider: HEALTHY.provider }
    const findings = await doctor()
    expect(findings['deployment-backend-environment']).toMatchObject({ status: 'warn', message: expect.stringContaining('on purpose') })
    expect(findings['deployment-email-from']).toMatchObject({ status: 'warn', message: expect.stringContaining('deliberate sandbox') })
  })

  it('pass a live production, and read only the environment and the site\'s origin, each once', async () => {
    const findings = await doctor()
    for (const id of ['deployment-backend-environment', 'deployment-email-from', 'site-url-origin', 'email-sender-domain', 'email-reputation', 'email-quota']) {
      expect(findings[id]?.status, id).toBe('pass')
    }
    expect(findings['deployment-email-from']!.message).toContain('acme.dev')
    expect(gets().map(args => args.at(-1)).sort()).toEqual(['BACKEND_ENVIRONMENT', 'SITE_URL'])
    expect(gets().every(args => args.includes('--prod'))).toBe(true)
    // The email facts come from the deployment itself, run with production's admin key.
    const run = vi.mocked(runConvex).mock.calls.find(([, args]) => args.includes('posture:email'))
    expect(run?.[1]).toEqual(['run', '--prod', '--component', 'backend', 'posture:email'])
    // Long enough for the action's provider reads to time out on their own first.
    expect(run?.[2]).toEqual({ timeout: 60_000 })
  })

  it('reads the dev deployment\'s switches outside --prod no more than before', async () => {
    await runCommand(main, { rawArgs: ['doctor', '--json', '--cwd', rootDir] })
    expect(gets()).toEqual([])
    expect(vi.mocked(runConvex).mock.calls.some(([, args]) => args.includes('posture:email'))).toBe(false)
    expect(site.asked).toEqual([])
  })
})

describe('production\'s email, as it reports it', () => {
  it('fails a sender domain the account lacks, and a key the provider refuses', async () => {
    deployed.posture = { sender: { domain: 'acme.dev' }, provider: { access: 'full', domain: 'absent' } }
    expect((await doctor())['email-sender-domain']).toMatchObject({ status: 'fail', message: expect.stringContaining('acme.dev is not a domain') })
    vi.mocked(console.log).mockClear()
    deployed.posture = { sender: { domain: 'acme.dev' }, provider: { access: 'refused', reason: 'validation_error' } }
    expect((await doctor())['email-sender-domain']).toMatchObject({ status: 'fail', message: expect.stringContaining('validation_error') })
  })

  it('warns a key that may only send, and a deployment that does not report', async () => {
    deployed.posture = { sender: { domain: 'acme.dev' }, provider: { access: 'sending', reason: 'restricted_api_key' } }
    const sending = await doctor()
    expect(sending['email-sender-domain']).toMatchObject({ status: 'warn', message: expect.stringContaining('may only send') })
    expect(sending['email-reputation']).toBeUndefined()
    vi.mocked(console.log).mockClear()
    deployed.posture = null
    expect((await doctor())['email-sender-domain']).toMatchObject({ status: 'warn', message: expect.stringContaining('posture:email') })
  })

  it('fails bounces above the provider\'s limit, and warns a daily quota', async () => {
    deployed.posture = { ...HEALTHY, provider: { ...HEALTHY.provider!, week: { sent: 1000, delivered: 900, bounced: 60, complained: 1 }, quota: { daily: 80, monthly: 900 } } }
    const findings = await doctor()
    expect(findings['email-reputation']).toMatchObject({ status: 'fail', message: expect.stringContaining('a bounce rate of 6%') })
    expect(findings['email-quota']).toMatchObject({ status: 'warn', message: expect.stringContaining('80 used today') })
  })

  it('warns rather than fails high rates on few sends', async () => {
    deployed.posture = { ...HEALTHY, provider: { ...HEALTHY.provider!, week: { sent: 20, delivered: 18, bounced: 2, complained: 0 } } }
    expect((await doctor())['email-reputation']).toMatchObject({ status: 'warn', message: expect.stringContaining('on few sends') })
  })
})

describe('production\'s site', () => {
  it('fails a SITE_URL left at a local origin, and probes nothing there', async () => {
    deployed.values = { ...deployed.values, SITE_URL: 'http://localhost:3000' }
    const findings = await doctor()
    expect(findings['site-url-origin']).toMatchObject({ status: 'fail', message: expect.stringContaining('http://localhost:3000') })
    expect(findings['site-https']).toBeUndefined()
    expect(site.asked).toEqual([])
  })

  it('fails a plain HTTP SITE_URL once, and probes nothing over it', async () => {
    deployed.values = { ...deployed.values, SITE_URL: 'http://app.test' }
    const findings = await doctor()
    expect(findings['site-url-origin']).toMatchObject({ status: 'fail', message: expect.stringContaining('not HTTPS') })
    // site-https does not fail it a second time: nothing is probed.
    expect(findings['site-https']).toBeUndefined()
    expect(site.asked).toEqual([])
  })

  it('says why nothing was probed in a run whose own findings would not', async () => {
    deployed.values = { ...deployed.values, SITE_URL: 'http://localhost:3000' }
    const monitoring = await doctor(['--only', 'monitoring'])
    expect(monitoring['monitoring-health']).toMatchObject({ status: 'warn', message: expect.stringContaining('http://localhost:3000, an origin on this machine, so the live site was not probed') })
    expect(monitoring['site-url-origin']).toBeUndefined()
    vi.mocked(console.log).mockClear()
    deployed.names = LIVE.filter(name => name !== 'SITE_URL')
    const hosting = await doctor(['--only', 'hosting'])
    expect(hosting['site-https']).toMatchObject({ status: 'warn', message: expect.stringContaining('SITE_URL is not set on production') })
    expect(site.asked).toEqual([])
    // A run with the auth capability says it in its own finding, once.
    vi.mocked(console.log).mockClear()
    deployed.names = [...LIVE]
    const full = await doctor()
    expect(full['site-url-origin']!.status).toBe('fail')
    expect(full['site-https']).toBeUndefined()
    expect(full['monitoring-health']).toBeUndefined()
  })

  it('probes the site SITE_URL names, and fails a health endpoint that shows its detail to anyone', async () => {
    site.open = true
    const findings = await doctor()
    expect(findings['site-https']!.status).toBe('pass')
    expect(findings['site-backend-url']).toMatchObject({ status: 'pass', message: expect.stringContaining(PRODUCTION) })
    expect(findings['monitoring-health']).toMatchObject({ status: 'fail', capability: 'monitoring' })
    expect(site.asked).toContain('GET /api/backend/health')
  })

  it('asks only what doctor --only wants', async () => {
    await doctor(['--only', 'email'])
    expect(site.asked).toEqual([])
    expect(gets().map(args => args.at(-1))).toEqual(['BACKEND_ENVIRONMENT'])
  })

  it('shows the same in status --prod', async () => {
    site.open = true
    await runCommand(main, { rawArgs: ['status', '--json', '--prod', '--cwd', rootDir] })
    const report = JSON.parse(vi.mocked(console.log).mock.calls.flat().join('\n')) as StatusReport
    expect(report.capabilities.find(capability => capability.name === 'monitoring')).toMatchObject({ state: 'failing', top: { id: 'monitoring-health', status: 'fail' } })
    expect(report.status).toBe('failing')
  })
})

describe('the catalog against its production ids', () => {
  beforeEach(() => {
    writeFileSync(join(rootDir, 'backend/billing.catalog.ts'), `export default {
  meters: { credits: {} },
  plans: {
    pro: { name: 'Pro', prices: { month: 1000, year: 10000 } },
    legacy: { name: 'Legacy', prices: { month: 500 }, retired: true },
  },
  packs: { credits100: { name: '100 credits', price: 500, credits: { meter: 'credits', units: 100 } } },
}
`)
    writeFileSync(join(rootDir, 'backend/billing.generated.ts'), `export const catalog = {
  sandbox: { products: { pro: 's1', 'pro:year': 's2', credits100: 's3' }, meters: { credits: { meterId: 'm', eventName: 'credits', property: 'amount' } } },
  production: { products: { pro: 'p1', credits100: 'p3' }, meters: {} },
}
`)
  })

  it('fails the prices, packs and meters production lacks once it bills in production, and warns them in the sandbox', async () => {
    const live = await doctor(['--only', 'billing'])
    expect(live['billing-catalog-production']).toMatchObject({ status: 'fail', message: expect.stringContaining('pro:year, meter credits') })
    expect(live['billing-catalog-production']!.message).not.toContain('legacy')
    vi.mocked(console.log).mockClear()
    deployed.values = { ...deployed.values, BACKEND_ENVIRONMENT: 'sandbox' }
    expect((await doctor(['--only', 'billing']))['billing-catalog-production']!.status).toBe('warn')
  })

  it('passes a catalog production can sell whole', async () => {
    writeFileSync(join(rootDir, 'backend/billing.generated.ts'), `export const catalog = {
  production: { products: { credits100: 'p3' }, plans: { pro: { month: 'p1', year: 'p2' } }, meters: { credits: { meterId: 'm', eventName: 'credits', property: 'amount' } } },
}
`)
    expect((await doctor(['--only', 'billing']))['billing-catalog-production']!.status).toBe('pass')
  })
})
