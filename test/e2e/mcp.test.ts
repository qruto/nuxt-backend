import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { setup, url } from '@nuxt/test-utils/e2e'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
  extractWWWAuthenticateParams,
} from '@modelcontextprotocol/sdk/client/auth.js'
import { BACKEND_MCP_SCOPES } from '../../src/convex/constants'
import { startConvexStub } from './helpers/convex-stub'
import { prepareExampleApp } from './helpers/example-app'

// The agent (MCP) surface of the out-of-the-box app (`examples/minimal`),
// driven by a real MCP client (`@modelcontextprotocol/sdk`) over Streamable
// HTTP against a stub deployment: the OAuth gate's challenge, the two
// discovery documents, the deployment token exchange, and the scope-derived
// tool surface — what an agent actually sees and is allowed to do.

const rootDir = fileURLToPath(new URL('../../examples/minimal', import.meta.url))

process.env.NUXT_TELEMETRY_DISABLED ||= '1'

/** The opaque OAuth Bearer the stubbed deployment recognizes. */
const AGENT_TOKEN = 'agent-access-token'
/** What the user consented to for this agent — two of the seven scopes. */
const GRANTED_SCOPES = ['profile', 'billing:read']
/** A second Bearer, consented to everything — the control for the scope filter. */
const FULL_AGENT_TOKEN = 'agent-access-token-full'
/** The short-lived Convex JWT the exchange mints for that Bearer. */
const CONVEX_JWT = 'convex-jwt-for-agent'
const AGENT_USER_ID = 'user_ada'
const AGENT_CLIENT_ID = 'client_agent'

/**
 * The tools `profile` + `billing:read` unlock, out of the nine built-ins.
 * `profile-update` needs `profile:write`, the two link tools need
 * `billing:checkout`, and the workspace pair needs `workspace:read`.
 */
const VISIBLE_TOOLS = ['billing-plans', 'billing-subscription', 'credits-balance', 'profile-get']

/** Every built-in tool — what the same endpoint offers a fully consented agent. */
const ALL_TOOLS = [
  'billing-checkout-link', 'billing-plans', 'billing-portal-link', 'billing-subscription',
  'credits-balance', 'profile-get', 'profile-update', 'workspace-list', 'workspace-members',
]

/**
 * What the deployment's better-auth mcp plugin advertises — the module builds
 * it in `defaultMcp()` (src/convex/client/index.ts) as the backend scopes plus
 * the plugin's `offline_access`.
 */
const DEPLOYMENT_SCOPES = [...new Set([...BACKEND_MCP_SCOPES, 'offline_access'])]

const USER = { _id: AGENT_USER_ID, name: 'Ada Lovelace', email: 'ada@example.com', emailVerified: true }
const PRODUCTS = {
  pro: { id: 'prod_pro', name: 'Pro plan', prices: [{ priceAmount: 2900, priceCurrency: 'usd' }] },
}
const SUBSCRIPTION = { id: 'sub_1', status: 'active', productId: 'prod_pro' }
const CREDITS = { meters: [{ key: 'ai', balance: 420 }] }

const stub = await startConvexStub({
  handlers: {
    // The Convex functions the four visible tools call, as the signed-in user.
    'auth:getAuthUser': () => USER,
    'billing:getConfiguredProducts': () => PRODUCTS,
    'billing:getCurrentSubscription': () => SUBSCRIPTION,
    'billing:getCredits': () => CREDITS,
  },
})

/**
 * The deployment's agent token exchange (`setupMcp`'s handler, mounted at
 * `POST /mcp/exchange`): validates the opaque Bearer against the OAuth
 * provider's token store and answers `{ token, expiresIn, session }` — the
 * exact contract `exchangeBackendMcpToken` reads. Unknown/expired Bearers get
 * the provider's `401 invalid_token`.
 */
stub.route('POST /mcp/exchange', (request) => {
  const [scheme, token] = String(request.headers.authorization ?? '').split(' ')
  const scopes = token === AGENT_TOKEN
    ? GRANTED_SCOPES
    : token === FULL_AGENT_TOKEN ? [...BACKEND_MCP_SCOPES] : null
  if (scheme?.toLowerCase() !== 'bearer' || !scopes) {
    return {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' },
      body: { error: 'invalid_token' },
    }
  }
  return {
    body: {
      token: CONVEX_JWT,
      // Mirrors MCP_TOKEN_TTL_SECONDS — the gate caches the session for it.
      expiresIn: 300,
      session: { userId: AGENT_USER_ID, clientId: AGENT_CLIENT_ID, scopes },
    },
  }
})

