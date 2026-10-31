import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { billingTools, type BillingClient } from '../../src/mcp/billing'
import type { ConvexMcp } from '../../src/mcp/data'
import type { DocsClient } from '../../src/mcp/docs'
import { createDeveloperMcpServer } from '../../src/mcp/server'
import type { DevTool, ToolContext } from '../../src/mcp/tools'
import { createPolarFake } from '../fixtures/polar-fake/server'

// The developer MCP server's project tools as a coding agent calls them
// (`doctor`, `status`, `env`, `catalog`, `functions`), over a real MCP client,
// against a project directory and an in-memory stand-in for the Convex CLI:
// the answers are names and states, never a value. Then the billing tools'
// filters and refusals, against a stand-in for the provider client.

const CLOUD = 'https://happy-otter-123.convex.cloud'

const deployment = vi.hoisted(() => ({
  reachable: true,
  env: new Map<string, string>(),
  functions: [] as string[],
}))
vi.mock('../../src/convex-cli', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/convex-cli')>(),
  runConvex: vi.fn(async (_rootDir: string, args: string[]) => {
    if (!deployment.reachable) throw new Error(`convex ${args[0]} exited with code 1: no deployment`)
    const words = args.filter(arg => arg !== '--prod')
    if (words[0] === 'env' && words[1] === 'list') return { stdout: [...deployment.env.keys()].join('\n'), stderr: '' }
    if (words[0] === 'env' && words[1] === 'get') return { stdout: `${deployment.env.get(words[2]!) ?? ''}\n`, stderr: '' }
    if (words[0] === 'function-spec') return { stdout: JSON.stringify({ url: CLOUD, functions: deployment.functions.map(identifier => ({ identifier })) }), stderr: '' }
    throw new Error(`convex ${words[0]} exited with code 1`)
  }),
}))

const docs: DocsClient = { call: async () => ({ content: [] }), line: async () => '0.2.x' }
const convex: ConvexMcp = { listTools: async () => [], callTool: async () => ({ content: [] }), close: async () => {} }

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'developer-mcp-project-'))
  writeFileSync(join(dir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\nEMAIL_FROM=hello@panels.example\n')
  for (const name of ['CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', 'CONVEX_DEPLOYMENT', 'BILLING_ACCESS_TOKEN', 'EMAIL_API_KEY', 'EMAIL_FROM', 'AUTH_SECRET', 'SITE_URL', 'BACKEND_ENVIRONMENT', 'NUXT_PUBLIC_BACKEND_URL']) vi.stubEnv(name, undefined)
  deployment.reachable = true
  deployment.env = new Map([['AUTH_SECRET', 'a-secret-value-never-answered'], ['SITE_URL', 'https://panels.example'], ['EMAIL_TEST_MODE', '1']])
  deployment.functions = ['billing.js:getPricing', 'auth.js:listSessions']
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new TypeError('fetch failed')
  }))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A client connected to a fresh server for the project. */
async function connect({ prod = false } = {}) {
  const { server, close } = createDeveloperMcpServer({ rootDir: dir, prod, docs, startConvex: async () => convex })
  const client = new Client({ name: 'test', version: '0' })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args }) as { content: Array<{ text: string }>, isError?: boolean }
    const text = result.content.map(item => item.text).join('\n')
    return { text, isError: result.isError === true, data: () => JSON.parse(text) as unknown }
  }
  return {
    call,
    close: async () => {
      await client.close()
      await close()
    },
  }
}

interface EnvAnswer { deployment: string, deploymentReadable: boolean, names: Array<{ name: string, local: boolean, deployment: boolean | null, side: string, required: boolean, capability: string | null }>, removed: string[] }

