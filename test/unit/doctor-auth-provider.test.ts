import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runDoctorChecks } from '../../src/doctor'

// `auth-provider`: doctor says once that a Convex Auth app is sign-in only,
// and that the checks of Better Auth's env and pages do not apply to it.

vi.mock('../../src/convex-cli', () => ({
  runConvex: vi.fn(async (_rootDir: string, args: string[]) => {
    if (args[0] === 'env') return { stdout: '', stderr: '' }
    if (args[0] === 'function-spec') return { stdout: JSON.stringify({ functions: [] }), stderr: '' }
    return { stdout: '{}', stderr: '' }
  }),
}))

let rootDir: string

function app(nuxtConfig: string) {
  writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\n')
  mkdirSync(join(rootDir, 'backend/_generated'), { recursive: true })
  writeFileSync(join(rootDir, 'nuxt.config.ts'), nuxtConfig)
}

beforeEach(() => {
  for (const name of ['CONVEX_DEPLOYMENT', 'CONVEX_DEPLOY_KEY', 'NUXT_PUBLIC_BACKEND_URL']) vi.stubEnv(name, undefined)
  rootDir = mkdtempSync(join(tmpdir(), 'doctor-auth-provider-'))
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function authProvider() {
  return (await runDoctorChecks(rootDir, { prod: false })).filter(entry => entry.id === 'auth-provider')
}

describe('auth-provider', () => {
  it('warns that a Convex Auth app is sign-in only, with the guide', async () => {
    app(`export default { backend: { auth: 'convex-auth' } }\n`)
    const [found, ...rest] = await authProvider()
    expect(rest).toEqual([])
    expect(found).toMatchObject({ status: 'warn', capability: 'auth' })
    expect(found!.message).toContain('workspaces, billing, AI credits and the account features are off')
    expect(found!.message).toContain('do not apply')
    expect(found!.fixHint).toContain('https://nuxt-backend.dev/docs/build/auth/convex-auth')
  })

  it('reads the option passed inline in modules too', async () => {
    app(`export default { modules: [['nuxt-backend', { auth: 'convex-auth' }]] }\n`)
    expect(await authProvider()).toHaveLength(1)
  })

  it('says nothing for a Better Auth app', async () => {
    app(`export default { backend: {} }\n`)
    expect(await authProvider()).toEqual([])
  })
})
