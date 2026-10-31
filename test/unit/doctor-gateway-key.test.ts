import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runDoctorChecks } from '../../src/doctor'
import { CAPABILITIES, capabilityStatus } from '../../src/capabilities'
import { MODEL_ID, NAMED_MODEL } from '../../src/convex/integrations/ai/model-id'
import { modelIdsIn, namedModels } from '../../src/named-models'

// The gateway key is needed once the backend names a `provider/model` id, and
// only then: doctor reads the ids from the backend's source and reports the
// key on the deployment against them. No stand-in answers in its place on any
// deployment: a named model without the key is refused where the Convex AI
// Gateway does not answer, and production cannot run with that.

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

function app({ deployment, backend }: { deployment: string, backend: Record<string, string> }) {
  writeFileSync(join(rootDir, '.env.local'), `CONVEX_DEPLOYMENT=${deployment}\n`)
  mkdirSync(join(rootDir, 'backend/_generated'), { recursive: true })
  for (const [file, code] of Object.entries(backend)) writeFileSync(join(rootDir, 'backend', file), code)
}

const NAMES_A_MODEL = {
  'ai.ts': `export const ai = setupAi(components, { billing, model: 'openai/gpt-5-mini' })\n`,
  'chat.ts': `export const chat = ai.stream({ name: 'chat', model: "anthropic/claude-sonnet-4.5", handler: async (ctx) => {} })\n`,
}

async function keyFinding(options: { prod?: boolean } = {}) {
  const findings = await runDoctorChecks(rootDir, { prod: options.prod ?? false, only: ['ai'] })
  return findings.find(finding => finding.id === 'deployment-ai-gateway-api-key')!
}

