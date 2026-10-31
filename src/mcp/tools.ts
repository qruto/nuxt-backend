/**
 * The developer MCP server's tools, as one shape: a name, what it answers,
 * the JSON Schema of its input, whether it only reads, and how it runs.
 * Every group (`./project.ts`, `./docs.ts`, `./data.ts`, `./billing.ts`,
 * `./email.ts`, `./hosting.ts`) builds its tools in this shape, and
 * `./server.ts` serves them: one list, one call handler, and one place that
 * asks before a write.
 */
import { z } from 'zod'

/** A JSON Schema for a tool's input: always an object. */
export interface InputSchema {
  type: 'object'
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}

/**
 * A change a tool is about to make, said to the person who confirms it:
 * what it does, in words that finish "Allow your coding agent to …", and
 * the command that does the same by hand, for a client that cannot ask and
 * for `--prod`, which changes nothing.
 */
export interface WriteRequest {
  action: string
  command: string
}

/** What every tool gets: the project, the mode, and the way to ask before a write. */
export interface ToolContext {
  /** The project directory the server runs in. */
  rootDir: string
  /** `--prod`: read production, refuse every write. */
  prod: boolean
  /** Ask the person before a write; throws a {@link ToolRefusal} unless they accept. */
  confirm: (request: WriteRequest) => Promise<void>
}

/** A tool's answer as MCP content, for the pass-through tools that answer in the provider's own words. */
export interface ToolContent {
  content: Array<{ type: 'text', text: string }>
  isError?: boolean
}

export interface DevTool {
  name: string
  title: string
  description: string
  inputSchema: InputSchema
  /** False for a tool that may change something: it asks first, and `--prod` never lists it. */
  readOnly: boolean
  /** True for a tool that reaches a provider's account rather than the project. */
  provider: boolean
  run: (args: Record<string, unknown>, context: ToolContext) => Promise<unknown>
}

/**
 * Why a tool answered with no data: not signed in, refused, declined. Its
 * message is what the agent reads, and says what to do next.
 */
export class ToolRefusal extends Error {
  override name = 'ToolRefusal'
}

/** A tool's answer that is MCP content already, passed on as it is. */
export class PassThrough {
  readonly result: ToolContent
  constructor(result: ToolContent) {
    this.result = result
  }
}

/**
 * A tool whose input a zod object describes: the schema it lists is that
 * object's JSON Schema, and a call's arguments are parsed by it, so a wrong
 * argument answers with what was wrong rather than reaching a provider.
 */
export function defineTool<S extends z.ZodObject>(definition: {
  name: string
  title: string
  description: string
  input: S
  readOnly?: boolean
  provider?: boolean
  run: (args: z.output<S>, context: ToolContext) => Promise<unknown>
}): DevTool {
  const { $schema: _, ...schema } = z.toJSONSchema(definition.input, { io: 'input' }) as InputSchema & { $schema?: string }
  return {
    name: definition.name,
    title: definition.title,
    description: definition.description,
    inputSchema: schema,
    readOnly: definition.readOnly ?? true,
    provider: definition.provider ?? false,
    async run(args, context) {
      const parsed = definition.input.safeParse(args)
      if (!parsed.success) throw new ToolRefusal(`Invalid arguments: ${z.prettifyError(parsed.error)}`)
      return definition.run(parsed.data, context)
    },
  }
}

/** A list's `limit`: how many items to answer with, 20 unless asked. */
export const limit = z.number().int().min(1).max(100).default(20).describe('How many to answer with, 20 by default and 100 at most')

/** The message of anything thrown, without a stack. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
