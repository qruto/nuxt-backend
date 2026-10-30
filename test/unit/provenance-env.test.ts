import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCredentials } from '../../src/convex/c2pa/manifest'
import { parseEnvFile } from '../../src/deployment'
import { runDoctorChecks } from '../../src/doctor'
import { planEnvPush, provenanceToGenerate, writeLocalEnv } from '../../src/env-push'
import { usesProvenance } from '../../src/named-models'

// The content-credentials signing pair: `env push` generates it when the
// backend turns provenance on and neither the deployment nor .env.local has
// it, keeps it in .env.local (so production gets the same key) and sets it on
// the deployment; doctor warns while it is missing, and `--prod` fails.

const deployed = vi.hoisted(() => ({ names: 'AUTH_SECRET\nSITE_URL\n' }))
vi.mock('../../src/convex-cli', () => ({
  runConvex: vi.fn(async (_rootDir: string, args: string[]) => {
    if (args[0] === 'env' && args[1] === 'default') return { stdout: 'AUTH_SECRET\nSITE_URL\n', stderr: '' }
    if (args[0] === 'env') return { stdout: deployed.names, stderr: '' }
    if (args[0] === 'function-spec') return { stdout: JSON.stringify({ functions: [] }), stderr: '' }
    return { stdout: '{}', stderr: '' }
  }),
}))

let rootDir: string

function app(backend: Record<string, string>, envLocal = 'CONVEX_DEPLOYMENT=dev:happy-otter-123\n') {
  writeFileSync(join(rootDir, '.env.local'), envLocal)
  writeFileSync(join(rootDir, 'package.json'), JSON.stringify({ name: 'panels' }))
  mkdirSync(join(rootDir, 'backend/_generated'), { recursive: true })
  for (const [file, code] of Object.entries(backend)) writeFileSync(join(rootDir, 'backend', file), code)
}

const PROVENANCE_ON = { 'ai.ts': `export const ai = setupAi(components, { billing, provenance: { name: 'Panels' } })\n` }

beforeEach(() => {
  deployed.names = 'AUTH_SECRET\nSITE_URL\n'
  for (const name of ['CONVEX_DEPLOYMENT', 'CONVEX_DEPLOY_KEY', 'NUXT_PUBLIC_BACKEND_URL']) vi.stubEnv(name, undefined)
  rootDir = mkdtempSync(join(tmpdir(), 'provenance-env-'))
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('whether the backend writes content credentials', () => {
  it('reads setupAi({ provenance }) and ctx.storeImage calls, and not `provenance: false` or a comment', () => {
    app(PROVENANCE_ON)
    expect(usesProvenance(rootDir)).toBe(true)
    app({ 'ai.ts': `setupAi(components, { billing, provenance: true })\n` })
    expect(usesProvenance(rootDir)).toBe(true)
    app({ 'ai.ts': `setupAi(components, { billing, provenance: false })\n// provenance: true\n`, 'strips.ts': `const id = await ctx.storeImage(image)\n` })
    expect(usesProvenance(rootDir)).toBe(true)
    rmSync(join(rootDir, 'backend/strips.ts'))
    expect(usesProvenance(rootDir)).toBe(false)
  })
})

describe('env push', () => {
  it('generates the pair once provenance is on and nothing holds one, and provisions both', () => {
    app(PROVENANCE_ON)
    const generated = provenanceToGenerate(rootDir, ['AUTH_SECRET'], {})!
    expect(Object.keys(generated)).toEqual(['PROVENANCE_PRIVATE_KEY', 'PROVENANCE_CERTIFICATE'])
    const actions = planEnvPush({ deployedNames: ['AUTH_SECRET', 'SITE_URL'], localEnv: {}, dev: true, generated })
    expect(actions.filter(action => action.name.startsWith('PROVENANCE_'))).toEqual([
      expect.objectContaining({ name: 'PROVENANCE_PRIVATE_KEY', action: 'provision', value: generated.PROVENANCE_PRIVATE_KEY, detail: expect.stringContaining('generated') }),
      expect.objectContaining({ name: 'PROVENANCE_CERTIFICATE', action: 'provision', value: generated.PROVENANCE_CERTIFICATE }),
    ])
  })

  it('generates nothing while provenance is off, or a key is on the deployment or in .env.local', () => {
    app({ 'ai.ts': `setupAi(components, { billing })\n` })
    expect(provenanceToGenerate(rootDir, [], {})).toBeNull()
    app(PROVENANCE_ON)
    expect(provenanceToGenerate(rootDir, ['PROVENANCE_PRIVATE_KEY'], {})).toBeNull()
    expect(provenanceToGenerate(rootDir, [], { PROVENANCE_CERTIFICATE: '-----BEGIN CERTIFICATE-----' })).toBeNull()
  })

  it('keeps the pair in .env.local ahead of the platform\'s group, one line each, and it signs as read back', async () => {
    app(PROVENANCE_ON, 'EMAIL_API_KEY=re_test\n\n# Deployment used by `npx convex dev`\nCONVEX_DEPLOYMENT=dev:happy-otter-123\n')
    const generated = provenanceToGenerate(rootDir, [], {})!
    writeLocalEnv(rootDir, generated)
    const text = readFileSync(join(rootDir, '.env.local'), 'utf8')
    expect(text.indexOf('PROVENANCE_PRIVATE_KEY=')).toBeLessThan(text.indexOf('# Deployment used by'))
    expect(text.split('\n').filter(line => line.startsWith('PROVENANCE_'))).toHaveLength(2)
    const env = parseEnvFile(text)
    expect(env.CONVEX_DEPLOYMENT).toBe('dev:happy-otter-123')
    // Forwarded as it is read: the escaped line ends stay, and the deployment reads them back.
    expect(typeof await readCredentials(env.PROVENANCE_PRIVATE_KEY, env.PROVENANCE_CERTIFICATE)).toBe('object')
  })
})

describe('doctor', () => {
  async function keyFinding(prod = false, id = 'deployment-provenance-certificate') {
    const findings = await runDoctorChecks(rootDir, { prod, only: ['ai'] })
    return findings.find(finding => finding.id === id)!
  }

  it('passes while provenance is off, and once both are set', async () => {
    app({ 'ai.ts': `setupAi(components, { billing })\n` })
    expect((await keyFinding()).status).toBe('pass')
    app(PROVENANCE_ON)
    deployed.names = 'AUTH_SECRET\nSITE_URL\nPROVENANCE_PRIVATE_KEY\nPROVENANCE_CERTIFICATE\n'
    expect((await keyFinding()).status).toBe('pass')
    expect((await keyFinding(false, 'deployment-provenance-private-key')).status).toBe('pass')
  })

  it('warns while provenance is on and the pair is missing, names the fix, and fails under --prod', async () => {
    app(PROVENANCE_ON)
    deployed.names = 'AUTH_SECRET\nSITE_URL\nPROVENANCE_PRIVATE_KEY\n'
    const finding = await keyFinding()
    expect(finding).toMatchObject({ status: 'warn', message: expect.stringContaining('PROVENANCE_CERTIFICATE is not set') })
    expect(finding.fixHint).toContain('npx nuxt-backend env push')
    expect((await keyFinding(true)).status).toBe('fail')
  })
})
