import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runDoctorChecks } from '../../src/doctor'
import { CAPABILITIES, capabilityStatus } from '../../src/capabilities'
import { MODEL_ID, NAMED_MODEL } from '../../src/convex/integrations/ai/model-id'
import { chosenGateways, chosenRoutes, modelIdsIn, namedModels } from '../../src/named-models'

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

  describe('with the order setupAi({ gateway }) names', () => {
    /** A backend whose setupAi names `gateway` as written. */
    const withGateway = (gateway: string, extra = '') => ({ ...NAMES_A_MODEL, 'ai.ts': `export const ai = setupAi(components, { billing, model: 'openai/gpt-5-mini', gateway: ${gateway}${extra} })\n` })

    it('reads the order from a literal, and nothing else', () => {
      app({ deployment: 'dev:happy-otter-123', backend: withGateway(`'vercel'`) })
      expect(chosenGateways(rootDir)).toEqual(['vercel'])
      app({ deployment: 'dev:happy-otter-123', backend: withGateway(`['vercel', "convex", 'vercel']`) })
      expect(chosenGateways(rootDir)).toEqual(['vercel', 'convex'])
      for (const code of [
        `generateText({ model, providerOptions: { gateway: { order: ['vertex'] } } })`,
        `// setupAi(components, { billing, gateway: 'vercel' })`,
        `setupAi(components, { billing, providerOptions: { gateway: { order: ['vertex'] } } })`,
        `const help = "setupAi(components, { gateway: 'vercel' })"`,
      ]) {
        app({ deployment: 'dev:happy-otter-123', backend: { 'ai.ts': `${code}\n` } })
        expect(chosenGateways(rootDir)).toBeUndefined()
      }
    })

    it('says when the order is no literal it reads, rather than assume the default', () => {
      for (const code of [
        `setupAi(components, { billing, gateway: process.env.AI_ROUTE })`,
        `const gateway = 'vercel'\nsetupAi(components, { billing, gateway })`,
        `setupAi(components, { billing, gateway: [] })`,
        `setupAi(components, { ...options, billing })`,
        `setupAi(components, options)`,
      ]) {
        app({ deployment: 'dev:happy-otter-123', backend: { 'ai.ts': `${code}\n` } })
        expect(chosenGateways(rootDir), code).toBe('unread')
      }
      app({ deployment: 'dev:happy-otter-123', backend: { 'ai.ts': `setupAi(components, { gateway: 'vercel' })\n`, 'other.ts': `setupAi(components, { gateway: 'convex' })\n` } })
      expect(chosenGateways(rootDir)).toBe('unread')
      app({ deployment: 'dev:happy-otter-123', backend: { 'ai.ts': `setupAi(components, { gateway: 'vercel' })\n`, 'other.ts': `setupAi(components, { "gateway": ['vercel'] })\n` } })
      expect(chosenGateways(rootDir)).toEqual(['vercel'])
    })

    it('reports an order it cannot read as unchecked, and leaves the ai capability to billing', async () => {
      app({ deployment: 'dev:happy-otter-123', backend: withGateway('process.env.AI_ROUTE') })
      installProvider()
      const found = await keyFinding()
      expect(found).toMatchObject({ status: 'warn', message: expect.stringContaining('Doctor cannot read the gateway order') })
      expect(found.message).toContain('is not checked')
      const context = { env: {}, deployed: new Set(['BILLING_ACCESS_TOKEN']), deployment: 'cloud-dev' as const, findings: [found] }
      expect(CAPABILITIES.ai.detect(context).state).not.toBe('missing')
      expect(capabilityStatus('ai', context).missingEnv).toEqual([])
    })

    it('passes the Convex AI Gateway alone on a local deployment linked to a project, and warns on an anonymous one', async () => {
      app({ deployment: 'local:local-happy-otter', backend: withGateway(`'convex'`) })
      installProvider()
      expect(await keyFinding()).toMatchObject({ status: 'pass', message: expect.stringContaining('the project this local deployment is linked to') })
      app({ deployment: 'anonymous:anonymous-happy-otter', backend: withGateway(`'convex'`) })
      const anonymous = await keyFinding()
      expect(anonymous.status).toBe('warn')
      expect(anonymous.message).toContain('an anonymous local deployment cannot reach')
      expect(anonymous.fixHint).toMatch(/^Run `npx convex login`/)
    })

    it('takes the default order through a linked local deployment as Convex Cloud does', async () => {
      app({ deployment: 'local:local-happy-otter', backend: NAMES_A_MODEL })
      installProvider()
      expect(await keyFinding()).toMatchObject({ status: 'pass', message: expect.stringContaining('go through the Convex AI Gateway') })
      app({ deployment: 'anonymous:anonymous-happy-otter', backend: NAMES_A_MODEL })
      expect(await keyFinding()).toMatchObject({ status: 'warn', message: expect.stringContaining('an anonymous local deployment cannot reach the Convex AI Gateway') })
    })

    it('never blames the key where the order does not read it', async () => {
      const context = { env: {}, deployed: new Set(['BILLING_ACCESS_TOKEN']), deployment: 'self-hosted' as const }
      writeFileSync(join(rootDir, '.env.local'), 'CONVEX_SELF_HOSTED_URL=https://convex.example.com\n')
      mkdirSync(join(rootDir, 'backend'), { recursive: true })
      for (const gateway of [`'convex'`, `'convex', inferenceRegion: 'eu'`]) {
        writeFileSync(join(rootDir, 'backend/ai.ts'), `export const ai = setupAi(components, { billing, model: 'openai/gpt-5-mini', gateway: ${gateway} })\n`)
        installProvider()
        const found = await keyFinding()
        expect(found.status).toBe('warn')
        expect(CAPABILITIES.ai.detect({ ...context, findings: [found] })).toEqual({ state: 'missing', reason: 'its models are refused: no gateway in setupAi({ gateway }) or a route of setupAi({ routes }) can serve this deployment' })
        expect(capabilityStatus('ai', { ...context, findings: [found] }).missingEnv).toEqual([])
      }
    })

    it('warns when the backend checks images and the Vercel AI Gateway answers its default classifier', async () => {
      const imagesFinding = async () => (await runDoctorChecks(rootDir, { prod: false, only: ['ai'] })).find(found => found.id === 'ai-moderation-images')!
      const uploads = { 'uploads.ts': `export const check = action({ handler: async (ctx, { id }) => ai.requireSafe(ctx, { images: [id] }) })\n` }
      deployed.names = 'AUTH_SECRET\nSITE_URL\nAI_GATEWAY_API_KEY\n'
      installProvider()
      app({ deployment: 'dev:happy-otter-123', backend: { ...withGateway(`'vercel'`), ...uploads } })
      expect(await imagesFinding()).toMatchObject({ status: 'warn', message: expect.stringContaining('openai/gpt-oss-safeguard-20b reads text only') })
      app({ deployment: 'dev:happy-otter-123', backend: { ...withGateway(`'vercel'`, `, moderation: { model: 'acme/vision-guard' }`), ...uploads } })
      expect((await imagesFinding()).status).toBe('pass')
      app({ deployment: 'dev:happy-otter-123', backend: { ...NAMES_A_MODEL, ...uploads } })
      expect(await imagesFinding()).toMatchObject({ status: 'pass', message: expect.stringContaining('Llama Guard 4') })
      rmSync(join(rootDir, 'backend/uploads.ts'))
      app({ deployment: 'dev:happy-otter-123', backend: withGateway(`'vercel'`) })
      expect(await imagesFinding()).toMatchObject({ status: 'pass', message: expect.stringContaining('No backend file checks images') })
    })

    it('sends production to a key of its own: env push --prod never forwards the development one', async () => {
      app({ deployment: 'dev:happy-otter-123', backend: withGateway(`'vercel'`) })
      const found = await keyFinding({ prod: true })
      expect(found.status).toBe('fail')
      expect(found.fixHint).toContain('npx convex env set --prod AI_GATEWAY_API_KEY')
      expect(found.fixHint).not.toContain('env push --prod')
    })

    it('needs the key for the Vercel AI Gateway alone, even on a plan with the Convex one', async () => {
      app({ deployment: 'dev:happy-otter-123', backend: withGateway(`'vercel'`) })
      installProvider()
      const found = await keyFinding()
      expect(found.status).toBe('warn')
      expect(found.message).toContain('through the Vercel AI Gateway alone')
      expect(found.message).not.toContain('go through the Convex AI Gateway')
      expect((await keyFinding({ prod: true })).status).toBe('fail')
      deployed.names = 'AUTH_SECRET\nSITE_URL\nAI_GATEWAY_API_KEY\n'
      expect(await keyFinding()).toMatchObject({ status: 'pass', message: expect.stringContaining('setupAi({ gateway: \'vercel\' })') })
    })

    it('passes the Convex AI Gateway alone on Convex Cloud, and names a key it never reads', async () => {
      deployed.names = 'AUTH_SECRET\nSITE_URL\nAI_GATEWAY_API_KEY\n'
      app({ deployment: 'dev:happy-otter-123', backend: withGateway(`'convex'`) })
      installProvider()
      const found = await keyFinding({ prod: true })
      expect(found.status).toBe('pass')
      expect(found.message).toContain('through the Convex AI Gateway alone')
      expect(found.message).toContain('no other gateway is tried')
      expect(found.message).toContain('AI_GATEWAY_API_KEY is set on the deployment and never read')
    })

    it('warns for the Convex AI Gateway alone without its provider, or on a self-hosted deployment', async () => {
      app({ deployment: 'dev:happy-otter-123', backend: withGateway(`'convex'`) })
      const unprovided = await keyFinding()
      expect(unprovided.status).toBe('warn')
      expect(unprovided.fixHint).toContain('pnpm add @convex-dev/ai-sdk-provider')
      writeFileSync(join(rootDir, '.env.local'), 'CONVEX_SELF_HOSTED_URL=https://convex.example.com\n')
      installProvider()
      const selfHosted = await keyFinding()
      expect(selfHosted.status).toBe('warn')
      expect(selfHosted.message).toContain('a self-hosted deployment never has')
      expect(selfHosted.fixHint).toContain('Add \'vercel\' to setupAi({ gateway })')
    })

    it('takes the Vercel AI Gateway first with the key, and the Convex one without it', async () => {
      app({ deployment: 'dev:happy-otter-123', backend: withGateway(`['vercel', 'convex']`) })
      installProvider()
      const unkeyed = await keyFinding()
      expect(unkeyed.status).toBe('pass')
      expect(unkeyed.message).toContain('go through the Convex AI Gateway, next in setupAi({ gateway })')
      deployed.names = 'AUTH_SECRET\nSITE_URL\nAI_GATEWAY_API_KEY\n'
      expect(await keyFinding()).toMatchObject({ status: 'pass', message: expect.stringContaining('first in setupAi({ gateway })') })
    })

    describe('and the routes setupAi({ routes }) gives some models', () => {
      const withRoutes = (routes: string, extra = '') => ({ ...NAMES_A_MODEL, 'ai.ts': `export const ai = setupAi(components, { billing, model: 'openai/gpt-5-mini'${extra}, routes: ${routes} })\n` })

      it('reads the routes from a literal map, and says when they are none it reads', () => {
        app({ deployment: 'dev:happy-otter-123', backend: withRoutes(`{ 'anthropic/*': 'vercel', "openai/gpt-image-2": ['vercel', 'convex', 'vercel'] }`) })
        expect(chosenRoutes(rootDir)).toEqual({ 'anthropic/*': ['vercel'], 'openai/gpt-image-2': ['vercel', 'convex'] })
        app({ deployment: 'dev:happy-otter-123', backend: withRoutes('{}') })
        expect(chosenRoutes(rootDir)).toBeUndefined()
        for (const routes of [`{ [MODEL]: 'vercel' }`, `{ 'anthropic/*': route }`, `{ 'anthropic/*': { order: ['vertex'] } }`, 'ROUTES']) {
          app({ deployment: 'dev:happy-otter-123', backend: withRoutes(routes) })
          expect(chosenRoutes(rootDir), routes).toBe('unread')
        }
        app({ deployment: 'dev:happy-otter-123', backend: { ...NAMES_A_MODEL, 'ai.ts': `const routes = { 'anthropic/*': 'vercel' }\nexport const ai = setupAi(components, { billing, routes })\n` } })
        expect(chosenRoutes(rootDir)).toBe('unread')
      })

      it('reports routes it cannot read as unchecked, never as none', async () => {
        app({ deployment: 'dev:happy-otter-123', backend: withRoutes('ROUTES') })
        installProvider()
        const found = await keyFinding()
        expect(found).toMatchObject({ status: 'warn', message: expect.stringContaining('Doctor cannot read the gateway order: setupAi({ routes })') })
        expect(found.fixHint).toContain('Write `routes` in setupAi')
      })

      it('reads a model named only in ctx.image(), and checks it by its route', async () => {
        app({ deployment: 'dev:happy-otter-123', backend: { ...withRoutes(`{ 'bfl/*': 'vercel' }`), 'covers.ts': `const { image } = await generateImage({ model: ctx.image('bfl/flux-2-pro'), prompt })\n` } })
        installProvider()
        expect(namedModels(rootDir)).toContain('bfl/flux-2-pro')
        const found = await keyFinding()
        expect(found.status).toBe('warn')
        expect(found.message).toContain('Routed by \'bfl/*\' (vercel)')
        expect(found.message).toContain('bfl/flux-2-pro')
        // The key's own fix leads, so status names the key as what is missing.
        expect(found.fixHint).toMatch(/^Add AI_GATEWAY_API_KEY/)
      })

      it('reports each route beside the order, and checks its models by the route\'s order', async () => {
        app({ deployment: 'dev:happy-otter-123', backend: withRoutes(`{ 'anthropic/*': 'vercel' }`) })
        installProvider()
        const unkeyed = await keyFinding()
        expect(unkeyed.status).toBe('warn')
        expect(unkeyed.message).toContain('Under setupAi({ gateway })\'s order: openai/gpt-5-mini go through the Convex AI Gateway')
        expect(unkeyed.message).toContain('Routed by \'anthropic/*\' (vercel): its route \'anthropic/*\' in setupAi({ routes }) sends anthropic/claude-sonnet-4.5 through the Vercel AI Gateway alone')
        expect((await keyFinding({ prod: true })).status).toBe('fail')
        deployed.names = 'AUTH_SECRET\nSITE_URL\nAI_GATEWAY_API_KEY\n'
        expect((await keyFinding()).status).toBe('pass')
      })

      it('says a route to the Convex AI Gateway alone never reads the key for its models', async () => {
        deployed.names = 'AUTH_SECRET\nSITE_URL\nAI_GATEWAY_API_KEY\n'
        app({ deployment: 'dev:happy-otter-123', backend: withRoutes(`{ 'anthropic/claude-sonnet-4.5': 'convex' }`, `, gateway: 'vercel'`) })
        installProvider()
        const found = await keyFinding()
        expect(found.status).toBe('pass')
        expect(found.message).toContain('AI_GATEWAY_API_KEY is never read for anthropic/claude-sonnet-4.5')
      })

      it('warns when a region pin comes with a route that has no Vercel AI Gateway', async () => {
        app({ deployment: 'dev:happy-otter-123', backend: withRoutes(`{ 'anthropic/*': 'convex' }`, `, inferenceRegion: 'eu'`) })
        installProvider()
        expect(await keyFinding()).toMatchObject({ status: 'warn', message: expect.stringContaining('the push fails') })
      })
    })

    it('warns when a region pin comes with an order that has no Vercel AI Gateway', async () => {
      app({ deployment: 'dev:happy-otter-123', backend: withGateway(`'convex'`, `, inferenceRegion: 'eu'`) })
      installProvider()
      const found = await keyFinding()
      expect(found.status).toBe('warn')
      expect(found.message).toContain('the push fails')
    })
  })
})

