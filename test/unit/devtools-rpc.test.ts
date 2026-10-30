import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDevtoolsRpc, DEPLOYMENT_ENV_TTL_MS } from '../../src/devtools/rpc'
import type { AnalyzeReport } from '../../src/analyze/types'
import type { DevtoolsBackendHealth, DevtoolsServerInfo } from '../../src/devtools/rpc-types'
import { finding } from '../../src/findings'
import { BACKEND_FILE_TEMPLATES } from '../../src/templates'
import { readBackendHealth } from '../../src/devtools/health'
import { PREVIEW_EXPORT, readEmailPreviews, sendEmailPreview } from '../../src/devtools/email-previews'

// The Convex CLI, which the email previews run: no test here reaches a deployment.
const cli = vi.hoisted(() => ({ runConvex: vi.fn() }))
vi.mock('../../src/convex-cli', async original => ({ ...await original<typeof import('../../src/convex-cli')>(), runConvex: cli.runConvex }))

let rootDir: string
let clock: number

beforeEach(() => {
  cli.runConvex.mockReset()
  vi.stubEnv('CONVEX_DEPLOYMENT', undefined)
  rootDir = mkdtempSync(join(tmpdir(), 'nuxt-backend-devtools-rpc-'))
  clock = 1_000
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

function rpcWith(list: (rootDir: string) => Promise<string[] | null>) {
  const onRead = vi.fn()
  const buildInfo = vi.fn(deploymentEnv => ({ deploymentEnv }) as unknown as DevtoolsServerInfo)
  const rpc = createDevtoolsRpc({ rootDir, functionsDir: 'backend', buildInfo, onDeploymentEnvRead: onRead, listDeploymentEnvNames: vi.fn(list), now: () => clock })
  return { rpc, onRead, buildInfo }
}

describe('getDeploymentEnv', () => {
  it('reads the names of a dev deployment, as presence only', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:brave-fox-123\n')
    const { rpc, onRead } = rpcWith(async () => ['AUTH_SECRET', 'EMAIL_API_KEY', 'UNRELATED'])

    const read = await rpc.functions.getDeploymentEnv()
    expect(read).toEqual({
      status: 'ok',
      readAt: 1_000,
      names: expect.objectContaining({ required: { AUTH_SECRET: true, SITE_URL: false } }),
    })
    expect(read.names!.optional.EMAIL_API_KEY).toBe(true)
    expect(JSON.stringify(read)).not.toContain('UNRELATED')
    expect(onRead).toHaveBeenCalledOnce()
  })

  it('reuses one read for a minute, shares one in flight, and reads again on refresh', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:brave-fox-123\n')
    const { rpc } = rpcWith(async () => ['AUTH_SECRET'])
    const [first, second] = await Promise.all([rpc.functions.getDeploymentEnv(), rpc.functions.getDeploymentEnv()])
    expect(first).toBe(second)

    clock += DEPLOYMENT_ENV_TTL_MS - 1
    expect(await rpc.functions.getDeploymentEnv()).toBe(first)

    clock += 2
    expect(await rpc.functions.getDeploymentEnv()).not.toBe(first)
    const again = await rpc.functions.getDeploymentEnv()
    expect(await rpc.functions.getDeploymentEnv({ refresh: true })).not.toBe(again)
  })

  it('never reads a deployment that is not dev-class, nor one that is missing', async () => {
    const lister = vi.fn(async () => ['AUTH_SECRET'])
    const missing = createDevtoolsRpc({ rootDir, functionsDir: 'backend', buildInfo: () => ({}) as DevtoolsServerInfo, listDeploymentEnvNames: lister })
    expect(await missing.functions.getDeploymentEnv()).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('No deployment') })

    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=prod:steady-owl-456\n')
    const prod = createDevtoolsRpc({ rootDir, functionsDir: 'backend', buildInfo: () => ({}) as DevtoolsServerInfo, listDeploymentEnvNames: lister })
    expect(await prod.functions.getDeploymentEnv()).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('doctor --prod') })
    expect(lister).not.toHaveBeenCalled()
  })

  it('reports a failed CLI read instead of throwing', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:brave-fox-123\n')
    const { rpc } = rpcWith(async () => {
      throw new Error('offline')
    })
    expect(await rpc.functions.getDeploymentEnv()).toMatchObject({ status: 'unavailable', reason: 'offline' })
  })
})

