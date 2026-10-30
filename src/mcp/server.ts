/**
 * The developer MCP server (`npx nuxt-backend mcp`): one stdio server for
 * the coding agent that builds the app. It answers what state the project
 * is in, what the docs say, and what a provider holds, on the logins and
 * keys the project already has. It runs on the developer's machine, acts on
 * the deployment the project points at, and asks before any tool changes
 * something: through the client's elicitation prompt, or not at all.
 *
 * The MCP SDK's `McpServer` serves it, with the tool handlers set on its
 * low-level server, since the `data-*` tools keep the JSON Schemas the
 * Convex CLI's own server declares; every other tool declares its input
 * with zod (`./tools.ts`).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { packageVersion } from '../dirs'
import { billingTools } from './billing'
import { dataTools, type ConvexMcp } from './data'
import { docsTools, type DocsClient, docsClient } from './docs'
import { emailTools } from './email'
import { hostingTools } from './hosting'
import { projectTools } from './project'
import { messageOf, PassThrough, ToolRefusal, type DevTool, type ToolContext, type WriteRequest } from './tools'

/** The server's name, in its `serverInfo` and in the `.mcp.json` entry `init` writes. */
export const DEVELOPER_MCP_NAME = 'nuxt-backend'

/** What the server tells an agent at `initialize`. */
export function developerMcpInstructions(prod: boolean): string {
  return [
    `The developer MCP server of a nuxt-backend app${prod ? ', reading production: every write is refused' : ', on its dev deployment and the providers\' test modes'}.`,
    'Project state: `doctor` (findings and fixes), `status` (each capability live, test, missing or failing), `env` (env names, never values), `catalog` (what billing sync would do) and `functions` (the scaffold\'s function contract).',
    'Docs: `search-docs`, then `get-page` for a whole page.',
    'Providers: `data-*` (Convex: tables, documents, functions, logs, env names), `billing-*` (Polar), `email-*` (Resend, and `email-inbox` for dev sign-in codes) and `hosting-*` (Vercel). A tool whose provider is not signed in answers with the command that signs in.',
    'A tool that changes something asks the person first; when it is declined, change nothing and say so.',
  ].join('\n')
}

export interface DeveloperMcpOptions {
  rootDir: string
  prod: boolean
  /** Tests pass fakes for the parts that reach out. */
  docs?: DocsClient
  startConvex?: () => Promise<ConvexMcp>
  extraTools?: DevTool[]
}

/** A tool's answer as an MCP result: data as JSON text, a refusal as an error. */
function resultOf(value: unknown): CallToolResult {
  if (value instanceof PassThrough) return value.result as CallToolResult
  return { content: [{ type: 'text', text: JSON.stringify(value ?? null, null, 2) }] }
}

const refused = (message: string): CallToolResult => ({ content: [{ type: 'text', text: message }], isError: true })

/** The server, its tools wired, not yet connected to a transport. */
export function createDeveloperMcpServer({ rootDir, prod, docs = docsClient(), startConvex, extraTools = [] }: DeveloperMcpOptions): { server: McpServer, close: () => Promise<void> } {
  const mcp = new McpServer(
    { name: DEVELOPER_MCP_NAME, title: 'nuxt-backend', version: packageVersion() },
    { capabilities: { tools: {} }, instructions: developerMcpInstructions(prod) },
  )
  const server = mcp.server
  const data = dataTools({ rootDir, prod, ...(startConvex ? { start: startConvex } : {}) })
  const fixed = [...projectTools(), ...docsTools(docs)]
  const providers = [...billingTools(), ...emailTools(), ...hostingTools(), ...extraTools]
  /** Every tool this mode lists: with `--prod`, the ones that only read. */
  const listed = async (): Promise<DevTool[]> => [...fixed, ...await data.tools(), ...providers].filter(tool => !prod || tool.readOnly)

  /** Ask the person before a write, through the client's elicitation prompt. */
  async function confirm({ action, command }: WriteRequest): Promise<void> {
    if (prod) throw new ToolRefusal(`Refused: \`nuxt-backend mcp --prod\` changes nothing. To ${action}, do it yourself: ${command}.`)
    const elicitation = server.getClientCapabilities()?.elicitation as { form?: object, url?: object } | undefined
    if (!elicitation || (elicitation.form === undefined && elicitation.url !== undefined)) {
      throw new ToolRefusal(`Refused: this client cannot ask you to confirm a change, so nothing changed. To ${action}, do it yourself: ${command}.`)
    }
    const answer = await server.elicitInput({ mode: 'form', message: `Allow your coding agent to ${action}?`, requestedSchema: { type: 'object', properties: {} } })
    if (answer.action !== 'accept') throw new ToolRefusal(`Declined: you did not allow it to ${action}, and nothing changed.`)
  }
  const context: ToolContext = { rootDir, prod, confirm }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: (await listed()).map(tool => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: { title: tool.title, readOnlyHint: tool.readOnly, destructiveHint: !tool.readOnly, openWorldHint: tool.provider },
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = (await listed()).find(candidate => candidate.name === request.params.name)
    if (!tool) {
      const writes = prod && [...fixed, ...providers].some(candidate => candidate.name === request.params.name)
      return refused(writes ? `Refused: ${request.params.name} changes something, and \`nuxt-backend mcp --prod\` changes nothing.` : `No tool named ${request.params.name}.`)
    }
    try {
      return resultOf(await tool.run(request.params.arguments ?? {}, context))
    }
    catch (error) {
      return refused(error instanceof ToolRefusal ? error.message : `${tool.name} failed: ${messageOf(error)}`)
    }
  })

  return {
    server: mcp,
    close: async () => {
      await data.close()
      await mcp.close()
    },
  }
}

/**
 * Serve the developer MCP server on stdin and stdout until the client
 * closes it. Stdout carries the protocol and nothing else: every log line
 * the tools' shared code prints goes to stderr.
 */
export async function runDeveloperMcp(options: { rootDir: string, prod: boolean }): Promise<void> {
  const toStderr = (...args: unknown[]) => console.error(...args)
  console.log = toStderr
  console.info = toStderr
  console.debug = toStderr
  console.warn = toStderr
  const { server, close } = createDeveloperMcpServer(options)
  const transport = new StdioServerTransport()
  const closed = new Promise<void>((resolve) => {
    server.server.onclose = resolve
    process.stdin.once('end', resolve)
  })
  await server.connect(transport)
  await closed
  await close()
}
