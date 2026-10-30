import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The first administrator: doctor reads off the deployment whether an
// account holds the admin role (admin-bootstrap), and `doctor --fix` asks
// for an address and runs the scaffold's setUserRole for it.

const deployment = vi.hoisted(() => ({ hasAdmin: 'false' as string, setRole: null as Error | null, calls: [] as string[][] }))
vi.mock('../../src/convex-cli', () => ({
  runConvex: vi.fn(async (_rootDir: string, args: string[]) => {
    deployment.calls.push(args)
    if (args[0] === 'env' && args[1] === 'default') return { stdout: 'AUTH_SECRET\nSITE_URL\n', stderr: '' }
    if (args[0] === 'env') return { stdout: 'AUTH_SECRET\nSITE_URL\n', stderr: '' }
    if (args.includes('--inline-query')) return { stdout: `${deployment.hasAdmin}\n`, stderr: '' }
    if (args.includes('functions:setUserRole')) {
      if (deployment.setRole) throw deployment.setRole
      return { stdout: 'null', stderr: '' }
    }
    return { stdout: '{}', stderr: '' }
  }),
}))

const { adminBootstrapFindings, bootstrapAdmin, deploymentHasAdmin } = await import('../../src/cli/admin')
const { runDoctorChecks } = await import('../../src/doctor')

let rootDir: string

beforeEach(() => {
  deployment.hasAdmin = 'false'
  deployment.setRole = null
  deployment.calls.length = 0
  for (const name of ['CONVEX_DEPLOYMENT', 'CONVEX_DEPLOY_KEY', 'NUXT_PUBLIC_BACKEND_URL', 'NUXT_PUBLIC_BACKEND_SITE_URL']) vi.stubEnv(name, undefined)
  rootDir = mkdtempSync(join(tmpdir(), 'doctor-admin-'))
  writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\n')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('admin-bootstrap', () => {
  it('reads the role off the backend component, never an address', async () => {
    expect(await deploymentHasAdmin(rootDir, { prod: false })).toBe(false)
    const read = deployment.calls.at(-1)!
    expect(read.slice(0, 4)).toEqual(['run', '--component', 'backend', '--inline-query'])
    await deploymentHasAdmin(rootDir, { prod: true })
    expect(deployment.calls.at(-1)!.slice(0, 2)).toEqual(['run', '--prod'])
    deployment.hasAdmin = 'true'
    expect(await deploymentHasAdmin(rootDir, { prod: false })).toBe(true)
    // An answer it cannot read is no answer: no finding.
    deployment.hasAdmin = 'Error: no deployment'
    expect(await deploymentHasAdmin(rootDir, { prod: false })).toBeNull()
    expect(adminBootstrapFindings(null, { prod: false })).toEqual([])
  })

  it('finds the role among several, never one that only looks like it, and tells nothing past its read limit', async () => {
    await deploymentHasAdmin(rootDir, { prod: false })
    // The read as the deployment runs it: an inline query's body over the user table.
    const body = deployment.calls.at(-1)![4]!
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (ctx: unknown) => Promise<unknown>
    const read = new AsyncFunction('ctx', body)
    const over = (users: Array<{ role?: unknown }>) => read({
      db: {
        query: (table: string) => {
          expect(table).toBe('user')
          return (async function* () {
            yield* users
          })()
        },
      },
    })
    expect(await over([{ role: 'user' }, { role: 'support, admin' }])).toBe(true)
    expect(await over([{ role: 'administrator' }, { role: null }, {}])).toBe(false)
    expect(await over(Array.from({ length: 8000 }, () => ({ role: 'user' })))).toBeNull()
  })

  it('warns until an account holds the role, with the command that makes one', async () => {
    const [warn] = adminBootstrapFindings(false, { prod: true })
    expect(warn).toMatchObject({ id: 'admin-bootstrap', capability: 'auth', status: 'warn' })
    expect(warn!.fixHint).toContain('npx nuxt-backend doctor --fix --prod')
    expect(warn!.fixHint).toContain('npx convex run --prod functions:setUserRole')
    expect(adminBootstrapFindings(true, { prod: false })[0]).toMatchObject({ id: 'admin-bootstrap', status: 'pass' })
  })

  it('reports in doctor\'s auth capability, read from the deployment', async () => {
    const findings = await runDoctorChecks(rootDir, { prod: false, only: ['auth'] })
    expect(findings.find(finding => finding.id === 'admin-bootstrap')).toMatchObject({ status: 'warn' })
    deployment.calls.length = 0
    await runDoctorChecks(rootDir, { prod: false, only: ['billing'] })
    expect(deployment.calls.some(args => args.includes('--inline-query'))).toBe(false)
  })
})

describe('doctor --fix\'s first administrator', () => {
  it('asks for an address and makes that account an administrator', async () => {
    const print = vi.fn()
    const ask = vi.fn(async () => '  Ada@Example.com ')
    expect(await bootstrapAdmin(rootDir, { prod: false, ask, print })).toBe('ada@example.com')
    expect(deployment.calls.at(-1)).toEqual(['run', 'functions:setUserRole', JSON.stringify({ email: 'ada@example.com', role: 'admin' })])
    expect(print).toHaveBeenCalledWith('[nuxt-backend] doctor --fix: ada@example.com is the first administrator.')
  })

  it('asks nothing when an account already holds the role', async () => {
    deployment.hasAdmin = 'true'
    const ask = vi.fn(async () => 'ada@example.com')
    expect(await bootstrapAdmin(rootDir, { prod: false, ask, print: vi.fn() })).toBeNull()
    expect(ask).not.toHaveBeenCalled()
  })

  it('skips on an empty answer, and makes nobody an administrator from something that is no address', async () => {
    const print = vi.fn()
    expect(await bootstrapAdmin(rootDir, { prod: false, ask: async () => '', print })).toBeNull()
    expect(await bootstrapAdmin(rootDir, { prod: false, ask: async () => 'ada', print })).toBeNull()
    expect(deployment.calls.some(args => args.includes('functions:setUserRole'))).toBe(false)
    expect(print.mock.calls.map(([line]) => line)).toEqual([
      '[nuxt-backend] doctor --fix: no first administrator made.',
      '[nuxt-backend] doctor --fix: "ada" is not an email address; no first administrator made.',
    ])
  })

  it('admits an address with no account, so it signs up while the app is closed, and says to sign in first', async () => {
    deployment.setRole = new Error('Uncaught ConvexError: No user with email ada@example.com')
    const print = vi.fn()
    expect(await bootstrapAdmin(rootDir, { prod: false, ask: async () => 'ada@example.com', print })).toBeNull()
    const admit = deployment.calls.at(-1)!
    expect(admit.slice(0, 4)).toEqual(['run', '--component', 'backend', 'access:admit'])
    expect(JSON.parse(admit[4]!)).toMatchObject({ emails: ['ada@example.com'], source: 'invitation', label: 'first-administrator' })
    expect(print).toHaveBeenCalledWith('[nuxt-backend] doctor --fix: ada@example.com has no account yet, and may now sign up while the app is closed. Sign in with it once, then run doctor --fix again to make it the first administrator.')
  })
})
