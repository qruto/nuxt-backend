import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deployKeyOf } from '../../src/cli/deploy'
import { buildCmd, runBuild } from '../../src/cli/deploy/build'
import { EMAIL_WEBHOOK_EVENTS, ensureEmailWebhook, type EmailWebhookClient } from '../../src/cli/deploy/email-webhook'
import { buildCommandAdvice, deployHost, vercelEnvNames, type DeployHost } from '../../src/cli/deploy/host'
import { productionOrigin, runDeploy, type DeployDeps, type DeployReport } from '../../src/cli/deploy/run'
import { ALL_EMAIL_EVENTS } from '../../src/convex/integrations/email'
import type { BackendEnvironment } from '../../src/convex/environment'
import { finding } from '../../src/findings'

// `nuxt-backend deploy` against stand-ins for Convex, Vercel and the two
// providers: what each step writes, what a second run leaves alone, and that
// no value it handles is ever printed.

const PROD_URL = 'https://happy-otter-123.convex.cloud'
const BILLING_TOKEN = 'polar_oat_secret-token'
const EMAIL_KEY = 're_secret-key'
const WEBHOOK_SECRET = 'whsec_secret'
const DEPLOY_KEY = 'prod:happy-otter-123|secret-deploy-key'

/** A production deployment in memory: its env, and every call the run made. */
function fakeProduction({ exists = true, names = [] as string[], environment = undefined as BackendEnvironment | null | undefined } = {}) {
  const env = new Map<string, string>(names.map(name => [name, 'kept']))
  if (environment !== undefined) env.set('BACKEND_ENVIRONMENT', environment ?? 'unreadable')
  let created = exists
  const calls = { create: 0, push: 0, keys: 0, set: [] as string[] }
  return {
    env,
    calls,
    backend: {
      envNames: async () => created ? [...env.keys()] : null,
      environment: async () => {
        const value = env.get('BACKEND_ENVIRONMENT')
        return value === 'unreadable' ? null : (value as BackendEnvironment)
      },
      create: async () => {
        calls.create++
        created = true
      },
      setEnv: async (name: string, value: string) => {
        calls.set.push(name)
        env.set(name, value)
      },
      push: async () => {
        calls.push++
        return 0
      },
      url: async () => created ? PROD_URL : null,
      createDeployKey: async () => {
        calls.keys++
        return DEPLOY_KEY
      },
    },
  }
}

function fakeHost(kind: DeployHost['kind'] = 'vercel', names: string[] = []) {
  const added = new Map<string, string>()
  const host: DeployHost = {
    kind,
    envNames: async () => kind === 'vercel' ? [...names, ...added.keys()] : null,
    addEnv: async (name, value) => {
      added.set(name, value)
    },
  }
  return { host, added }
}

function deps(production: ReturnType<typeof fakeProduction>, overrides: Partial<DeployDeps> = {}) {
  const printed: string[] = []
  const billingSync = vi.fn<DeployDeps['billingSync']>(async options => ({
    exitCode: 0,
    report: {
      environment: options.environment as 'sandbox' | 'production',
      dryRun: options.dryRun === true,
      deployment: PROD_URL,
      log: [],
      generated: null,
      webhook: { url: 'https://happy-otter-123.convex.site/billing/events', action: 'created', secret: 'stored' },
      products: { status: 'synced' },
    },
  }))
  const emailWebhook = vi.fn<DeployDeps['emailWebhook']>(async (_key, _url, { dryRun }) => dryRun ? { action: 'would-create' } : { action: 'created', secret: WEBHOOK_SECRET })
  const doctor = vi.fn<DeployDeps['doctor']>(async () => [finding('site-https', 'pass', 'HTTPS.'), finding('bot-protection', 'warn', 'No bot check is live.', 'Set the proof secret.')])
  const emailSync = vi.fn<NonNullable<DeployDeps['emailSync']>>(async () => ({
    dryRun: false,
    key: 'full',
    topics: 1,
    log: [{ kind: 'topic', key: 'productNews', action: 'created' }],
    webhook: { url: null, action: 'skipped', missingEvents: [] },
    senders: [],
    region: { expected: null, actual: null },
    postalAddress: true,
  }) as never)
  const value: DeployDeps = {
    backend: production.backend,
    host: fakeHost().host,
    env: { SITE_URL: 'https://app.example.com', BILLING_ACCESS_TOKEN: BILLING_TOKEN, EMAIL_API_KEY: EMAIL_KEY },
    billingSync,
    emailWebhook,
    emailSync,
    doctor,
    buildAdvice: null,
    print: line => printed.push(line),
    ...overrides,
  }
  return { deps: value, printed, billingSync, emailWebhook, emailSync, doctor }
}