describe('the project tools, as an agent calls them', () => {
  it('env: each name set locally and on the deployment, the removed names it still holds, and never a value', async () => {
    const { call, close } = await connect()
    const answer = await call('env')
    expect(answer.isError).toBe(false)
    expect(answer.text).not.toContain('a-secret-value-never-answered')
    expect(answer.text).not.toContain('hello@panels.example')
    const env = answer.data() as EnvAnswer
    expect(env).toMatchObject({ deployment: 'dev', deploymentReadable: true, removed: ['EMAIL_TEST_MODE'] })
    const named = Object.fromEntries(env.names.map(entry => [entry.name, entry]))
    expect(named.AUTH_SECRET).toMatchObject({ side: 'deployment', required: true, local: false, deployment: true })
    expect(named.EMAIL_FROM).toMatchObject({ local: true, deployment: false })
    // The app alone reads it: there is nothing to look for on the deployment.
    expect(named.NUXT_PUBLIC_BACKEND_URL).toMatchObject({ side: 'app', deployment: null })
    await close()
  })

  it('env: says when the deployment\'s names could not be read, rather than calling them unset', async () => {
    deployment.reachable = false
    const { call, close } = await connect({ prod: true })
    const env = (await call('env')).data() as EnvAnswer
    expect(env).toMatchObject({ deployment: 'production', deploymentReadable: false, removed: [] })
    expect(env.names.every(entry => entry.deployment === null)).toBe(true)
    await close()
  })

  it('functions: each scaffold function, whether the deployment has it, and what a call takes', async () => {
    const { call, close } = await connect()
    const { deployment: url, functions } = (await call('functions')).data() as { deployment: string, functions: Array<{ name: string, deployed: boolean | null, takes: unknown }> }
    expect(url).toBe(CLOUD)
    const named = Object.fromEntries(functions.map(entry => [entry.name, entry]))
    expect(named['billing:getPricing']).toMatchObject({ deployed: true })
    expect(named['auth:listSessions']).toMatchObject({ deployed: true })
    expect(named['auth:revokeSession']).toMatchObject({ deployed: false, takes: { recentSignIn: null, impersonation: 'refused', limit: null } })

    deployment.reachable = false
    const unread = (await call('functions')).data() as { deployment: string | null, functions: Array<{ deployed: boolean | null }> }
    expect(unread.deployment).toBeNull()
    expect(unread.functions.every(entry => entry.deployed === null)).toBe(true)
    await close()
  })

  it('catalog: answers why billing sync cannot plan, as a refusal the agent can act on', async () => {
    vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_sandbox')
    const { call, close } = await connect()
    const answer = await call('catalog')
    expect(answer.isError).toBe(true)
    expect(answer.text).toMatch(/billing\.catalog\.ts/)
    await close()
  })

  it('catalog: what billing sync --dry-run would make at the provider, creating nothing there', async () => {
    mkdirSync(join(dir, 'backend'))
    writeFileSync(join(dir, 'backend/billing.catalog.ts'), 'export default { plans: { pro: { name: \'Pro\', prices: { month: 900 } } } }\n')
    vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_sandbox')
    const fake = createPolarFake({ baseUrl: 'http://127.0.0.1:4747', fetcher: async () => new Response('Accepted', { status: 202 }) })
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => fake.handle(new Request(input, init)))
    const { call, close } = await connect()
    const answer = await call('catalog')
    expect(answer.isError).toBe(false)
    const report = answer.data() as { environment: string, dryRun: boolean, deployment: string, log: Array<{ action: string, kind: string, key: string }>, generated: unknown }
    expect(report).toMatchObject({ environment: 'sandbox', dryRun: true, deployment: CLOUD, generated: null })
    expect(report.log).toContainEqual(expect.objectContaining({ action: 'would-create', kind: 'product', key: 'pro' }))
    expect(fake.state.products).toEqual({})
    await close()
    await fake.idle()
    fake.close()
  })

  it('doctor: the findings of the capabilities asked for, as doctor --json prints them, and a refusal for one it does not know', async () => {
    const { call, close } = await connect()
    const report = (await call('doctor', { only: ['auth'] })).data() as { $schema: string, findings: Array<{ capability: string }>, summary: string }
    expect(report.$schema).toMatch(/^https:\/\//)
    expect(report.findings.length).toBeGreaterThan(0)
    expect(report.findings.every(entry => entry.capability === 'auth')).toBe(true)
    expect(typeof report.summary).toBe('string')
    expect(await call('doctor', { only: ['telepathy'] })).toMatchObject({ isError: true, text: expect.stringContaining('Invalid arguments') })
    await close()
  }, 60_000)

  it('status: each capability\'s state, on the deployment .env.local names', async () => {
    const { call, close } = await connect()
    const status = (await call('status')).data() as { deployment: { kind: string, id?: string }, status: string, capabilities: Array<{ name: string }>, summary: string }
    expect(status.deployment).toEqual({ kind: 'cloud-dev', id: 'dev:happy-otter-123' })
    expect(status.capabilities.map(entry => entry.name)).toEqual(expect.arrayContaining(['auth', 'billing', 'email']))
    expect(['ok', 'degraded', 'failing']).toContain(status.status)
    await close()
  }, 60_000)
})

