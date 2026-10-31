import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { isMissingMcpSdk, mcpStartRefusal } from '../../src/cli/mcp'
import { billingTools, type BillingClient } from '../../src/mcp/billing'
import { convexMcpArgs, DATA_TOOLS, publicSchema, type ConvexMcp } from '../../src/mcp/data'
import { docsClient, releaseLine, type DocsClient } from '../../src/mcp/docs'
import { emailTools, type EmailClient } from '../../src/mcp/email'
import { hostingTools, vercelArgs, type VercelRunner } from '../../src/mcp/hosting'
import { createDeveloperMcpServer } from '../../src/mcp/server'
import { defineTool, ToolRefusal, type DevTool, type ToolContext } from '../../src/mcp/tools'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'developer-mcp-'))
  for (const name of ['CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', 'CONVEX_SELF_HOSTED_URL', 'BILLING_ACCESS_TOKEN', 'EMAIL_API_KEY', 'EMAIL_FROM']) vi.stubEnv(name, undefined)
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

const docs: DocsClient = {
  call: async (name, args) => ({ content: [{ type: 'text', text: `${name} ${JSON.stringify(args)}` }] }),
  line: async () => '0.2.x',
}

/** The Convex CLI's MCP server, faked: the tools it lists, and every call it got. */
function fakeConvex(variables = [{ name: 'AUTH_SECRET', value: 'secret-value' }]) {
  const calls: Array<{ name: string, args: Record<string, unknown> }> = []
  const schema = (...names: string[]) => ({ type: 'object' as const, properties: Object.fromEntries(['deploymentSelector', ...names].map(name => [name, { type: 'string' }])), required: ['deploymentSelector'] })
  const mcp: ConvexMcp = {
    listTools: async () => [
      { name: 'status', inputSchema: schema('projectDir') },
      { name: 'data', inputSchema: schema('tableName', 'cursor') },
      { name: 'tables', inputSchema: schema() },
      { name: 'functionSpec', inputSchema: schema() },
      { name: 'runOneoffQuery', inputSchema: schema('query') },
      { name: 'run', inputSchema: schema('functionName', 'args') },
      { name: 'logs', inputSchema: schema('cursor') },
      { name: 'insights', inputSchema: schema() },
      { name: 'envList', inputSchema: schema('includeValues') },
      { name: 'envSet', inputSchema: schema('name', 'value') },
      { name: 'envRemove', inputSchema: schema('name') },
    ],
    callTool: async (name, args) => {
      calls.push({ name, args })
      if (name === 'status') return { content: [{ type: 'text', text: JSON.stringify({ availableDeployments: [{ kind: 'ownDev', deploymentSelector: 'dev-selector' }] }) }] }
      if (name === 'envList') return { content: [{ type: 'text', text: JSON.stringify({ variables }) }] }
      return { content: [{ type: 'text', text: `${name} answered` }] }
    },
    close: async () => {},
  }
  return { mcp, calls }
}

/** A write the tests can count. */
function countingWrite(): { tool: DevTool, runs: () => number } {
  let runs = 0
  const tool = defineTool({
    name: 'test-write',
    title: 'Test write',
    description: 'A write',
    input: z.object({}),
    readOnly: false,
    run: async (_args, context) => {
      await context.confirm({ action: 'change a test thing', command: 'npx do-it-yourself' })
      runs++
      return { done: true }
    },
  })
  return { tool, runs: () => runs }
}