/** A person at a terminal, answering the question whether to create production. */
const createAnswer = (answer: string) => vi.fn(async (question: string) => question.includes('Create the project\'s production deployment') ? answer : '')

const outcomes = (report: DeployReport) => Object.fromEntries(report.steps.map(step => [step.id, step.outcome]))

describe('nuxt-backend deploy', () => {
  it('takes a project with no production deployment to a passing doctor --prod', async () => {
    const production = fakeProduction({ exists: false })
    const { host, added } = fakeHost()
    const run = deps(production, { host, ask: createAnswer('y') })
    const { exitCode, report } = await runDeploy({ dryRun: false, sandbox: false }, run.deps)

    expect(exitCode).toBe(0)
    expect(production.calls.create).toBe(1)
    expect(outcomes(report)).toEqual({
      'deployment': 'done',
      'environment': 'done',
      'auth-secret': 'done',
      'site-url': 'done',
      'billing-token': 'done',
      'email-key': 'done',
      'protection-secret': 'done',
      'backend': 'done',
      'billing-catalog': 'done',
      'email-webhook': 'done',
      'email-sync': 'done',
      'app-env': 'done',
      'gate': 'done',
    })
    // Production's own email sync made the declared topic, after the backend that declares it went up.
    expect(run.emailSync).toHaveBeenCalledWith({ dryRun: false })
    expect(report.steps.find(step => step.id === 'email-sync')!.detail).toBe('made topic productNews')
    expect(production.env.get('BACKEND_ENVIRONMENT')).toBe('production')
    expect(production.env.get('SITE_URL')).toBe('https://app.example.com')
    expect(production.env.get('AUTH_SECRET')).toMatch(/^[\w+/]{43}=$/)
    expect(production.env.get('EMAIL_WEBHOOK_SECRET')).toBe(WEBHOOK_SECRET)
    // The backend goes up before the steps that call it.
    expect(production.calls.push).toBe(1)
    expect(run.billingSync).toHaveBeenCalledWith({ environment: 'production', production: true, accessToken: BILLING_TOKEN, dryRun: false })
    expect(run.emailWebhook).toHaveBeenCalledWith(EMAIL_KEY, 'https://happy-otter-123.convex.site/email/events', { dryRun: false })
    // The app's half: the backend URL, a deploy key for its build, and the same proof secret as production's.
    expect([...added.keys()]).toEqual(['NUXT_PUBLIC_BACKEND_URL', 'CONVEX_DEPLOY_KEY', 'PROTECTION_PROOF_SECRET'])
    expect(added.get('NUXT_PUBLIC_BACKEND_URL')).toBe(PROD_URL)
    expect(added.get('CONVEX_DEPLOY_KEY')).toBe(DEPLOY_KEY)
    expect(added.get('PROTECTION_PROOF_SECRET')).toBe(production.env.get('PROTECTION_PROOF_SECRET'))
    // What the gate names: production's gaps in protection.
    expect(run.printed.join('\n')).toContain('⚠ Bot protection: No bot check is live.')
    expect(report.doctor).toEqual({ pass: 1, warn: 1, fail: 0, failing: [] })
  })

  it('prints no value it handles', async () => {
    const production = fakeProduction({ exists: false })
    const run = deps(production, { ask: createAnswer('yes') })
    const { report } = await runDeploy({ dryRun: false, sandbox: false }, run.deps)
    const output = `${run.printed.join('\n')}\n${JSON.stringify(report)}`
    for (const secret of [BILLING_TOKEN, EMAIL_KEY, WEBHOOK_SECRET, DEPLOY_KEY, production.env.get('AUTH_SECRET')!, production.env.get('PROTECTION_PROOF_SECRET')!]) {
      expect(output).not.toContain(secret)
    }
  })

  it('changes nothing that is already right on a second run', async () => {
    const production = fakeProduction({ names: ['AUTH_SECRET', 'SITE_URL', 'BILLING_ACCESS_TOKEN', 'EMAIL_API_KEY', 'EMAIL_WEBHOOK_SECRET', 'PROTECTION_PROOF_SECRET'], environment: 'production' })
    const { host, added } = fakeHost('vercel', ['NUXT_PUBLIC_BACKEND_URL', 'CONVEX_DEPLOY_KEY', 'PROTECTION_PROOF_SECRET'])
    const run = deps(production, { host, emailWebhook: async () => ({ action: 'exists', secret: WEBHOOK_SECRET }) })
    const { exitCode, report } = await runDeploy({ dryRun: false, sandbox: false }, run.deps)

    expect(exitCode).toBe(0)
    expect(production.calls.set).toEqual([])
    expect(added.size).toBe(0)
    expect(production.calls.keys).toBe(0)
    for (const id of ['deployment', 'environment', 'auth-secret', 'site-url', 'billing-token', 'email-key', 'protection-secret', 'email-webhook', 'app-env'] as const) {
      expect(report.steps.find(step => step.id === id)?.outcome, id).toBe('unchanged')
    }
  })

  // A production deployment that does not answer may exist: a second one made the default would split the project.
  it('creates no production deployment unless a person says the project has none', async () => {
    for (const ask of [undefined, createAnswer(''), createAnswer('n')]) {
      const production = fakeProduction({ exists: false })
      const { exitCode, report } = await runDeploy({ dryRun: false, sandbox: false }, deps(production, ask ? { ask } : {}).deps)
      expect(exitCode).toBe(1)
      expect(production.calls.create).toBe(0)
      expect(report.steps.map(step => step.id)).toEqual(['deployment'])
      expect(report.steps[0]!.detail).toContain('npx convex deployment create --type prod --default')
    }
  })

  it('keeps a sandbox: deploy never makes a demo live on its own', async () => {
    const production = fakeProduction({ names: ['AUTH_SECRET', 'SITE_URL'], environment: 'sandbox' })
    const run = deps(production)
    const { report } = await runDeploy({ dryRun: false, sandbox: false }, run.deps)
    expect(production.env.get('BACKEND_ENVIRONMENT')).toBe('sandbox')
    expect(report.environment).toBe('sandbox')
    expect(run.billingSync).toHaveBeenCalledWith(expect.objectContaining({ environment: 'sandbox', production: true }))
  })

  it('sets sandbox on purpose with --sandbox, and syncs to the test modes', async () => {
    const production = fakeProduction({ names: ['AUTH_SECRET', 'SITE_URL'], environment: 'production' })
    const run = deps(production)
    const { report } = await runDeploy({ dryRun: false, sandbox: true }, run.deps)
    expect(production.env.get('BACKEND_ENVIRONMENT')).toBe('sandbox')
    expect(run.billingSync).toHaveBeenCalledWith(expect.objectContaining({ environment: 'sandbox' }))
    // The demo's visitors read their sign-in codes off the page: the dev inbox opts in.
    expect(production.env.get('EMAIL_DEV_INBOX')).toBe('1')
    expect(outcomes(report)['dev-inbox']).toBe('done')
  })

  it('publishes the dev inbox on a sandbox alone, and leaves one already set', async () => {
    const live = fakeProduction({ names: ['AUTH_SECRET', 'SITE_URL'], environment: 'production' })
    const { report } = await runDeploy({ dryRun: false, sandbox: false }, deps(live).deps)
    expect(live.env.has('EMAIL_DEV_INBOX')).toBe(false)
    expect(outcomes(report)).not.toHaveProperty('dev-inbox')

    const demo = fakeProduction({ names: ['AUTH_SECRET', 'SITE_URL', 'EMAIL_DEV_INBOX'], environment: 'sandbox' })
    const again = await runDeploy({ dryRun: false, sandbox: true }, deps(demo).deps)
    expect(outcomes(again.report)['dev-inbox']).toBe('unchanged')
    expect(demo.calls.set).not.toContain('EMAIL_DEV_INBOX')
  })

  it('never guesses at a BACKEND_ENVIRONMENT it cannot read: it stops', async () => {
    const production = fakeProduction({ names: ['AUTH_SECRET'], environment: null })
    const run = deps(production)
    const { exitCode, report } = await runDeploy({ dryRun: false, sandbox: false }, run.deps)
    expect(exitCode).toBe(1)
    expect(report.steps.map(step => step.id)).toEqual(['deployment', 'environment'])
    expect(production.calls.set).toEqual([])
  })

  it('changes nothing on a dry run, and says every step it would take', async () => {
    const production = fakeProduction({ exists: false })
    const { host, added } = fakeHost()
    const run = deps(production, { host })
    const { exitCode, report } = await runDeploy({ dryRun: true, sandbox: false }, run.deps)
    expect(exitCode).toBe(0)
    expect(production.calls).toEqual({ create: 0, push: 0, keys: 0, set: [] })
    expect(added.size).toBe(0)
    expect(run.doctor).not.toHaveBeenCalled()
    expect(run.billingSync).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }))
    expect(report.steps.every(step => step.outcome === 'planned' || step.outcome === 'skipped'), JSON.stringify(outcomes(report))).toBe(true)
  })

  it('names a step that waits on a key only you hold, and skips it, without a terminal', async () => {
    const production = fakeProduction({ names: ['AUTH_SECRET', 'SITE_URL'], environment: 'production' })
    const run = deps(production, { env: {} })
    const { exitCode, report } = await runDeploy({ dryRun: false, sandbox: false }, run.deps)
    expect(exitCode).toBe(0)
    expect(outcomes(report)).toMatchObject({ 'billing-token': 'skipped', 'email-key': 'skipped', 'billing-catalog': 'skipped', 'email-webhook': 'skipped' })
    expect(report.steps.find(step => step.id === 'billing-token')?.detail).toContain('BILLING_ACCESS_TOKEN')
    expect(run.billingSync).not.toHaveBeenCalled()
  })

  it('asks at a terminal for what the shell does not hold, a key without echo', async () => {
    const production = fakeProduction({ names: ['AUTH_SECRET'], environment: 'production' })
    const ask = vi.fn(async (question: string) => question.includes('SITE_URL') ? 'https://demo.example.com/' : question.includes('billing') ? BILLING_TOKEN : '')
    const run = deps(production, { env: {}, ask })
    const { report } = await runDeploy({ dryRun: false, sandbox: false }, run.deps)
    expect(production.env.get('SITE_URL')).toBe('https://demo.example.com')
    expect(production.env.get('BILLING_ACCESS_TOKEN')).toBe(BILLING_TOKEN)
    expect(ask).toHaveBeenCalledWith(expect.stringContaining('production billing access token'), { secret: true })
    expect(outcomes(report)['email-key']).toBe('skipped')
  })

  it('refuses a SITE_URL production cannot take', async () => {
    const production = fakeProduction({ names: ['AUTH_SECRET'], environment: 'production' })
    const run = deps(production, { env: { SITE_URL: 'http://localhost:3000' } })
    const { exitCode, report } = await runDeploy({ dryRun: false, sandbox: false }, run.deps)
    expect(exitCode).toBe(1)
    expect(outcomes(report)).toMatchObject({ 'site-url': 'failed', 'backend': 'skipped' })
  })

  it('names what to set on a host other than Vercel', async () => {
    const production = fakeProduction({ names: ['AUTH_SECRET', 'SITE_URL'], environment: 'production' })
    const run = deps(production, { host: fakeHost('other').host })
    const { report } = await runDeploy({ dryRun: false, sandbox: false }, run.deps)
    const appEnv = report.steps.find(step => step.id === 'app-env')!
    expect(appEnv.outcome).toBe('skipped')
    expect(appEnv.detail).toContain(`NUXT_PUBLIC_BACKEND_URL=${PROD_URL}`)
    expect(appEnv.detail).toContain('CONVEX_DEPLOY_KEY')
    expect(outcomes(report)['protection-secret']).toBe('skipped')
    expect(production.calls.keys).toBe(0)
  })

  // The first push bundled the id map before the sync wrote production's ids
  // into it: without a second one, production prices nothing and starts no free plan.
  it('pushes the backend again when billing sync writes new ids, and says to commit them', async () => {
    const production = fakeProduction({ names: ['AUTH_SECRET', 'SITE_URL'], environment: 'production' })
    const generated = '/app/backend/billing.generated.ts'
    const run = deps(production)
    run.billingSync.mockImplementationOnce(async options => ({ exitCode: 0, report: { environment: 'production', dryRun: options.dryRun === true, deployment: PROD_URL, log: [], generated, webhook: { url: null, action: 'exists', secret: 'kept' }, products: { status: 'synced' } } }))
    const { exitCode, report } = await runDeploy({ dryRun: false, sandbox: false }, run.deps)
    expect(exitCode).toBe(0)
    expect(production.calls.push).toBe(2)
    const ids = report.steps.find(step => step.id === 'billing-ids')!
    expect(ids.outcome).toBe('done')
    expect(ids.detail).toContain(`Commit ${generated}`)
    expect(report.steps.map(step => step.id).indexOf('billing-ids')).toBe(report.steps.map(step => step.id).indexOf('billing-catalog') + 1)
  })

  it('pushes once when the id map already held the ids, and leaves the push to the next run when the first could not go', async () => {
    const unchanged = fakeProduction({ names: ['AUTH_SECRET', 'SITE_URL'], environment: 'production' })
    const first = await runDeploy({ dryRun: false, sandbox: false }, deps(unchanged).deps)
    expect(unchanged.calls.push).toBe(1)
    expect(first.report.steps.some(step => step.id === 'billing-ids')).toBe(false)

    const waiting = fakeProduction({ names: ['AUTH_SECRET'], environment: 'production' })
    const run = deps(waiting, { env: { BILLING_ACCESS_TOKEN: BILLING_TOKEN } })
    run.billingSync.mockImplementationOnce(async () => ({ exitCode: 0, report: { environment: 'production', dryRun: false, deployment: PROD_URL, log: [], generated: '/app/backend/billing.generated.ts', webhook: { url: null, action: 'exists', secret: 'kept' }, products: { status: 'skipped' } } }))
    const { report } = await runDeploy({ dryRun: false, sandbox: false }, run.deps)
    expect(waiting.calls.push).toBe(0)
    expect(outcomes(report)).toMatchObject({ 'backend': 'skipped', 'billing-ids': 'skipped' })
  })

  it('fails when doctor --prod fails', async () => {
    const production = fakeProduction({ names: ['AUTH_SECRET', 'SITE_URL'], environment: 'production' })
    const run = deps(production, { doctor: async () => [finding('site-https', 'fail', 'No HTTPS.', 'Serve the site over HTTPS.')] })
    const { exitCode, report } = await runDeploy({ dryRun: false, sandbox: false }, run.deps)
    expect(exitCode).toBe(1)
    expect(report.doctor).toEqual({ pass: 0, warn: 0, fail: 1, failing: ['site-https'] })
    expect(run.printed.join('\n')).toContain('✗ HTTPS and HSTS: No HTTPS.')
  })
})