// The better-auth mcp plugin's RFC 8414 document, as the deployment serves it
// (the default stub route omits `scopes_supported`; the real plugin carries
// the catalog `defaultMcp()` configures).
stub.route('GET /api/auth/.well-known/oauth-authorization-server', () => ({
  body: {
    issuer: stub.url,
    authorization_endpoint: `${stub.url}/api/auth/mcp/authorize`,
    token_endpoint: `${stub.url}/api/auth/mcp/token`,
    registration_endpoint: `${stub.url}/api/auth/mcp/register`,
    jwks_uri: `${stub.url}/api/auth/mcp/jwks`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: DEPLOYMENT_SCOPES,
  },
}))

const app = prepareExampleApp(rootDir)
afterAll(async () => {
  await stub.close()
  app.cleanup()
})

await setup({
  rootDir,
  server: true,
  setupTimeout: 600_000,
  nuxtConfig: {
    telemetry: false,
    // See test/e2e/minimal.test.ts — local-checkout `link:` artifact only.
    build: { transpile: ['better-auth'] },
    backend: {
      url: stub.url,
      siteUrl: stub.url,
      autoEnv: false,
      scaffold: false,
      devtools: false,
    },
  },
})

const origin = () => new URL(url('/')).origin
const exchangeCount = () => stub.requests.filter(request => request.url === '/mcp/exchange').length

/**
 * Text of a tool result's first content block. Takes the raw record because
 * `callTool` is typed as a union with the legacy `{ toolResult }` shape.
 */
function toolText(result: Record<string, unknown>): string {
  const [block] = (result.content ?? []) as Array<{ type: string, text?: string }>
  return block?.text ?? ''
}

/**
 * A real MCP client over Streamable HTTP, optionally carrying an OAuth
 * Bearer. Every raw HTTP response is kept so the transport-level challenge
 * can be inspected (the SDK surfaces only a `StreamableHTTPError`).
 */
function createClient(token?: string): {
  client: Client
  transport: StreamableHTTPClientTransport
  responses: Response[]
} {
  const responses: Response[] = []
  const client = new Client({ name: 'nuxt-backend-e2e', version: '0.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(url('/mcp')), {
    ...(token ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } } : {}),
    fetch: async (input, init) => {
      const response = await globalThis.fetch(input, init)
      // Headers stay readable after the SDK consumes the body.
      responses.push(response)
      return response
    },
  })
  return { client, transport, responses }
}

describe('agent (MCP) endpoint — unauthenticated', { timeout: 60_000 }, () => {
  it('challenges an MCP client\'s `initialize` with 401 + a resource-metadata pointer', async () => {
    const { client, transport, responses } = createClient()
    try {
      await expect(client.connect(transport)).rejects.toThrow(StreamableHTTPError)
    }
    finally {
      await transport.close()
    }

    const challenge = responses.at(-1)!
    expect(challenge.status).toBe(401)
    expect(challenge.headers.get('www-authenticate')).toContain('Bearer')
    // What an MCP client actually reads to start the OAuth flow.
    const { resourceMetadataUrl } = extractWWWAuthenticateParams(challenge)
    expect(resourceMetadataUrl?.toString()).toBe(`${origin()}/.well-known/oauth-protected-resource`)
    // No Bearer at all — the gate challenges without touching the deployment.
    expect(exchangeCount()).toBe(0)
  })

  it('challenges a Bearer the deployment rejects (exchange 401 → re-authenticate, not 5xx)', async () => {
    const before = exchangeCount()
    const { client, transport, responses } = createClient('not-a-real-token')
    try {
      await expect(client.connect(transport)).rejects.toThrow(StreamableHTTPError)
    }
    finally {
      await transport.close()
    }

    const challenge = responses.at(-1)!
    expect(challenge.status).toBe(401)
    expect(challenge.headers.get('www-authenticate')).toContain('resource_metadata=')
    // The gate did ask the deployment, and turned its `invalid_token` into a
    // challenge rather than an error.
    expect(exchangeCount()).toBe(before + 1)
  })
})

