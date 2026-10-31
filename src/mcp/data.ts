/**
 * The `data-*` tools: the Convex CLI's own MCP server (`convex mcp start`),
 * run as a child of this one and passed through, so an agent connects one
 * server, not two. What changes on the way:
 *
 * - The deployment is the project's: the child is started for this project
 *   only, its `status` picks the deployment, and the agent never passes a
 *   selector. With `--prod` the child reads production's logs and insights
 *   and nothing else (`--disable-tools` turns the rest off in the child too).
 * - Env answers names, never values: `data-env` lists names only, and the
 *   child's `envGet` is not passed through at all.
 * - Only the arguments a tool declares reach the child, so no component path
 *   or flag the agent invents does: the package component's tables, where
 *   sessions, codes and tokens live, stay unreadable, as the child reads the
 *   app's own tables and nothing below them.
 * - A write (`run`, `envSet`, `envRemove`) asks first, naming what it
 *   passes. So does a one-off query: it changes nothing, and it reads the
 *   deployment's env values (`process.env`) as well as its tables.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { resolveConvexCli } from '../convex-cli'
import { messageOf, PassThrough, ToolRefusal, type DevTool, type InputSchema, type ToolContent, type ToolContext, type WriteRequest } from './tools'

/** The child's tool names this server never passes through, with or without `--prod`. */
const NEVER = ['envGet'] as const

/** One `data-*` tool: the child's tool it passes to, and what it does. */
interface DataToolSpec {
  name: string
  convex: string
  title: string
  description: string
  /** Asks first; never listed with `--prod`. */
  write?: (args: Record<string, unknown>) => WriteRequest
  /** Asks first though it changes nothing: what it reads reaches past the app's tables. */
  ask?: (args: Record<string, unknown>) => WriteRequest
  /** Listed with `--prod` too: production's logs and insights. */
  prod?: true
}

const shellArg = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

/** An argument as text: a string as it is, anything else as `fallback`. */
const textOf = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback)

/** Text a confirmation quotes, cut to what a prompt can show. */
const quoted = (text: string, max = 500) => (text.length > max ? `${text.slice(0, max)}…` : text)

/** The pass-through tools, in the order they are listed. */
export const DATA_TOOLS: readonly DataToolSpec[] = [
  { name: 'data-tables', convex: 'tables', title: 'Tables', description: 'Every table of the app on the deployment, with its declared and inferred schema.' },
  { name: 'data-documents', convex: 'data', title: 'Documents', description: 'A page of documents from one of the app\'s tables, oldest or newest first, with a cursor for the next page.' },
  { name: 'data-functions', convex: 'functionSpec', title: 'Functions', description: 'Every function the deployment holds: its type, visibility, arguments and return value.' },
  {
    name: 'data-query',
    convex: 'runOneoffQuery',
    title: 'One-off query',
    description: 'Run a read-only JavaScript query against the deployment\'s tables, without deploying it. It can read the deployment\'s env values too, so it asks you first, showing the query.',
    ask: args => ({ action: `run this one-off query on the dev deployment, which can read every table and env value there: ${quoted(textOf(args.query))}`, command: 'paste it into the Convex dashboard (npx convex dashboard → Functions → Run a custom query)' }),
  },
  {
    name: 'data-run',
    convex: 'run',
    title: 'Run a function',
    description: 'Run one of the deployment\'s functions with arguments. It may write (a mutation or an action), so it asks you first.',
    write: (args) => {
      const name = textOf(args.functionName)
      const json = typeof args.args === 'string' ? args.args : JSON.stringify(args.args ?? {})
      return { action: `run ${name} with ${quoted(json)} on the dev deployment`, command: `npx convex run ${name} ${shellArg(json)}` }
    },
  },
  { name: 'data-logs', convex: 'logs', title: 'Logs', description: 'Recent function logs of the deployment, with a cursor for the next batch.', prod: true },
  { name: 'data-insights', convex: 'insights', title: 'Insights', description: 'The deployment\'s health over the last 72 hours: write conflicts and functions near their read limits.', prod: true },
  { name: 'data-env', convex: 'envList', title: 'Deployment env names', description: 'The names of the deployment\'s env vars. Never their values.' },
  {
    name: 'data-env-set',
    convex: 'envSet',
    title: 'Set a deployment env var',
    description: 'Set one env var on the dev deployment. It asks you first, and the confirmation names the variable, never the value.',
    write: args => ({ action: `set ${textOf(args.name)} on the dev deployment`, command: `npx convex env set ${textOf(args.name, 'NAME')}` }),
  },
  {
    name: 'data-env-remove',
    convex: 'envRemove',
    title: 'Remove a deployment env var',
    description: 'Remove one env var from the dev deployment. It asks you first.',
    write: args => ({ action: `remove ${textOf(args.name)} from the dev deployment`, command: `npx convex env remove ${textOf(args.name, 'NAME')}` }),
  },
]