describe('deploy --build', () => {
  const build = (env: Record<string, string>, names: string[] = []) => {
    const production = fakeProduction({ names })
    const convexDeploy = vi.fn(async () => 0)
    const printed: string[] = []
    return { production, convexDeploy, printed, run: () => runBuild({ backend: production.backend, convexDeploy, env, print: line => printed.push(line) }) }
  }

  it('puts the env the first push needs on production, then ships both halves', async () => {
    const { production, convexDeploy, run } = build({ CONVEX_DEPLOY_KEY: DEPLOY_KEY, VERCEL_PROJECT_PRODUCTION_URL: 'panels.vercel.app' })
    expect(await run()).toBe(0)
    expect(production.calls.set).toEqual(['AUTH_SECRET', 'SITE_URL'])
    expect(production.env.get('SITE_URL')).toBe('https://panels.vercel.app')
    // BACKEND_ENVIRONMENT stays unset: every provider in its test mode until deploy makes the app live.
    expect(production.env.has('BACKEND_ENVIRONMENT')).toBe(false)
    expect(convexDeploy).toHaveBeenCalledWith(['deploy', '--cmd', 'npm run build', '--cmd-url-env-var-name', 'NUXT_PUBLIC_BACKEND_URL'])
  })

  it('leaves what production holds', async () => {
    const { production, run } = build({ CONVEX_DEPLOY_KEY: DEPLOY_KEY }, ['AUTH_SECRET', 'SITE_URL'])
    expect(await run()).toBe(0)
    expect(production.calls.set).toEqual([])
  })

  it('fills a preview\'s env inside the push, where the preview exists', async () => {
    const { production, convexDeploy, run } = build({ CONVEX_DEPLOY_KEY: 'preview:team:app|secret', VERCEL_BRANCH_URL: 'app-git-x.vercel.app' })
    expect(await run()).toBe(0)
    expect(production.calls.set).toEqual([])
    expect(convexDeploy).toHaveBeenCalledWith(['deploy', '--cmd', 'npx nuxt-backend env push --preview --site-url "https://$VERCEL_BRANCH_URL" && npm run build', '--cmd-url-env-var-name', 'NUXT_PUBLIC_BACKEND_URL'])
    expect(buildCmd(true, {})).toBe('npx nuxt-backend env push --preview && npm run build')
  })

  it('refuses a build with no deploy key, or a dev one', async () => {
    for (const env of [{}, { CONVEX_DEPLOY_KEY: 'dev:happy-otter-123|secret' }] as Record<string, string>[]) {
      const { convexDeploy, printed, run } = build(env)
      expect(await run()).toBe(1)
      expect(convexDeploy).not.toHaveBeenCalled()
      expect(printed.join('\n')).toContain('deploy --build refused')
    }
  })

  it('stops when no origin names the first SITE_URL', async () => {
    const { convexDeploy, printed, run } = build({ CONVEX_DEPLOY_KEY: DEPLOY_KEY }, ['AUTH_SECRET'])
    expect(await run()).toBe(1)
    expect(convexDeploy).not.toHaveBeenCalled()
    expect(printed.join('\n')).toContain('no SITE_URL')
  })
})