describe('the ai capability and its models', () => {
  const context = { env: {}, deployed: new Set(['BILLING_ACCESS_TOKEN']), deployment: 'cloud-dev' as const, findings: [] }

  it('is missing when doctor found named models without their key, whatever billing says', async () => {
    app({ deployment: 'dev:happy-otter-123', backend: NAMES_A_MODEL })
    const detected = CAPABILITIES.ai.detect({ ...context, findings: [await keyFinding()] })
    expect(detected).toEqual({ state: 'missing', reason: 'its models are refused: AI_GATEWAY_API_KEY is not set' })
  })

  it('is missing when the order cannot serve the deployment, though the key is set', async () => {
    deployed.names = 'AUTH_SECRET\nSITE_URL\nAI_GATEWAY_API_KEY\n'
    app({ deployment: 'dev:happy-otter-123', backend: { ...NAMES_A_MODEL, 'ai.ts': `export const ai = setupAi(components, { billing, model: 'openai/gpt-5-mini', gateway: 'convex' })\n` } })
    const keyed = { ...context, deployed: new Set(['BILLING_ACCESS_TOKEN', 'AI_GATEWAY_API_KEY']) }
    expect(CAPABILITIES.ai.detect({ ...keyed, findings: [await keyFinding()] })).toEqual({ state: 'missing', reason: 'its models are refused: no gateway in setupAi({ gateway }) or a route of setupAi({ routes }) can serve this deployment' })
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

describe('doctor\'s moderation providers', () => {
  const providersFinding = async () => (await runDoctorChecks(rootDir, { prod: false, only: ['ai'] })).find(found => found.id === 'ai-moderation-providers')!
  const withProviders = (moderation: string, extra = '') => ({
    'ai.ts': `export const ai = setupAi(components, { billing${extra}, moderation: ${moderation} })\n`,
    'uploads.ts': `export const check = action({ handler: async (ctx, { id }) => ai.requireSafe(ctx, { images: [id] }) })\n`,
  })

  it('passes a backend that names no provider', async () => {
    app({ deployment: 'dev:happy-otter-123', backend: NAMES_A_MODEL })
    expect(await providersFinding()).toMatchObject({ status: 'pass', message: expect.stringContaining('names no moderation provider') })
  })

  it('warns for each key a named provider lacks on the deployment, and status counts those alone', async () => {
    deployed.names = 'AUTH_SECRET\nSITE_URL\nKNOWN_ABUSE_KEY\n'
    app({ deployment: 'dev:happy-otter-123', backend: withProviders(`{ images: [azureContentSafety({ region: 'francecentral' })], knownAbuse: arachnidShield() }`) })
    const findings = await runDoctorChecks(rootDir, { prod: false, only: ['ai'] })
    const keyFinding = (name: string) => findings.find(found => found.id === `deployment-${name.toLowerCase().replaceAll('_', '-')}`)!
    for (const name of ['CONTENT_SAFETY_ENDPOINT', 'CONTENT_SAFETY_KEY']) {
      expect(keyFinding(name), name).toMatchObject({ status: 'warn', message: expect.stringContaining(`azure-content-safety, but ${name} is not set on the deployment`), fixHint: expect.stringContaining('npx nuxt-backend env push') })
    }
    expect(keyFinding('KNOWN_ABUSE_KEY').status).toBe('pass')
    expect(keyFinding('SECOND_OPINION_KEY')).toMatchObject({ status: 'pass', message: expect.stringContaining('is not needed') })
    const context = { env: {}, deployed: new Set(['BILLING_ACCESS_TOKEN', 'KNOWN_ABUSE_KEY']), deployment: 'cloud-dev' as const, findings }
    expect(capabilityStatus('ai', context).missingEnv).toEqual(expect.arrayContaining(['CONTENT_SAFETY_ENDPOINT', 'CONTENT_SAFETY_KEY']))
    expect(capabilityStatus('ai', context).missingEnv).not.toContain('SECOND_OPINION_KEY')
    expect(await providersFinding()).toMatchObject({ status: 'pass', message: expect.stringContaining('a known-abuse match first') })
    // No image provider judges minors in an image: doctor says where new material is caught.
    expect((await providersFinding()).message).toContain('caught as `S4` by a classifier that reads images (Llama Guard 4), and otherwise only as `sexual`')
  })

  it('warns when the backend checks images with no known-abuse match', async () => {
    deployed.names = 'AUTH_SECRET\nSITE_URL\nCONTENT_SAFETY_ENDPOINT\nCONTENT_SAFETY_KEY\n'
    app({ deployment: 'dev:happy-otter-123', backend: withProviders(`{ images: [azureContentSafety({ region: 'francecentral' })] }`) })
    expect(await providersFinding()).toMatchObject({ status: 'warn', message: expect.stringContaining('no known-abuse match'), fixHint: expect.stringContaining('arachnidShield()') })
  })

  it('warns when an app that pins its processing to the EU checks images outside it', async () => {
    deployed.names = 'AUTH_SECRET\nSITE_URL\nCONTENT_SAFETY_ENDPOINT\nCONTENT_SAFETY_KEY\nKNOWN_ABUSE_KEY\n'
    app({ deployment: 'dev:happy-otter-123', backend: withProviders(`{ images: [azureContentSafety({ region: 'eastus' })], knownAbuse: arachnidShield() }`, `, inferenceRegion: 'eu'`) })
    expect(await providersFinding()).toMatchObject({ status: 'warn', message: expect.stringContaining('\'eastus\', which is no EU region') })
    app({ deployment: 'dev:happy-otter-123', backend: withProviders(`{ images: [azureContentSafety({ region: 'francecentral' })], knownAbuse: arachnidShield() }`, `, inferenceRegion: 'eu'`) })
    expect((await providersFinding()).status).toBe('pass')
  })
})