/** A client connected to a fresh server: with an elicitation prompt that answers `answer`, or none. */
async function connect({ prod = false, answer, extraTools = [], convex = fakeConvex() }: { prod?: boolean, answer?: 'accept' | 'decline', extraTools?: DevTool[], convex?: ReturnType<typeof fakeConvex> } = {}) {
  const { server, close } = createDeveloperMcpServer({ rootDir: dir, prod, docs, startConvex: async () => convex.mcp, extraTools })
  const client = new Client({ name: 'test', version: '0' }, { capabilities: answer ? { elicitation: { form: {} } } : {} })
  const prompts: string[] = []
  if (answer) {
    client.setRequestHandler(ElicitRequestSchema, async (request) => {
      prompts.push(request.params.message)
      return { action: answer, content: {} }
    })
  }
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args }) as { content: Array<{ text: string }>, isError?: boolean }
    return { text: result.content.map(item => item.text).join('\n'), isError: result.isError === true }
  }
  const closeBoth = async () => {
    await client.close()
    await close()
  }
  return { client, call, prompts, convex, close: closeBoth }
}

describe('the developer MCP server', () => {
  it('lists one server\'s worth of tools: the project, the docs and the four providers', async () => {
    const { client, close } = await connect()
    const { tools } = await client.listTools()
    const names = tools.map(tool => tool.name)
    expect(names.slice(0, 7)).toEqual(['doctor', 'status', 'env', 'catalog', 'functions', 'search-docs', 'get-page'])
    expect(names).toEqual(expect.arrayContaining(DATA_TOOLS.map(tool => tool.name)))
    for (const prefix of ['billing-', 'email-', 'hosting-']) expect(names.some(name => name.startsWith(prefix)), prefix).toBe(true)
    expect(names).not.toContain('data-env-get')
    // The agent never passes a deployment selector: the server picks the project's.
    expect(JSON.stringify(tools.find(tool => tool.name === 'data-documents')!.inputSchema)).not.toContain('deploymentSelector')
    expect(tools.find(tool => tool.name === 'data-run')!.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true })
    expect(tools.find(tool => tool.name === 'doctor')!.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false })
    await close()
  })

  it('with --prod, lists only tools that read, and production\'s logs and insights of the data tools', async () => {
    const { tool } = countingWrite()
    const { client, call, close } = await connect({ prod: true, extraTools: [tool] })
    const names = (await client.listTools()).tools.map(listed => listed.name)
    expect(names.filter(name => name.startsWith('data-'))).toEqual(['data-logs', 'data-insights'])
    expect(names).not.toContain('email-send-test')
    expect(names).not.toContain('test-write')
    expect(await call('test-write')).toMatchObject({ isError: true, text: expect.stringContaining('--prod` changes nothing') })
    await close()
  })

  it('asks before a write, and runs it only when you accept', async () => {
    const accepted = countingWrite()
    const yes = await connect({ answer: 'accept', extraTools: [accepted.tool] })
    expect(await yes.call('test-write')).toEqual({ isError: false, text: JSON.stringify({ done: true }, null, 2) })
    expect(yes.prompts).toEqual(['Allow your coding agent to change a test thing?'])
    expect(accepted.runs()).toBe(1)
    await yes.close()

    const declined = countingWrite()
    const no = await connect({ answer: 'decline', extraTools: [declined.tool] })
    expect(await no.call('test-write')).toMatchObject({ isError: true, text: expect.stringContaining('nothing changed') })
    expect(declined.runs()).toBe(0)
    await no.close()
  })

  it('refuses a write a client cannot ask about, naming the command to run instead', async () => {
    const write = countingWrite()
    const { call, close } = await connect({ extraTools: [write.tool] })
    const answer = await call('test-write')
    expect(answer).toMatchObject({ isError: true })
    expect(answer.text).toContain('cannot ask you to confirm')
    expect(answer.text).toContain('npx do-it-yourself')
    expect(write.runs()).toBe(0)
    await close()
  })

  it('answers a refusal as an error the agent can act on, not a crash', async () => {
    const { call, close } = await connect()
    expect(await call('billing-products')).toMatchObject({ isError: true, text: expect.stringContaining('BILLING_ACCESS_TOKEN is not set') })
    expect(await call('nope')).toMatchObject({ isError: true, text: 'No tool named nope.' })
    await close()
  })

  it('answers the docs from the docs MCP, saying so when they describe another release line', async () => {
    const installed = join(dir, 'node_modules/nuxt-backend')
    mkdirSync(installed, { recursive: true })
    writeFileSync(join(installed, 'package.json'), JSON.stringify({ version: '0.2.3' }))
    const { call, close } = await connect()
    expect(await call('get-page', { path: '/docs/build/billing/catalog' })).toEqual({ isError: false, text: 'get-page {"path":"/docs/build/billing/catalog"}' })
    expect((await call('search-docs', { query: 'credits' })).text).toBe('search {"query":"credits","limit":8}')
    writeFileSync(join(installed, 'package.json'), JSON.stringify({ version: '0.1.0' }))
    expect((await call('get-page', { path: '/docs' })).text).toContain('These docs describe nuxt-backend 0.2.x, and this project installed 0.1.0.')
    await close()
  })
})