/** Arguments the server fills itself, never the agent. */
const HIDDEN_ARGUMENTS = new Set(['deploymentSelector', 'includeValues', 'projectDir'])

/** The child's input schema, without the arguments the server fills. */
export function publicSchema(schema: InputSchema | undefined): InputSchema {
  if (!schema?.properties) return { type: 'object', properties: {} }
  const properties = Object.fromEntries(Object.entries(schema.properties).filter(([name]) => !HIDDEN_ARGUMENTS.has(name)))
  const required = (schema.required ?? []).filter(name => !HIDDEN_ARGUMENTS.has(name))
  return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) }
}

/** What the child is reached through: tests pass a fake. */
export interface ConvexMcp {
  listTools: () => Promise<Array<{ name: string, inputSchema: InputSchema }>>
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolContent & { structuredContent?: unknown }>
  close: () => Promise<void>
}

/** The flags the child starts with: this project only, and with `--prod` production's logs and insights alone. */
export function convexMcpArgs(rootDir: string, prod: boolean): string[] {
  const args = ['mcp', 'start', '--project-dir', rootDir]
  if (!prod) return [...args, '--disable-tools', NEVER.join(',')]
  const kept = new Set(DATA_TOOLS.filter(tool => tool.prod).map(tool => tool.convex))
  const disabled = [...new Set([...DATA_TOOLS.map(tool => tool.convex), ...NEVER])].filter(name => !kept.has(name))
  return [...args, '--prod', '--cautiously-allow-production-pii', '--disable-tools', disabled.join(',')]
}

/** Start the project's own `convex mcp start` and connect to it. */
export async function startConvexMcp(rootDir: string, prod: boolean): Promise<ConvexMcp> {
  const cli = resolveConvexCli(rootDir)
  if (!cli) throw new ToolRefusal('The Convex CLI is not installed in this project: install `convex` (npm i convex), then call again.')
  const client = new Client({ name: 'nuxt-backend', version: '0' })
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [cli, ...convexMcpArgs(rootDir, prod)],
    cwd: rootDir,
    env: Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    stderr: 'inherit',
  }))
  return {
    listTools: async () => (await client.listTools()).tools as Array<{ name: string, inputSchema: InputSchema }>,
    callTool: async (name, args) => await client.callTool({ name, arguments: args }) as ToolContent & { structuredContent?: unknown },
    close: () => client.close(),
  }
}

/** A tool result's data: its structured content, else its first text read as JSON. */
function dataOf(result: ToolContent & { structuredContent?: unknown }): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent
  const text = result.content.find(item => item.type === 'text')?.text
  if (text === undefined) return undefined
  try {
    return JSON.parse(text)
  }
  catch {
    return text
  }
}

const SIGN_IN = 'Sign in with `npx convex login`, and start the project once with `npx nuxt-backend dev` so .env.local names its dev deployment, then call again.'