describe('the billing tools\' filters and refusals', () => {
  const context = (overrides: Partial<ToolContext> = {}): ToolContext => ({ rootDir: dir, prod: false, confirm: async () => {}, ...overrides })
  const tool = (tools: DevTool[], name: string) => tools.find(candidate => candidate.name === name)!

  /** A provider client that records what each list was asked for. */
  function provider() {
    const asked: Record<string, unknown> = {}
    const list = (name: string, items: unknown[]) => async (request: unknown) => {
      asked[name] = request
      return { result: { items } }
    }
    const client = {
      customers: { list: list('customers', [{ id: 'cus_1', externalId: 'user_1', email: 'ada@example.com', name: null, createdAt: 't1', metadata: { internal: true } }]) },
      subscriptions: { list: list('subscriptions', [{ id: 'sub_1', customerId: 'cus_1', productId: 'prod_1', product: { name: 'Pro' }, status: 'active', currentPeriodEnd: 't2', cancelAtPeriodEnd: false, discount: null }]) },
      events: { list: list('events', [{ id: 'evt_1', name: 'credits', timestamp: 't3', customerId: null, externalCustomerId: 'user_1', metadata: { amount: 5 }, organizationId: 'org_1' }]) },
      webhooks: { listWebhookDeliveries: list('deliveries', [{ id: 'del_1', createdAt: 't4', succeeded: false, httpCode: 500, webhookEvent: { type: 'order.paid', payload: '{}' }, response: 'boom' }]) },
    } as unknown as BillingClient
    return { client, asked }
  }

  beforeEach(() => {
    vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_test')
  })

  it('pass the filters an agent gives to the provider, and answer each item trimmed', async () => {
    const { client, asked } = provider()
    const tools = billingTools(() => client)
    expect(await tool(tools, 'billing-customers').run({ query: 'ada' }, context())).toEqual([{ id: 'cus_1', externalId: 'user_1', email: 'ada@example.com', name: null, createdAt: 't1' }])
    expect(asked.customers).toEqual({ query: 'ada', limit: 20 })
    expect(await tool(tools, 'billing-subscriptions').run({ customerId: 'cus_1', active: false, limit: 5 }, context())).toEqual([{ id: 'sub_1', customerId: 'cus_1', productId: 'prod_1', product: 'Pro', status: 'active', currentPeriodEnd: 't2', cancelAtPeriodEnd: false }])
    expect(asked.subscriptions).toEqual({ customerId: 'cus_1', active: false, limit: 5 })
    expect(await tool(tools, 'billing-events').run({ name: 'credits' }, context())).toEqual([{ id: 'evt_1', name: 'credits', timestamp: 't3', customerId: null, externalCustomerId: 'user_1', metadata: { amount: 5 } }])
    expect(asked.events).toEqual({ name: 'credits', limit: 20 })
    expect(await tool(tools, 'billing-webhook-deliveries').run({}, context())).toEqual([{ id: 'del_1', createdAt: 't4', succeeded: false, httpCode: 500, event: 'order.paid' }])
  })

  it('ask for nothing an agent left out', async () => {
    const { client, asked } = provider()
    const tools = billingTools(() => client)
    await tool(tools, 'billing-customers').run({}, context())
    await tool(tools, 'billing-subscriptions').run({}, context())
    expect(asked).toMatchObject({ customers: { limit: 20 }, subscriptions: { limit: 20 } })
  })

  it('say what the provider answered when it fails for another reason than the token', async () => {
    const client = { events: { list: async () => {
      throw new Error('503 Service Unavailable')
    } } } as unknown as BillingClient
    await expect(tool(billingTools(() => client), 'billing-events').run({}, context())).rejects.toThrow('The billing provider answered: 503 Service Unavailable')
  })

  it('refuse a filter that is too long before it reaches the provider', async () => {
    const { client, asked } = provider()
    await expect(tool(billingTools(() => client), 'billing-customers').run({ query: 'x'.repeat(201) }, context())).rejects.toThrow(/Invalid arguments/)
    expect(asked).toEqual({})
  })
})

describe('a project the tools cannot place', () => {
  it('reads a project without .env.local as having nothing set locally', async () => {
    const bare = join(dir, 'bare')
    mkdirSync(bare)
    const { server, close } = createDeveloperMcpServer({ rootDir: bare, prod: false, docs, startConvex: async () => convex })
    const client = new Client({ name: 'test', version: '0' })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverSide), client.connect(clientSide)])
    const result = await client.callTool({ name: 'env', arguments: {} }) as { content: Array<{ text: string }> }
    const env = JSON.parse(result.content[0]!.text) as EnvAnswer
    expect(env.names.filter(entry => entry.local)).toEqual([])
    await client.close()
    await close()
  })
})