describe('the data tools', () => {
  it('pass through to the Convex CLI\'s server on the project\'s deployment, with only the arguments it declares', async () => {
    const { call, convex, close } = await connect()
    expect(await call('data-documents', { tableName: 'posts', componentPath: 'backend' })).toEqual({ isError: false, text: 'data answered' })
    const passed = convex.calls.find(entry => entry.name === 'data')!
    expect(passed.args).toEqual({ tableName: 'posts', deploymentSelector: 'dev-selector' })
    expect(convex.calls.filter(entry => entry.name === 'status')).toHaveLength(1)
    await close()
  })

  it('answer env names, never values', async () => {
    const { call, convex, close } = await connect()
    const answer = await call('data-env')
    expect(JSON.parse(answer.text)).toEqual({ names: ['AUTH_SECRET'] })
    expect(answer.text).not.toContain('secret-value')
    expect(convex.calls.find(entry => entry.name === 'envList')!.args).toMatchObject({ includeValues: false })
    await close()
  })

  it('ask before running a function, and name it with its arguments, never the env value set', async () => {
    const { call, prompts, convex, close } = await connect({ answer: 'accept' })
    await call('data-run', { functionName: 'admin:setRole', args: '{"userId":"u2","role":"admin"}' })
    await call('data-env-set', { name: 'EMAIL_FROM', value: 'hello@example.com' })
    expect(prompts).toEqual(['Allow your coding agent to run admin:setRole with {"userId":"u2","role":"admin"} on the dev deployment?', 'Allow your coding agent to set EMAIL_FROM on the dev deployment?'])
    expect(prompts.join()).not.toContain('hello@example.com')
    expect(convex.calls.map(entry => entry.name)).toContain('run')
    await close()
  })

  // A one-off query reads process.env as well as the tables: the env values the other tools never answer.
  it('ask before a one-off query, showing it, and run none that is declined', async () => {
    const source = 'export default query({ handler: async () => ({ ...process.env }) })'
    const yes = await connect({ answer: 'accept' })
    expect(await yes.call('data-query', { query: source })).toEqual({ isError: false, text: 'runOneoffQuery answered' })
    expect(yes.prompts).toEqual([`Allow your coding agent to run this one-off query on the dev deployment, which can read every table and env value there: ${source}?`])
    await yes.close()

    const no = await connect({ answer: 'decline' })
    expect(await no.call('data-query', { query: source })).toMatchObject({ isError: true, text: expect.stringContaining('nothing changed') })
    expect(no.convex.calls.map(entry => entry.name)).not.toContain('runOneoffQuery')
    await no.close()

    const silent = await connect()
    expect(await silent.call('data-query', { query: source })).toMatchObject({ isError: true, text: expect.stringContaining('npx convex dashboard') })
    await silent.close()
  })

  it('say how to sign in when no deployment answers', async () => {
    const convex = fakeConvex()
    const original = convex.mcp.callTool
    convex.mcp.callTool = async (name, args) => (name === 'status' ? { content: [{ type: 'text', text: 'Not logged in' }], isError: true } : original(name, args))
    const { call, close } = await connect({ convex })
    expect(await call('data-tables')).toMatchObject({ isError: true, text: expect.stringContaining('npx convex login') })
    await close()
  })

  it('start the Convex server for this project, and with --prod for its logs and insights alone', () => {
    expect(convexMcpArgs('/app', false)).toEqual(['mcp', 'start', '--project-dir', '/app', '--disable-tools', 'envGet'])
    const prod = convexMcpArgs('/app', true)
    expect(prod.slice(0, 6)).toEqual(['mcp', 'start', '--project-dir', '/app', '--prod', '--cautiously-allow-production-pii'])
    expect(prod).not.toContain('--dangerously-enable-production-deployments')
    const disabled = prod.at(-1)!.split(',')
    expect(disabled).toEqual(expect.arrayContaining(['data', 'run', 'runOneoffQuery', 'envList', 'envSet', 'envRemove', 'envGet', 'tables', 'functionSpec']))
    expect(disabled).not.toContain('logs')
    expect(disabled).not.toContain('insights')
  })

  it('hide the arguments the server fills', () => {
    expect(publicSchema({ type: 'object', properties: { deploymentSelector: {}, includeValues: {}, name: {} }, required: ['deploymentSelector', 'name'] }))
      .toEqual({ type: 'object', properties: { name: {} }, required: ['name'] })
    expect(publicSchema(undefined)).toEqual({ type: 'object', properties: {} })
  })
})

