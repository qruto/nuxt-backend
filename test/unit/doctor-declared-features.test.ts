import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runDoctorChecks } from '../../src/doctor'
import { devInboxFinding } from '../../src/cli/posture'
import { aiFeatures, mountsComponent } from '../../src/named-models'

// The doctor findings that read what the backend declares against what the
// deployment and convex.config.ts provide: chats and knowledge stores need
// the Agent and RAG mounts, guest jobs need PROTECTION_PROOF_SECRET, and a
// sandbox demo that publishes the dev inbox needs its opt-in.

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

function app(backend: Record<string, string>) {
  writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\n')
  mkdirSync(join(rootDir, 'backend/_generated'), { recursive: true })
  for (const [file, code] of Object.entries(backend)) writeFileSync(join(rootDir, 'backend', file), code)
}

const CHAT = `export const support = ai.chat({ name: 'support', meter: 'ai', model: 'openai/gpt-5-mini' })\n`
const KNOWLEDGE = `export const docs = ai.knowledge({ dimension: 1536, meter: false, model: 'openai/text-embedding-3-small' })\n`
const MOUNTS = `import { defineApp } from 'convex/server'
import agent from '@convex-dev/agent/convex.config'
import rag from '@convex-dev/rag/convex.config.js'
const app = defineApp()
app.use(agent)
app.use(rag)
export default app
`

beforeEach(() => {
  deployed.names = 'AUTH_SECRET\nSITE_URL\n'
  for (const name of ['CONVEX_DEPLOYMENT', 'CONVEX_DEPLOY_KEY', 'NUXT_PUBLIC_BACKEND_URL', 'PROTECTION_PROOF_SECRET']) vi.stubEnv(name, undefined)
  rootDir = mkdtempSync(join(tmpdir(), 'doctor-wave5-'))
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function findingOf(id: string, only: Parameters<typeof runDoctorChecks>[1]['only']) {
  return (await runDoctorChecks(rootDir, { prod: false, only })).find(entry => entry.id === id)
}

describe('ai-components', () => {
  it('warns when a chat or a knowledge store is declared without its component mounted', async () => {
    app({ 'chat.ts': CHAT, 'knowledge.ts': KNOWLEDGE })
    expect(aiFeatures(rootDir)).toMatchObject({ chat: true, knowledge: true })
    const found = await findingOf('ai-components', ['ai'])
    expect(found).toMatchObject({ status: 'warn' })
    expect(found!.message).toContain('ai.chat and ai.knowledge')
    expect(found!.fixHint).toContain('app.use(agent)')
  })

  it('passes once convex.config.ts mounts both, or when nothing needs them', async () => {
    app({ 'chat.ts': CHAT, 'knowledge.ts': KNOWLEDGE, 'convex.config.ts': MOUNTS })
    expect(mountsComponent(rootDir, '@convex-dev/agent')).toBe(true)
    expect(mountsComponent(rootDir, '@convex-dev/rag')).toBe(true)
    expect(await findingOf('ai-components', ['ai'])).toMatchObject({ status: 'pass' })
    rmSync(join(rootDir, 'backend'), { recursive: true, force: true })
    app({ 'ai.ts': 'export const ai = setupAi(components, {})\n' })
    expect(await findingOf('ai-components', ['ai'])).toMatchObject({ status: 'pass' })
  })

  it('fails under production posture', async () => {
    app({ 'chat.ts': CHAT })
    const found = (await runDoctorChecks(rootDir, { prod: true, only: ['ai'], deployedNames: ['AUTH_SECRET', 'SITE_URL'] })).find(entry => entry.id === 'ai-components')
    expect(found?.status).toBe('fail')
  })
})

describe('ai-spend-limit', () => {
  /** Production's posture as `doctor --prod` reads it, with only its environment known. */
  const posture = (environment: string) => Promise.resolve({ environment, siteOrigin: 'unset', email: 'unset' } as never)
  const prodFinding = async (environment: string) => (await runDoctorChecks(rootDir, { prod: true, only: ['ai'], deployedNames: ['AUTH_SECRET', 'SITE_URL'], posture: posture(environment) })).find(entry => entry.id === 'ai-spend-limit')

  it('fails a sandbox production whose setupAi sets no spendLimit, and passes once it does', async () => {
    app({ 'ai.ts': 'export const ai = setupAi(components, { billing })\n' })
    const found = await prodFinding('sandbox')
    expect(found).toMatchObject({ status: 'fail' })
    expect(found!.message).toContain('no_budget')
    expect(found!.fixHint).toContain('spendLimit: { usdPerDay }')
    app({ 'ai.ts': 'export const ai = setupAi(components, { billing, spendLimit: { usdPerDay: 20 } })\n' })
    expect(await prodFinding('sandbox')).toMatchObject({ status: 'pass' })
  })

  it('says nothing off a sandbox, without setupAi, or in dev', async () => {
    app({ 'ai.ts': 'export const ai = setupAi(components, { billing })\n' })
    expect(await prodFinding('production')).toBeUndefined()
    expect(await findingOf('ai-spend-limit', ['ai'])).toBeUndefined()
    rmSync(join(rootDir, 'backend'), { recursive: true, force: true })
    app({ 'billing.ts': '// setupAi({ spendLimit }) comes later\nexport const billing = setupBilling(components, {})\n' })
    expect(await prodFinding('sandbox')).toBeUndefined()
  })
})

describe('protection-guest-jobs', () => {
  const GUESTS = `export const jobs = defineJobQueue(ai, { guest: { perVisitor: 1 }, kinds: { card: { guest: true } } })\n`

  it('warns while the deployment has no PROTECTION_PROOF_SECRET, and passes once it does', async () => {
    app({ 'jobs.ts': GUESTS })
    expect(await findingOf('protection-guest-jobs', ['protection'])).toMatchObject({ status: 'warn' })
    deployed.names = 'AUTH_SECRET\nSITE_URL\nPROTECTION_PROOF_SECRET\n'
    expect(await findingOf('protection-guest-jobs', ['protection'])).toMatchObject({ status: 'pass' })
  })

  it('says nothing for a queue no visitor may use', async () => {
    app({ 'jobs.ts': 'export const jobs = defineJobQueue(ai, { kinds: { card: {} } })\n' })
    expect(await findingOf('protection-guest-jobs', ['protection'])).toBeUndefined()
  })
})

describe('deployment-email-dev-inbox under --prod', () => {
  it('warns when a sandbox publishes the dev inbox without its opt-in', () => {
    const posture = { environment: 'sandbox', siteOrigin: 'unset', email: 'unset' } as never
    expect(devInboxFinding({ prod: true, posture, set: false })).toMatchObject({ status: 'warn' })
    expect(devInboxFinding({ prod: true, posture, set: true })).toMatchObject({ status: 'pass' })
  })

  it('accepts the opt-in deploy --sandbox sets on a demo, and still flags it on a live production', () => {
    const on = (environment: string) => devInboxFinding({ prod: true, posture: { environment, siteOrigin: 'unset', email: 'unset' } as never, set: true })
    expect(on('sandbox')).toMatchObject({ status: 'pass' })
    expect(on('production')).toMatchObject({ status: 'warn' })
    expect(on('production').fixHint).toContain('env remove --prod EMAIL_DEV_INBOX')
  })
})