describe('agent (MCP) OAuth discovery documents', { timeout: 60_000 }, () => {
  it('serves protected-resource metadata whose `scopes_supported` is the backend scope catalog', async () => {
    const metadata = await discoverOAuthProtectedResourceMetadata(url('/mcp'), {
      resourceMetadataUrl: `${origin()}/.well-known/oauth-protected-resource`,
    })
    expect(metadata.resource).toBe(origin())
    expect(metadata.authorization_servers).toEqual([`${origin()}/api/auth`])
    expect(metadata.scopes_supported).toEqual([...BACKEND_MCP_SCOPES])
  })

  it('proxies authorization-server metadata carrying the same scope catalog', async () => {
    // The plain RFC 8414 route the task names…
    const direct = await globalThis.fetch(`${origin()}/.well-known/oauth-authorization-server`)
    expect(direct.status).toBe(200)
    const document = await direct.json() as { scopes_supported?: string[] }
    // …proxied verbatim from the deployment, so its catalog covers every
    // backend scope (the plugin adds its own `offline_access`).
    expect(document.scopes_supported).toEqual(DEPLOYMENT_SCOPES)
    for (const scope of BACKEND_MCP_SCOPES) expect(document.scopes_supported).toContain(scope)

    // The same document through the SDK's own discovery, which follows the
    // protected-resource pointer to `${origin}/api/auth` and therefore hits
    // the RFC 8414 path-suffix form.
    const discovered = await discoverAuthorizationServerMetadata(`${origin()}/api/auth`)
    expect(discovered?.scopes_supported).toEqual(DEPLOYMENT_SCOPES)
    expect(discovered?.token_endpoint).toBe(`${stub.url}/api/auth/mcp/token`)
  })
})

/**
 * One connected agent client, shared by the tests below (so the exchange
 * cache assertion is meaningful). Built lazily: `@nuxt/test-utils` only
 * exposes the server URL for the duration of a test, never in `beforeAll`.
 */
let agent: { client: Client, transport: StreamableHTTPClientTransport } | null = null
async function connectedAgent(): Promise<Client> {
  if (!agent) {
    const created = createClient(AGENT_TOKEN)
    await created.client.connect(created.transport)
    agent = created
  }
  return agent.client
}
afterAll(async () => {
  await agent?.transport.close()
})

describe('agent (MCP) tools under a scoped Bearer', { timeout: 60_000 }, () => {
  it('lists exactly the built-in tools the granted scopes allow', async () => {
    const client = await connectedAgent()
    const { tools } = await client.listTools()
    expect(tools.map(tool => tool.name).sort()).toEqual(VISIBLE_TOOLS)
  })

  it('offers every built-in tool to an agent that consented to the full catalog', async () => {
    // Same endpoint, same build — only the exchanged scopes differ.
    const { client, transport } = createClient(FULL_AGENT_TOKEN)
    try {
      await client.connect(transport)
      const { tools } = await client.listTools()
      expect(tools.map(tool => tool.name).sort()).toEqual(ALL_TOOLS)
    }
    finally {
      await transport.close()
    }
  })

  it('runs a granted tool as the signed-in user, with the minted Convex JWT', async () => {
    const client = await connectedAgent()
    const before = stub.requests.length
    const result = await client.callTool({ name: 'profile-get' })
    expect(JSON.parse(toolText(result))).toMatchObject({ email: 'ada@example.com', name: 'Ada Lovelace' })

    // The tool reached Convex as the agent's user — the exchange's JWT, not
    // an anonymous call.
    const call = stub.requests.slice(before).find(request => request.url.startsWith('/api/query'))
    expect(call).toBeDefined()
    expect(call!.headers.authorization).toBe(`Bearer ${CONVEX_JWT}`)
    expect(stub.calls.some(entry => entry.path === 'auth:getAuthUser')).toBe(true)
  })

  it('reuses one token exchange across the whole agent session', async () => {
    const client = await connectedAgent()
    const before = exchangeCount()
    await client.listTools()
    await client.callTool({ name: 'billing-plans' })
    // The gate cached the session for the JWT's lifetime.
    expect(exchangeCount()).toBe(before)
  })

  it('refuses a tool whose scope the token lacks, without reaching Convex', async () => {
    const client = await connectedAgent()
    // Out-of-scope tools are never registered for this request, so the server
    // rejects the call outright (the SDK client surfaces the JSON-RPC error as
    // an `isError` result).
    const refusals = await Promise.all([
      client.callTool({ name: 'profile-update', arguments: { name: 'Renamed by an agent' } }),
      client.callTool({ name: 'billing-checkout-link', arguments: { productIds: ['prod_pro'] } }),
      client.callTool({ name: 'workspace-list' }),
    ])
    for (const [index, refusal] of refusals.entries()) {
      expect(refusal.isError, toolText(refusal)).toBe(true)
      expect(toolText(refusal)).toContain(['profile-update', 'billing-checkout-link', 'workspace-list'][index]!)
      expect(toolText(refusal)).toMatch(/not found/)
    }

    // Refused, not merely errored: no write, no deployment call at all.
    expect(stub.calls.some(entry => entry.path === 'auth:updateProfile')).toBe(false)
    expect(stub.calls.some(entry => entry.path === 'billing:generateCheckoutLink')).toBe(false)
    expect(stub.calls.some(entry => entry.path === 'auth:listWorkspaces')).toBe(false)
  })
})