/** A context for calling one group's tools directly. */
function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return { rootDir: dir, prod: false, confirm: async () => {}, ...overrides }
}

const tool = (tools: DevTool[], name: string) => tools.find(candidate => candidate.name === name)!

describe('the billing tools', () => {
  it('read the sandbox with the token in .env.local, trimmed to what an agent needs', async () => {
    writeFileSync(join(dir, '.env.local'), 'BILLING_ACCESS_TOKEN=polar_oat_test\n')
    const seen: Array<{ token: string, prod: boolean }> = []
    const fake = {
      products: { list: async () => ({ result: { items: [{ id: 'p1', name: 'Pro', metadata: { key: 'pro' }, recurringInterval: 'month', isArchived: false, prices: [{ id: 'pr1', amountType: 'fixed', priceAmount: 900, priceCurrency: 'usd' }], description: 'long' }] } }) },
    } as unknown as BillingClient
    const tools = billingTools((token, prod) => {
      seen.push({ token, prod })
      return fake
    })
    expect(await tool(tools, 'billing-products').run({}, context())).toEqual([{ id: 'p1', name: 'Pro', key: 'pro', recurringInterval: 'month', isArchived: false, prices: [{ id: 'pr1', amountType: 'fixed', amount: 900, currency: 'usd' }] }])
    expect(seen).toEqual([{ token: 'polar_oat_test', prod: false }])
  })

  it('say a refused token reads only its own environment', async () => {
    vi.stubEnv('BILLING_ACCESS_TOKEN', 'polar_oat_test')
    const refuse = async () => {
      throw new Error('401 Unauthorized')
    }
    const fake = { customers: { list: refuse } } as unknown as BillingClient
    await expect(tool(billingTools(() => fake), 'billing-customers').run({}, context({ prod: true }))).rejects.toThrow(/production: 401/)
  })
})

