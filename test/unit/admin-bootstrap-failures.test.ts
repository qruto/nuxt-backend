import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `doctor --fix`'s first administrator when the deployment does not
// cooperate: unreachable, refusing the role change, or without the launch
// access that would admit a new address. The deployment is a stand-in for
// `convex run`; doctor-admin-bootstrap.test.ts holds the path that works.

const deployment = vi.hoisted(() => ({
  reachable: true,
  setRole: null as Error | null,
  admit: null as Error | null,
  /** What `access:admit` answers when it does not throw. */
  admitted: 'null',
  calls: [] as string[][],
}))
vi.mock('../../src/convex-cli', () => ({
  runConvex: vi.fn(async (_rootDir: string, args: string[]) => {
    deployment.calls.push(args)
    if (!deployment.reachable) throw new Error('convex run exited with code 1: no deployment')
    if (args.includes('--inline-query')) return { stdout: 'false\n', stderr: '' }
    if (args.includes('functions:setUserRole') && deployment.setRole) throw deployment.setRole
    if (args.includes('access:admit') && deployment.admit) throw deployment.admit
    if (args.includes('access:admit')) return { stdout: deployment.admitted, stderr: '' }
    return { stdout: 'null', stderr: '' }
  }),
}))

const { bootstrapAdmin, deploymentHasAdmin } = await import('../../src/cli/admin')

beforeEach(() => {
  deployment.reachable = true
  deployment.setRole = null
  deployment.admit = null
  deployment.admitted = 'null'
  deployment.calls.length = 0
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('the first administrator, when the deployment does not cooperate', () => {
  it('reads an unreachable deployment as no answer, and asks nobody anything', async () => {
    deployment.reachable = false
    expect(await deploymentHasAdmin('/app', { prod: true })).toBeNull()
    const ask = vi.fn(async () => 'ada@example.com')
    expect(await bootstrapAdmin('/app', { prod: false, ask, print: vi.fn() })).toBeNull()
    expect(ask).not.toHaveBeenCalled()
  })

  it('says why the role change failed, in its first line, and makes nobody an administrator', async () => {
    deployment.setRole = new Error('convex run exited with code 1: Uncaught Error: functions:setUserRole is not exported\n    at handler (backend/functions.ts:12)')
    const print = vi.fn()
    expect(await bootstrapAdmin('/app', { prod: true, ask: async () => 'ada@example.com', print })).toBeNull()
    expect(deployment.calls.at(-1)!.slice(0, 3)).toEqual(['run', '--prod', 'functions:setUserRole'])
    expect(print).toHaveBeenCalledWith('[nuxt-backend] doctor --fix: ada@example.com was not made an administrator (convex run exited with code 1: Uncaught Error: functions:setUserRole is not exported).')
    expect(print.mock.calls.flat().join('\n')).not.toContain('at handler')
  })

  it('says to sign in first, and promises no sign-up, for a deployment that cannot admit the address', async () => {
    deployment.setRole = new Error('Uncaught ConvexError: No user with email ada@example.com')
    deployment.admit = new Error('Could not find function for \'access:admit\'')
    const print = vi.fn()
    expect(await bootstrapAdmin('/app', { prod: false, ask: async () => 'ada@example.com', print })).toBeNull()
    expect(print).toHaveBeenCalledWith('[nuxt-backend] doctor --fix: ada@example.com has no account yet. Sign in with it once, then run doctor --fix again to make it the first administrator.')
  })

  it('promises no sign-up when the deployment skips the address as one with an account', async () => {
    // The role change found no account, but the admission did (a sign-up in
    // between, or an address stored in another case): nothing was admitted.
    deployment.setRole = new Error('Uncaught ConvexError: No user with email ada@example.com')
    deployment.admitted = JSON.stringify({ admitted: [], ids: [], skipped: [{ email: 'ada@example.com', reason: 'account' }] })
    const print = vi.fn()
    expect(await bootstrapAdmin('/app', { prod: false, ask: async () => 'ada@example.com', print })).toBeNull()
    expect(print).toHaveBeenCalledWith('[nuxt-backend] doctor --fix: ada@example.com has no account yet. Sign in with it once, then run doctor --fix again to make it the first administrator.')
  })
})