describe('getInfo', () => {
  it('builds with the last read, and forgets it on invalidate', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:brave-fox-123\n')
    const { rpc, buildInfo } = rpcWith(async () => ['AUTH_SECRET'])

    rpc.functions.getInfo()
    expect(buildInfo).toHaveBeenLastCalledWith(null, null)
    const read = await rpc.functions.getDeploymentEnv()
    rpc.functions.getInfo()
    expect(buildInfo).toHaveBeenLastCalledWith(read, null)
    rpc.invalidate()
    rpc.functions.getInfo()
    expect(buildInfo).toHaveBeenLastCalledWith(null, null)
  })

  // The layer console reads the doctor runs beside the preflight: a run of
  // some layers replaces all of theirs, so a check it no longer reports goes
  // too, and an env change drops them all. The panel is told after each run.
  it('builds with the doctor runs\' findings, each layer\'s from its newest run, and pushes them', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:brave-fox-123\n')
    const routeFails = finding('billing-webhook-route', 'fail', '/billing/events is not mounted on the deployment.')
    const portal = finding('billing-portal', 'warn', 'Plan changes are off.')
    const routePasses = finding('billing-webhook-route', 'pass', '/billing/events is mounted.')
    const email = finding('email-webhook-route', 'warn', '/email/events is unreachable.')
    const checks = vi.fn()
      .mockResolvedValueOnce([routeFails, portal, email])
      .mockResolvedValueOnce([routePasses])
      .mockResolvedValueOnce([])
    const buildInfo = vi.fn(() => ({}) as DevtoolsServerInfo)
    const onDoctorRun = vi.fn()
    let clock = 1
    const rpc = createDevtoolsRpc({ rootDir, functionsDir: 'backend', buildInfo, onDoctorRun, runDoctorChecks: checks, now: () => clock })

    await rpc.functions.runDoctor()
    expect(onDoctorRun).toHaveBeenCalledOnce()
    rpc.functions.getInfo()
    expect(buildInfo).toHaveBeenLastCalledWith(null, { ranAt: 1, findings: [routeFails, portal, email] })

    // Billing's run no longer reports the portal: its warning goes, email's findings stay.
    clock = 2
    await rpc.functions.runDoctor({ only: ['billing'] })
    rpc.functions.getInfo()
    expect(buildInfo).toHaveBeenLastCalledWith(null, { ranAt: 2, findings: [email, routePasses] })

    // A full run covers every layer.
    clock = 3
    await rpc.functions.runDoctor()
    rpc.functions.getInfo()
    expect(buildInfo).toHaveBeenLastCalledWith(null, { ranAt: 3, findings: [] })

    // An env file changed: the runs' findings no longer describe it.
    checks.mockResolvedValueOnce([email])
    await rpc.functions.runDoctor()
    rpc.invalidate()
    rpc.functions.getInfo()
    expect(buildInfo).toHaveBeenLastCalledWith(null, null)
  })
})

describe('runDoctor', () => {
  it('runs the checks once at a time, and reports a failed run instead of throwing', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:brave-fox-123\n')
    let finish: (findings: never[]) => void = () => {}
    const checks = vi.fn(() => new Promise<never[]>((resolve) => {
      finish = resolve
    }))
    const rpc = createDevtoolsRpc({ rootDir, functionsDir: 'backend', buildInfo: () => ({}) as DevtoolsServerInfo, runDoctorChecks: checks, now: () => clock })

    const first = rpc.functions.runDoctor()
    const second = rpc.functions.runDoctor()
    finish([])
    // The report is what `doctor --json` prints, for the panel's copy button.
    expect(await first).toEqual({ ranAt: 1_000, findings: [], report: JSON.stringify({ $schema: 'https://nuxt-backend.dev/schemas/doctor.json', findings: [], summary: 'no checks ran' }, null, 2) })
    expect(await second).toBe(await first)
    expect(checks).toHaveBeenCalledOnce()

    checks.mockRejectedValueOnce(new Error('boom'))
    expect(await rpc.functions.runDoctor()).toMatchObject({ findings: [], error: 'boom' })
  })

  it('runs only the layers asked for, one run per selection', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:brave-fox-123\n')
    const checks = vi.fn(async () => [])
    const rpc = createDevtoolsRpc({ rootDir, functionsDir: 'backend', buildInfo: () => ({}) as DevtoolsServerInfo, runDoctorChecks: checks })
    const billing = rpc.functions.runDoctor({ only: ['billing'] })
    const all = rpc.functions.runDoctor()
    await Promise.all([billing, all])
    expect(checks).toHaveBeenCalledTimes(2)
    expect(checks).toHaveBeenCalledWith(rootDir, ['billing'])
    expect(checks).toHaveBeenCalledWith(rootDir, undefined)
  })

  it('refuses a deployment that is not a dev one', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=prod:steady-owl-456\n')
    const checks = vi.fn(async () => [])
    const rpc = createDevtoolsRpc({ rootDir, functionsDir: 'backend', buildInfo: () => ({}) as DevtoolsServerInfo, runDoctorChecks: checks })
    expect(await rpc.functions.runDoctor()).toMatchObject({ error: expect.stringContaining('doctor --prod') })
    expect(checks).not.toHaveBeenCalled()
  })
})