describe('the email tools', () => {
  const inbox = (environment: string | null) => ({ environment: async () => environment, read: vi.fn(async () => ({ address: 'delivered@resend.dev', deployment: 'dev:x', messages: [], code: null })) })

  it('read sign-in codes on a development deployment only', async () => {
    writeFileSync(join(dir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-cat-123\n')
    const preview = inbox('preview')
    await expect(tool(emailTools(undefined, preview), 'email-inbox').run({}, context())).rejects.toThrow(/BACKEND_ENVIRONMENT is preview/)
    expect(preview.read).not.toHaveBeenCalled()
    const development = inbox('development')
    expect(await tool(emailTools(undefined, development), 'email-inbox').run({}, context())).toMatchObject({ code: null })
    await expect(tool(emailTools(undefined, development), 'email-inbox').run({}, context({ prod: true }))).rejects.toThrow(/--prod is refused/)
  })

  it('send a test email only to a test address, and only once you confirm', async () => {
    writeFileSync(join(dir, '.env.local'), 'EMAIL_API_KEY=re_test\n')
    const send = vi.fn(async () => ({ data: { id: 'e1' }, error: null }))
    const tools = emailTools(() => ({ emails: { send } }) as unknown as EmailClient)
    await expect(tool(tools, 'email-send-test').run({ to: 'someone@example.com' }, context())).rejects.toThrow(/not one of the provider's test addresses/)
    const confirm = vi.fn(async () => {
      throw new ToolRefusal('Declined')
    })
    await expect(tool(tools, 'email-send-test').run({ to: 'bounced+agent@resend.dev' }, context({ confirm }))).rejects.toThrow('Declined')
    expect(send).not.toHaveBeenCalled()
    expect(await tool(tools, 'email-send-test').run({ to: 'bounced+agent@resend.dev' }, context())).toEqual({ id: 'e1', to: 'bounced+agent@resend.dev', from: 'onboarding@resend.dev' })
  })

  // One key usually serves both: production's recipients reach the agent only with --prod.
  it('read only the test addresses\' emails and contacts in development, and every one with --prod', async () => {
    vi.stubEnv('EMAIL_API_KEY', 're_test')
    const sent = [
      { id: 'e1', to: ['delivered+agent@resend.dev'], from: 'app@example.com', subject: 'Your code', created_at: 't1', last_event: 'delivered' },
      { id: 'e2', to: ['customer@example.com'], from: 'app@example.com', subject: 'Your receipt', created_at: 't2', last_event: 'delivered' },
    ]
    const contacts = [{ id: 'c1', email: 'bounced@resend.dev', unsubscribed: false }, { id: 'c2', email: 'customer@example.com', unsubscribed: false }]
    const fake = {
      emails: { list: async () => ({ data: { data: sent }, error: null }), get: async (id: string) => ({ data: sent.find(email => email.id === id), error: null }) },
      contacts: { list: async () => ({ data: { data: contacts }, error: null }) },
    } as unknown as EmailClient
    const tools = emailTools(() => fake)
    expect(await tool(tools, 'email-sent').run({}, context())).toEqual([expect.objectContaining({ id: 'e1' })])
    expect(await tool(tools, 'email-sent').run({}, context({ prod: true }))).toHaveLength(2)
    expect(await tool(tools, 'email-get').run({ id: 'e1' }, context())).toMatchObject({ subject: 'Your code' })
    await expect(tool(tools, 'email-get').run({ id: 'e2' }, context())).rejects.toThrow(/mcp --prod/)
    expect(await tool(tools, 'email-get').run({ id: 'e2' }, context({ prod: true }))).toMatchObject({ subject: 'Your receipt' })
    expect(await tool(tools, 'email-contacts').run({}, context())).toEqual([expect.objectContaining({ email: 'bounced@resend.dev' })])
    expect(await tool(tools, 'email-contacts').run({}, context({ prod: true }))).toHaveLength(2)
  })

  it('say a sending-only key cannot read', async () => {
    vi.stubEnv('EMAIL_API_KEY', 're_test')
    const tools = emailTools(() => ({ domains: { list: async () => ({ data: null, error: { name: 'restricted_api_key', message: 'restricted' } }) } }) as unknown as EmailClient)
    await expect(tool(tools, 'email-domains').run({}, context())).rejects.toThrow(/full access/)
  })
})

describe('the hosting tools', () => {
  // cmd.exe would end the command at the query string's `&`: every endpoint with two parameters failed on Windows.
  it('quote an endpoint for the Windows shell, and pass it as it is elsewhere', () => {
    const endpoint = '/v6/deployments?teamId=team_1&projectId=prj_1&limit=20'
    expect(vercelArgs(['api', endpoint, '--raw'], true)).toEqual(['api', `"${endpoint}"`, '--raw', '--non-interactive'])
    expect(vercelArgs(['api', endpoint, '--raw'], false)).toEqual(['api', endpoint, '--raw', '--non-interactive'])
  })

  it('ask to link the project first', async () => {
    await expect(tool(hostingTools(async () => '{}'), 'hosting-env').run({}, context())).rejects.toThrow(/vercel link/)
  })

  it('call vercel api on the linked project, and answer env names without values', async () => {
    mkdirSync(join(dir, '.vercel'))
    writeFileSync(join(dir, '.vercel/project.json'), JSON.stringify({ projectId: 'prj_1', orgId: 'team_1' }))
    const calls: string[][] = []
    const run: VercelRunner = async (_root, args) => {
      calls.push(args)
      return JSON.stringify({ envs: [{ key: 'SITE_URL', value: 'encrypted', target: ['production'], type: 'encrypted' }] })
    }
    const answer = await tool(hostingTools(run), 'hosting-env').run({}, context())
    expect(answer).toEqual([{ name: 'SITE_URL', target: ['production'], type: 'encrypted', gitBranch: null }])
    expect(calls).toEqual([['api', '/v10/projects/prj_1/env?teamId=team_1', '--raw']])
    await expect(tool(hostingTools(run), 'hosting-logs').run({ deploymentId: '../x' }, context())).rejects.toThrow(/Invalid arguments/)
  })
})

describe('the docs client', () => {
  it('posts one JSON-RPC message per call, and notes another release line', async () => {
    const bodies: Array<{ method: string }> = []
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { method: string }
      bodies.push(body)
      const result = body.method === 'initialize' ? { serverInfo: { version: '0.3.x' } } : { content: [{ type: 'text', text: 'page' }] }
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status: 200 })
    }) as typeof fetch
    const client = docsClient('https://docs.example/mcp', fetchImpl)
    expect(await client.line()).toBe('0.3.x')
    expect(await client.call('get-page', { path: '/docs' })).toEqual({ content: [{ type: 'text', text: 'page' }] })
    expect(bodies.map(body => body.method)).toEqual(['initialize', 'tools/call'])
    expect(releaseLine('0.2.4')).toBe('0.2.x')
  })
})