/**
 * The `data-*` tools over a child started on first use: `start` connects
 * it (tests pass a fake), and the tools wait for it. The deployment
 * selector is read from the child's `status` once.
 */
export function dataTools({ rootDir, prod, start = () => startConvexMcp(rootDir, prod) }: { rootDir: string, prod: boolean, start?: () => Promise<ConvexMcp> }): { tools: () => Promise<DevTool[]>, close: () => Promise<void> } {
  let child: Promise<ConvexMcp> | undefined
  let selector: Promise<string> | undefined
  /** The child's own input schemas, by its tool names, once it has listed them. */
  const schemas = new Map<string, InputSchema>()
  const connect = () => child ??= start().then(async (mcp) => {
    for (const tool of await mcp.listTools()) schemas.set(tool.name, tool.inputSchema)
    return mcp
  }, (error: unknown) => {
    // A child that did not start is started again by the next call.
    child = undefined
    throw error
  })

  async function deploymentSelector(mcp: ConvexMcp): Promise<string> {
    selector ??= mcp.callTool('status', { projectDir: rootDir }).then((result) => {
      const data = dataOf(result) as { availableDeployments?: Array<{ deploymentSelector?: string }> } | string | undefined
      const first = typeof data === 'object' ? data?.availableDeployments?.[0]?.deploymentSelector : undefined
      if (result.isError || !first) throw new ToolRefusal(`No Convex deployment to read${typeof data === 'string' ? ` (${data})` : ''}. ${SIGN_IN}`)
      return first
    })
    try {
      return await selector
    }
    catch (error) {
      selector = undefined
      throw error
    }
  }

  async function call(spec: DataToolSpec, args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
    const request = (spec.write ?? spec.ask)?.(args)
    if (request) await context.confirm(request)
    let mcp: ConvexMcp
    try {
      mcp = await connect()
    }
    catch (error) {
      throw error instanceof ToolRefusal ? error : new ToolRefusal(`The Convex CLI's MCP server did not start: ${messageOf(error)}.`)
    }
    // Only what the child's own schema declares, less what the server fills.
    const declared = new Set(Object.keys(publicSchema(schemas.get(spec.convex)).properties ?? {}))
    const passed = Object.fromEntries(Object.entries(args).filter(([name]) => declared.has(name)))
    const result = await mcp.callTool(spec.convex, { ...passed, deploymentSelector: await deploymentSelector(mcp), ...(spec.convex === 'envList' ? { includeValues: false } : {}) })
    if (spec.convex !== 'envList' || result.isError) return new PassThrough({ content: result.content, ...(result.isError ? { isError: true } : {}) })
    // Names only, whatever the child answered.
    const data = dataOf(result) as { variables?: Array<{ name?: string }> } | undefined
    return { names: (data?.variables ?? []).map(variable => variable.name).filter((name): name is string => typeof name === 'string') }
  }

  async function tools(): Promise<DevTool[]> {
    const listed = prod ? DATA_TOOLS.filter(spec => spec.prod) : DATA_TOOLS
    // The child's own schemas, when it starts; a tool keeps its place in the
    // list without one, and answers with what went wrong when called.
    try {
      await Promise.race([connect(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), 20_000).unref())])
    }
    catch {
      // Listed without the child's schema: a call waits for the child, or starts it again.
    }
    return listed.map((spec): DevTool => {
      const inputSchema = publicSchema(schemas.get(spec.convex))
      return {
        name: spec.name,
        title: spec.title,
        description: `${spec.description} (Convex's \`${spec.convex}\` tool, on the ${prod ? 'production' : 'dev'} deployment.)`,
        inputSchema,
        readOnly: !spec.write,
        provider: true,
        run: (args, context) => call(spec, args, context),
      }
    })
  }

  return {
    tools,
    close: async () => {
      const running = child
      child = undefined
      if (running) await running.then(mcp => mcp.close(), () => {})
    },
  }
}