describe('the bundles', () => {
  const report = (failures: Array<{ half: 'convex' | 'nuxt', message: string }> = [], bundles: unknown[] = [{ id: 'convex' }]) =>
    ({ version: 1, ranAt: '2026-10-27T10:00:00.000Z', bundles, budgets: [], failures }) as unknown as AnalyzeReport

  it('reads the last run without measuring, and says when there is none', async () => {
    const measure = vi.fn()
    const empty = createDevtoolsRpc({ rootDir, functionsDir: 'backend', buildInfo: () => ({}) as DevtoolsServerInfo, readLastBundles: async () => null, measureBundles: measure })
    expect(await empty.functions.getBundles()).toEqual({ status: 'empty' })
    const last = report()
    const kept = createDevtoolsRpc({ rootDir, functionsDir: 'backend', buildInfo: () => ({}) as DevtoolsServerInfo, readLastBundles: async () => last, measureBundles: measure })
    expect(await kept.functions.getBundles()).toEqual({ status: 'ok', report: last })
    expect(measure).not.toHaveBeenCalled()
  })

  it('measures on request, one run at a time', async () => {
    const measure = vi.fn(async () => report())
    const rpc = createDevtoolsRpc({ rootDir, functionsDir: 'backend', buildInfo: () => ({}) as DevtoolsServerInfo, measureBundles: measure })
    const [first, second] = await Promise.all([rpc.functions.runBundles(), rpc.functions.runBundles()])
    expect(first).toBe(second)
    expect(measure).toHaveBeenCalledOnce()
    await rpc.functions.runBundles()
    expect(measure).toHaveBeenCalledTimes(2)
  })

  it('says why when nothing could be measured', async () => {
    const failed = createDevtoolsRpc({ rootDir, functionsDir: 'backend', buildInfo: () => ({}) as DevtoolsServerInfo, measureBundles: async () => report([{ half: 'convex', message: 'backend/_generated/ is missing' }], []) })
    expect(await failed.functions.runBundles()).toEqual({ status: 'unavailable', reason: 'backend/_generated/ is missing' })
    const thrown = createDevtoolsRpc({ rootDir, functionsDir: 'backend', buildInfo: () => ({}) as DevtoolsServerInfo, measureBundles: () => Promise.reject(new Error('boom')) })
    expect(await thrown.functions.runBundles()).toEqual({ status: 'unavailable', reason: 'boom' })
  })
})

describe('getHealth', () => {
  it('reads once a minute, shares one read in flight, and reads again on refresh or invalidate', async () => {
    let reads = 0
    const health = vi.fn(async () => ({ readAt: clock, mounts: [], missingRoutes: [], maintenance: { status: 'ok', tasks: [] }, reads: ++reads }) as unknown as DevtoolsBackendHealth)
    const rpc = createDevtoolsRpc({ rootDir, functionsDir: 'backend', buildInfo: () => ({}) as DevtoolsServerInfo, readBackendHealth: health, now: () => clock })
    const [first, second] = await Promise.all([rpc.functions.getHealth(), rpc.functions.getHealth()])
    expect(first).toBe(second)
    expect(health).toHaveBeenCalledOnce()
    clock += DEPLOYMENT_ENV_TTL_MS - 1
    expect(await rpc.functions.getHealth()).toBe(first)
    expect(await rpc.functions.getHealth({ refresh: true })).not.toBe(first)
    rpc.invalidate()
    await rpc.functions.getHealth()
    expect(health).toHaveBeenCalledTimes(3)
  })

  it('reads the mounts from the app\'s files, and no maintenance without a dev deployment', async () => {
    const { mkdirSync } = await import('node:fs')
    mkdirSync(join(rootDir, 'backend'))
    writeFileSync(join(rootDir, 'backend/convex.config.ts'), BACKEND_FILE_TEMPLATES['convex.config.ts']!.replace('app.use(shardedCounter)\n', '').replace('import shardedCounter from \'@convex-dev/sharded-counter/convex.config\'\n', ''))
    writeFileSync(join(rootDir, 'backend/http.ts'), BACKEND_FILE_TEMPLATES['http.ts']!)
    const health = await readBackendHealth(rootDir, () => 7)
    expect(health.readAt).toBe(7)
    expect(health.mounts.find(mount => mount.name === 'shardedCounter')).toMatchObject({ mounted: false, scaffold: true })
    expect(health.mounts.find(mount => mount.name === 'backend')).toMatchObject({ mounted: true })
    expect(health.missingRoutes).toEqual([])
    expect(health.maintenance).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('No deployment') })
  })
})