describe('the email webhook', () => {
  const client = (endpoints: string[]) => {
    const create = vi.fn(async () => ({ data: { object: 'webhook' as const, id: 'new', signing_secret: 'whsec_new' }, error: null, headers: null }))
    const webhooks = {
      list: async () => ({ data: { object: 'list' as const, has_more: false, data: endpoints.map((endpoint, index) => ({ id: `wh_${index}`, endpoint, created_at: '', status: 'enabled' as const, events: null })) }, error: null, headers: null }),
      get: async (id: string) => ({ data: { object: 'webhook' as const, id, created_at: '', status: 'enabled' as const, endpoint: '', events: null, signing_secret: 'whsec_existing' }, error: null, headers: null }),
      create,
    } as unknown as EmailWebhookClient
    return { webhooks, create }
  }
  const url = 'https://happy-otter-123.convex.site/email/events'

  it('subscribes to the catalog the backend route accepts', () => {
    expect([...EMAIL_WEBHOOK_EVENTS]).toEqual([...ALL_EMAIL_EVENTS])
  })

  it('finds the endpoint before it creates one', async () => {
    const { webhooks, create } = client([`${url}/`])
    expect(await ensureEmailWebhook('re_key', url, { client: webhooks })).toEqual({ action: 'exists', secret: 'whsec_existing' })
    expect(create).not.toHaveBeenCalled()
  })

  it('creates a missing endpoint subscribed to every event, but not on a dry run', async () => {
    const { webhooks, create } = client(['https://elsewhere.example.com/hook'])
    expect(await ensureEmailWebhook('re_key', url, { client: webhooks, dryRun: true })).toEqual({ action: 'would-create' })
    expect(create).not.toHaveBeenCalled()
    expect(await ensureEmailWebhook('re_key', url, { client: webhooks })).toEqual({ action: 'created', secret: 'whsec_new' })
    expect(create).toHaveBeenCalledWith({ endpoint: url, events: [...EMAIL_WEBHOOK_EVENTS] })
  })
})