describe('nuxt-backend mcp', () => {
  it('refuses --prod with a deploy key for another deployment', () => {
    vi.stubEnv('CONVEX_DEPLOY_KEY', 'dev:happy-cat-123|secret')
    expect(mcpStartRefusal(dir, true)).toMatch(/--prod refused: CONVEX_DEPLOY_KEY is a dev deployment key/)
    expect(mcpStartRefusal(dir, false)).toBeNull()
    expect(mcpStartRefusal(join(dir, 'missing'), false)).toMatch(/does not exist/)
  })

  it('tells a missing SDK apart from a failure inside the server', () => {
    // The SDK is an optional peer: an app that never ran `init` may not have it.
    const missing = Object.assign(new Error('Cannot find package \'@modelcontextprotocol/sdk\' imported from /app/node_modules/nuxt-backend/dist/mcp.mjs'), { code: 'ERR_MODULE_NOT_FOUND' })
    expect(isMissingMcpSdk(missing)).toBe(true)
    expect(isMissingMcpSdk(Object.assign(new Error('Cannot find package \'zod\''), { code: 'ERR_MODULE_NOT_FOUND' }))).toBe(false)
    expect(isMissingMcpSdk(new Error('@modelcontextprotocol/sdk failed to connect'))).toBe(false)
  })
})