describe('the email previews', () => {
  it('render on every call, in the language asked for, and send through the dev server', async () => {
    const read = vi.fn(async (_root: string, locale?: string) => ({ status: 'ok' as const, readAt: clock, locale: locale ?? 'en', locales: ['en', 'de'], previews: [] }))
    const send = vi.fn(async () => ({ status: 'sent' as const, to: 'delivered@resend.dev', emailId: 'email_1' }))
    const rpc = createDevtoolsRpc({ rootDir, functionsDir: 'backend', buildInfo: () => ({}) as DevtoolsServerInfo, readEmailPreviews: read, sendEmailPreview: send, now: () => clock })
    expect(await rpc.functions.getEmailPreviews({ locale: 'de' })).toMatchObject({ locale: 'de' })
    await rpc.functions.getEmailPreviews()
    // Never cached: the app's templates and messages change under it.
    expect(read.mock.calls).toEqual([[rootDir, 'de'], [rootDir, undefined]])
    expect(await rpc.functions.sendEmailPreview({ key: 'welcome', locale: 'de' })).toMatchObject({ status: 'sent' })
    expect(send).toHaveBeenCalledWith(rootDir, { key: 'welcome', locale: 'de' })
  })

  it('run the app\'s preview functions with the Convex CLI on a dev deployment only, light and dark', async () => {
    expect(await readEmailPreviews(rootDir, 'de', () => 5)).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('No deployment') })
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=prod:brave-fox-123\n')
    expect(await readEmailPreviews(rootDir)).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('dev deployment') })
    expect(cli.runConvex).not.toHaveBeenCalled()

    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:brave-fox-123\n')
    const html = '<html><style>@media (prefers-color-scheme: dark){.x{}}</style></html>'
    cli.runConvex.mockResolvedValueOnce({ stdout: JSON.stringify({ locales: ['en', 'de'], locale: 'de', previews: [{ key: 'welcome', template: 'welcome', note: 'n', to: 'a@b.com', subject: 'S', html, text: 't' }, { key: 42 }] }), stderr: '' })
    const read = await readEmailPreviews(rootDir, 'DE', () => 5)
    expect(cli.runConvex).toHaveBeenCalledWith(rootDir, ['run', 'email:previewEmails', '{"locale":"de"}'], expect.anything())
    expect(read).toMatchObject({ status: 'ok', readAt: 5, locale: 'de', locales: ['en', 'de'] })
    expect(read.previews).toHaveLength(1)
    expect(read.previews[0]).toMatchObject({ key: 'welcome', html: expect.stringContaining('@media not all{'), htmlDark: expect.stringContaining('@media all{') })
  })

  it('say which line to add when the app does not export them, and send only a preview\'s key', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:brave-fox-123\n')
    cli.runConvex.mockRejectedValueOnce(Object.assign(new Error('convex run failed'), { stderrTail: 'Could not find public function for \'email:previewEmails\'' }))
    expect(await readEmailPreviews(rootDir)).toMatchObject({ status: 'missing', reason: expect.stringContaining(PREVIEW_EXPORT) })
    // A deployment the CLI cannot find is no missing export.
    cli.runConvex.mockRejectedValueOnce(Object.assign(new Error('convex run failed'), { stderrTail: 'Deployment not found' }))
    expect(await readEmailPreviews(rootDir)).toMatchObject({ status: 'unavailable', reason: expect.not.stringContaining(PREVIEW_EXPORT) })

    expect(await sendEmailPreview(rootDir, { key: 'welcome"; rm -rf' })).toMatchObject({ status: 'unavailable' })
    expect(cli.runConvex).toHaveBeenCalledTimes(2)
    cli.runConvex.mockResolvedValueOnce({ stdout: '"email_1"', stderr: '' })
    expect(await sendEmailPreview(rootDir, { key: 'otp-sign-in', locale: 'fr' })).toEqual({ status: 'sent', to: 'delivered@resend.dev', emailId: 'email_1' })
    expect(cli.runConvex).toHaveBeenLastCalledWith(rootDir, ['run', 'email:sendEmailPreview', '{"key":"otp-sign-in","to":"delivered@resend.dev","locale":"fr"}'], expect.anything())
  })
})