describe('the host', () => {
  let rootDir: string | undefined
  afterEach(() => {
    if (rootDir) rmSync(rootDir, { recursive: true, force: true })
    rootDir = undefined
  })

  it('reads the names of a vercel env ls table, never its values', () => {
    const listing = [
      'Vercel CLI 48.0.0',
      '> Environment Variables found for acme/panels [120ms]',
      '',
      ' name                       value               environments        created',
      ' CONVEX_DEPLOY_KEY          Encrypted           Production          2d ago',
      ' NUXT_PUBLIC_BACKEND_URL    Encrypted           Production          2d ago',
    ].join('\n')
    expect(vercelEnvNames(listing)).toEqual(['CONVEX_DEPLOY_KEY', 'NUXT_PUBLIC_BACKEND_URL'])
  })

  it('is Vercel once the folder is linked, and asks for a build command that ships the backend', () => {
    rootDir = mkdtempSync(join(tmpdir(), 'deploy-host-'))
    expect(deployHost(rootDir).kind).toBe('other')
    mkdirSync(join(rootDir, '.vercel'))
    writeFileSync(join(rootDir, '.vercel', 'project.json'), '{}')
    expect(deployHost(rootDir).kind).toBe('vercel')
    expect(buildCommandAdvice(rootDir)).toContain('npx convex deploy')
    writeFileSync(join(rootDir, 'vercel.json'), JSON.stringify({ buildCommand: 'npx nuxt-backend deploy --build' }))
    expect(buildCommandAdvice(rootDir)).toBeNull()
  })

  it('takes the deploy key from the CLI\'s output, and production\'s origin as https only', () => {
    expect(deployKeyOf(`Created a deploy key.\n${DEPLOY_KEY}\n`)).toBe(DEPLOY_KEY)
    expect(() => deployKeyOf('nothing here')).toThrow()
    expect(productionOrigin('https://app.example.com/path')).toBe('https://app.example.com')
    expect(productionOrigin('http://app.example.com')).toBeNull()
    expect(productionOrigin('https://localhost:3000')).toBeNull()
  })
})