beforeEach(() => {
  deployed.names = 'AUTH_SECRET\nSITE_URL\n'
  for (const name of ['CONVEX_DEPLOYMENT', 'CONVEX_DEPLOY_KEY', 'NUXT_PUBLIC_BACKEND_URL', 'NUXT_PUBLIC_BACKEND_SITE_URL', 'AI_GATEWAY_API_KEY']) vi.stubEnv(name, undefined)
  rootDir = mkdtempSync(join(tmpdir(), 'doctor-gateway-'))
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('the models a backend names', () => {
  it('reads provider/model ids from model options and ctx.model() calls, once each', () => {
    app({ deployment: 'dev:happy-otter-123', backend: { ...NAMES_A_MODEL, 'more.ts': `generateText({ model: ctx.model('openai/gpt-5-mini') })\n` } })
    expect(namedModels(rootDir)).toEqual(['anthropic/claude-sonnet-4.5', 'openai/gpt-5-mini'])
  })

  it('reads ids with the runtime\'s own pattern', () => {
    expect(NAMED_MODEL.source).toContain(`(${MODEL_ID.source.slice(1, -1)})`)
  })

  it('reads every id the runtime accepts, and no comment hides one behind a glob or a URL', () => {
    expect(modelIdsIn([
      `const a = { model: 'openrouter/meta-llama/llama-4-maverick' }`,
      `const glob = 'src/**/*.ts'`,
      `const b = { model: 'acme/model+turbo' }`,
      `const url = 'https://example.com/*'`,
      `const c = { model: "google/gemini-2.5-flash" } // model: 'openai/in-a-comment'`,
    ].join('\n'))).toEqual(['openrouter/meta-llama/llama-4-maverick', 'acme/model+turbo', 'google/gemini-2.5-flash'])
  })

  it('leaves out comments, bare ids, model objects and the codegen', () => {
    expect(modelIdsIn([
      `// model: 'openai/gpt-5'`,
      `/* model: 'openai/gpt-5' */`,
      `const a = { model: 'gpt-5' }`,
      `const b = { model: gateway('openai/gpt-5') }`,
      `const url = 'https://example.com/model: x'`,
    ].join('\n'))).toEqual([])
    app({ deployment: 'dev:happy-otter-123', backend: {} })
    writeFileSync(join(rootDir, 'backend/_generated/api.ts'), `export const x = { model: 'openai/gpt-5' }\n`)
    expect(namedModels(rootDir)).toEqual([])
  })
})

describe('doctor\'s gateway key finding', () => {
  it('warns when a cloud deployment lacks the key the named models need, and names them', async () => {
    app({ deployment: 'dev:happy-otter-123', backend: NAMES_A_MODEL })
    const found = await keyFinding()
    expect(found).toMatchObject({ capability: 'ai', status: 'warn' })
    expect(found.message).toContain('anthropic/claude-sonnet-4.5 and openai/gpt-5-mini')
    expect(found.fixHint).toContain('npx nuxt-backend env push')
  })

  it('fails under production posture: production cannot run its models without it', async () => {
    app({ deployment: 'dev:happy-otter-123', backend: NAMES_A_MODEL })
    expect(await keyFinding({ prod: true })).toMatchObject({ status: 'fail' })
  })

  it('warns on a local deployment without the key: nothing answers in its place', async () => {
    app({ deployment: 'local:local-happy-otter', backend: NAMES_A_MODEL })
    const found = await keyFinding()
    expect(found.status).toBe('warn')
    expect(found.message).toContain('those model calls are refused')
    expect(found.fixHint).toContain('AI_GATEWAY_API_KEY')
    expect(found.fixHint).not.toContain('stand-in')
  })

  it('knows no marker for a stand-in: a leftover NUXT_BACKEND_SIMULATE_MODELS changes nothing, on any deployment', async () => {
    deployed.names = 'AUTH_SECRET\nSITE_URL\nNUXT_BACKEND_SIMULATE_MODELS\n'
    app({ deployment: 'local:local-happy-otter', backend: NAMES_A_MODEL })
    expect(await keyFinding()).toMatchObject({ status: 'warn' })
    app({ deployment: 'dev:happy-otter-123', backend: NAMES_A_MODEL })
    expect(await keyFinding()).toMatchObject({ status: 'warn' })
    expect(await keyFinding({ prod: true })).toMatchObject({ status: 'fail' })
  })

  it('passes when no model is named: nothing needs the key', async () => {
    app({ deployment: 'dev:happy-otter-123', backend: { 'ai.ts': 'export const ai = setupAi(components, { billing })\n' } })
    expect(await keyFinding()).toMatchObject({ status: 'pass' })
  })

  it('passes once the deployment has it', async () => {
    deployed.names = 'AUTH_SECRET\nSITE_URL\nAI_GATEWAY_API_KEY\n'
    app({ deployment: 'dev:happy-otter-123', backend: NAMES_A_MODEL })
    const found = await keyFinding()
    expect(found).toMatchObject({ status: 'pass' })
    expect(found.message).toContain('Vercel AI Gateway')
    expect(found.message).toContain('Install @convex-dev/ai-sdk-provider')
  })
})

describe('doctor\'s model route on Convex Cloud, with the Convex AI Gateway\'s provider installed', () => {
  /** The provider package in the app's node_modules, as `pnpm add` leaves it. */
  function installProvider() {
    const dir = join(rootDir, 'node_modules/@convex-dev/ai-sdk-provider')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@convex-dev/ai-sdk-provider', version: '0.3.0', exports: { './package.json': './package.json' } }))
  }

  it('reports the Convex AI Gateway as the route, and the spending limit to cap it with', async () => {
    app({ deployment: 'dev:happy-otter-123', backend: NAMES_A_MODEL })
    installProvider()
    const found = await keyFinding()
    expect(found.status).toBe('pass')
    expect(found.message).toContain('go through the Convex AI Gateway')
    expect(found.message).toContain('a free plan refuses it (AiGatewayDisabled)')
    expect(found.message).toContain('npx convex deployment usage-limits set')
    expect(found.message).toContain('aiGatewayCostDollars')
  })

  it('names the key a free plan falls back on, once it is set', async () => {
    deployed.names = 'AUTH_SECRET\nSITE_URL\nAI_GATEWAY_API_KEY\n'
    app({ deployment: 'dev:happy-otter-123', backend: NAMES_A_MODEL })
    installProvider()
    const found = await keyFinding()
    expect(found.status).toBe('pass')
    expect(found.message).toContain('they go through the Vercel AI Gateway with AI_GATEWAY_API_KEY')
  })

  it('passes production too: the route needs no key there', async () => {
    app({ deployment: 'dev:happy-otter-123', backend: NAMES_A_MODEL })
    installProvider()
    expect(await keyFinding({ prod: true })).toMatchObject({ status: 'pass' })
  })

  it('needs the key once the backend pins inference to the EU: only the Vercel AI Gateway serves it', async () => {
    app({ deployment: 'dev:happy-otter-123', backend: { ...NAMES_A_MODEL, 'ai.ts': `export const ai = setupAi(components, { billing, model: 'openai/gpt-5-mini', inferenceRegion: 'eu' })\n` } })
    installProvider()
    const found = await keyFinding()
    expect(found.status).toBe('warn')
    expect(found.message).toContain('pins its model calls to the \'eu\' inference region')
    expect(found.message).not.toContain('go through the Convex AI Gateway')
    expect((await keyFinding({ prod: true })).status).toBe('fail')
    deployed.names = 'AUTH_SECRET\nSITE_URL\nAI_GATEWAY_API_KEY\n'
    expect(await keyFinding()).toMatchObject({ status: 'pass', message: expect.stringContaining('pinned to the \'eu\' inference region') })
  })

  it('never offers the Convex AI Gateway to a self-hosted deployment', async () => {
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_SELF_HOSTED_URL=https://convex.example.com\n')
    mkdirSync(join(rootDir, 'backend'), { recursive: true })
    for (const [file, code] of Object.entries(NAMES_A_MODEL)) writeFileSync(join(rootDir, 'backend', file), code)
    installProvider()
    const found = await keyFinding()
    expect(found.status).toBe('warn')
    expect(found.message).not.toContain('Convex AI Gateway')
  })
})

describe('the ai capability and its models', () => {
  const context = { env: {}, deployed: new Set(['BILLING_ACCESS_TOKEN']), deployment: 'cloud-dev' as const, findings: [] }

  it('is missing when doctor found named models without their key, whatever billing says', async () => {
    app({ deployment: 'dev:happy-otter-123', backend: NAMES_A_MODEL })
    const detected = CAPABILITIES.ai.detect({ ...context, findings: [await keyFinding()] })
    expect(detected).toEqual({ state: 'missing', reason: 'its models are refused: AI_GATEWAY_API_KEY is not set' })
  })

  it('is test on a local deployment while no finding says its models are refused: billing decides', () => {
    expect(CAPABILITIES.ai.detect({ ...context, deployment: 'local' }).state).toBe('test')
    expect(CAPABILITIES.ai.detect({ ...context, deployment: 'local' }).reason).not.toContain('stand-in')
  })

  it('lists the key as missing only once doctor found a model that needs it', async () => {
    const ai = (findings: Parameters<typeof capabilityStatus>[1]['findings']) => capabilityStatus('ai', { ...context, findings }).missingEnv
    // DevTools before a doctor run, or an env listing that failed: no finding, nothing missing.
    expect(ai([])).toEqual([])
    app({ deployment: 'dev:happy-otter-123', backend: {} })
    expect(ai([await keyFinding()])).toEqual([])
    app({ deployment: 'dev:happy-otter-123', backend: NAMES_A_MODEL })
    expect(ai([await keyFinding()])).toEqual(['AI_GATEWAY_API_KEY'])
  })

  it('follows billing once the key is set', () => {
    const keyed = { ...context, deployed: new Set(['BILLING_ACCESS_TOKEN', 'BACKEND_ENVIRONMENT', 'AI_GATEWAY_API_KEY']), switches: { BACKEND_ENVIRONMENT: 'production' } }
    expect(CAPABILITIES.ai.detect(keyed).state).toBe('live')
    expect(CAPABILITIES.ai.detect({ ...keyed, deployment: 'local' as const }).state).toBe('live')
  })
})
