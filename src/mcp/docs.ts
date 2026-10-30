/**
 * The docs tools: `search-docs` and `get-page`, answered by the docs MCP
 * (https://mcp.nuxt-backend.dev/mcp), so an agent with the developer server
 * needs no second one. The docs MCP is stateless and answers each JSON-RPC
 * POST with JSON, so a plain `fetch` is the whole client. Its index
 * describes one release line; when the project installed another, each
 * answer says so and points at the skills in `node_modules`, which match
 * the installed version.
 */
import { z } from 'zod'
import { installedVersion } from '../agents'
import { defineTool, messageOf, PassThrough, ToolRefusal, type DevTool, type ToolContent } from './tools'

/** The docs MCP's URL: website/shared/docs-mcp.ts's DOCS_MCP_URL (test/docs/developer-mcp.test.ts holds the two equal). */
export const DOCS_MCP_ENDPOINT = 'https://mcp.nuxt-backend.dev/mcp'

/** A JSON-RPC answer from the docs MCP. */
interface RpcAnswer<T> {
  result?: T
  error?: { message?: string }
}

/** The release line of a version: `0.2.3` → `0.2.x`. */
export function releaseLine(version: string): string {
  const [major = '0', minor = '0'] = version.split('.')
  return `${major}.${minor}.x`
}

export interface DocsClient {
  /** Calls a docs MCP tool and answers its result. */
  call: (name: string, args: Record<string, unknown>) => Promise<ToolContent>
  /** The release line the docs MCP describes (its `serverInfo.version`), or null when it did not say. */
  line: () => Promise<string | null>
}

/** A client of the docs MCP at `url`, through `fetchImpl`. */
export function docsClient(url = DOCS_MCP_ENDPOINT, fetchImpl: typeof fetch = fetch): DocsClient {
  let id = 0
  async function rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
    let response: Response
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
        signal: AbortSignal.timeout(20_000),
      })
    }
    catch (error) {
      throw new ToolRefusal(`The docs MCP (${url}) could not be reached: ${messageOf(error)}. The same pages answer at https://nuxt-backend.dev/docs, and as Markdown with .md added to a page's URL.`)
    }
    const answer = await response.json().catch(() => ({})) as RpcAnswer<T>
    if (!response.ok || answer.error || answer.result === undefined) {
      throw new ToolRefusal(`The docs MCP answered ${response.status}${answer.error?.message ? `: ${answer.error.message.replace(/\.$/, '')}` : ''}.`)
    }
    return answer.result
  }
  let line: Promise<string | null> | undefined
  return {
    call: (name, args) => rpc<ToolContent>('tools/call', { name, arguments: args }),
    line: () => line ??= rpc<{ serverInfo?: { version?: string } }>('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'nuxt-backend', version: '0' },
    }).then(result => result.serverInfo?.version ?? null, () => null),
  }
}

/** The note an answer carries when the docs describe another release line than the project installed. */
async function versionNote(client: DocsClient, rootDir: string): Promise<string | null> {
  const docs = await client.line()
  const installed = installedVersion(rootDir)
  if (!docs || releaseLine(installed) === docs) return null
  return `These docs describe nuxt-backend ${docs}, and this project installed ${installed}. Where they differ, the skills in node_modules/nuxt-backend/skills describe the installed version.`
}

async function answer(client: DocsClient, rootDir: string, name: string, args: Record<string, unknown>): Promise<PassThrough> {
  const [result, note] = await Promise.all([client.call(name, args), versionNote(client, rootDir)])
  return new PassThrough(note ? { ...result, content: [...result.content, { type: 'text', text: note }] } : result)
}

export function docsTools(client: DocsClient = docsClient()): DevTool[] {
  return [
    defineTool({
      name: 'search-docs',
      title: 'Search the docs',
      description: 'Search every section of the nuxt-backend docs for a question in words, such as "credits on a workspace" or "sign in without a mailbox". Sections written by hand rank first; each comes with its page path for get-page.',
      input: z.object({
        query: z.string().min(1).max(200).describe('What to look for'),
        limit: z.number().int().min(1).max(20).default(8).describe('How many sections to answer with'),
      }),
      run: async (args, { rootDir }) => answer(client, rootDir, 'search', args),
    }),
    defineTool({
      name: 'get-page',
      title: 'Read a docs page',
      description: 'A nuxt-backend docs page as Markdown, by its path, such as `/docs/build/billing/catalog` (search-docs answers each section with its path).',
      input: z.object({ path: z.string().min(1).max(200).describe('The page path, starting with /docs/') }),
      run: async (args, { rootDir }) => answer(client, rootDir, 'get-page', args),
    }),
  ]
}
