import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDevtoolsRpc, DEPLOYMENT_ENV_TTL_MS } from '../../src/devtools/rpc'
import type { DevtoolsServerInfo } from '../../src/devtools/rpc-types'

let rootDir: string
let clock: number

beforeEach(() => {
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
    expect(buildInfo).toHaveBeenLastCalledWith(null)
    const read = await rpc.functions.getDeploymentEnv()
    rpc.functions.getInfo()
    expect(buildInfo).toHaveBeenLastCalledWith(read)
    rpc.invalidate()
    rpc.functions.getInfo()
    expect(buildInfo).toHaveBeenLastCalledWith(null)
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
    expect(await first).toEqual({ ranAt: 1_000, findings: [] })
    expect(await second).toBe(await first)
    expect(checks).toHaveBeenCalledOnce()

    checks.mockRejectedValueOnce(new Error('boom'))
    expect(await rpc.functions.runDoctor()).toMatchObject({ findings: [], error: 'boom' })
  })

  it('refuses a deployment that is not a dev one', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=prod:steady-owl-456\n')
    const checks = vi.fn(async () => [])
    const rpc = createDevtoolsRpc({ rootDir, functionsDir: 'backend', buildInfo: () => ({}) as DevtoolsServerInfo, runDoctorChecks: checks })
    expect(await rpc.functions.runDoctor()).toMatchObject({ error: expect.stringContaining('doctor --prod') })
    expect(checks).not.toHaveBeenCalled()
  })
})
