import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dataTools, startConvexMcp, type ConvexMcp } from '../../src/mcp/data'
import { DEVELOPER_MCP_NAME, runDeveloperMcp } from '../../src/mcp/server'
import type { ToolContext } from '../../src/mcp/tools'

// The developer MCP server's two stdio ends. Below it, the Convex CLI's own
// MCP server (`convex mcp start`), started as a real child of this process:
// here a fake `convex` in a throwaway project speaks the protocol on its
// stdin and stdout and records how it was started. Above it, the agent's
// client on this process's stdin and stdout, which carry the protocol and
// nothing else.

// As in convex-cli.test.ts: `createRequire` stays real, except for the one
// case no fixture can produce while this repo has `convex` installed.
const resolver = vi.hoisted(() => ({ absent: false }))
vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:module')>()
  return {
    ...actual,
    createRequire: (base: string | URL) => {
      if (!resolver.absent) return actual.createRequire(base)
      return {
        resolve: () => {
          throw new Error('Cannot find module')
        },
      }
    },
  }
})

/** A `convex mcp start` that answers initialize, tools/list and tools/call, one JSON-RPC message a line. */
const FAKE_CONVEX_MCP = `
const fs = require('node:fs')
const path = require('node:path')
fs.writeFileSync(path.join(process.cwd(), 'convex-started.json'), JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }))
const send = message => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\\n')
const text = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] })
let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let end
  while ((end = buffer.indexOf('\\n')) >= 0) {
    const message = JSON.parse(buffer.slice(0, end))
    buffer = buffer.slice(end + 1)
    if (message.id === undefined) continue
    if (message.method === 'initialize') send({ id: message.id, result: { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fake-convex', version: '0' } } })
    else if (message.method === 'tools/list') send({ id: message.id, result: { tools: [
      { name: 'status', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' } } } },
      { name: 'tables', inputSchema: { type: 'object', properties: { deploymentSelector: { type: 'string' } }, required: ['deploymentSelector'] } },
    ] } })
    else if (message.method === 'tools/call' && message.params.name === 'status') send({ id: message.id, result: text({ availableDeployments: [{ kind: 'ownDev', deploymentSelector: 'fake-dev-selector' }] }) })
    else if (message.method === 'tools/call') send({ id: message.id, result: text({ tool: message.params.name, arguments: message.params.arguments }) })
    else send({ id: message.id, error: { code: -32601, message: 'Method not found' } })
  }
})
`

let rootDir: string
beforeEach(() => {
  rootDir = realpathSync(mkdtempSync(join(tmpdir(), 'developer-mcp-stdio-')))
  resolver.absent = false
  const pkg = join(rootDir, 'node_modules/convex')
  mkdirSync(join(pkg, 'bin'), { recursive: true })
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'convex', version: '0.0.0-test', bin: { convex: 'bin/main.js' } }))
  writeFileSync(join(pkg, 'bin/main.js'), FAKE_CONVEX_MCP)
})
afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const context = (overrides: Partial<ToolContext> = {}): ToolContext => ({ rootDir, prod: false, confirm: async () => {}, ...overrides })

describe('the Convex CLI\'s MCP server, as a child', () => {
  it('is the project\'s own convex, started for this project alone, with envGet turned off', async () => {
    const mcp = await startConvexMcp(rootDir, false)
    try {
      expect((await mcp.listTools()).map(tool => tool.name)).toEqual(['status', 'tables'])
      expect(JSON.parse(readFileSync(join(rootDir, 'convex-started.json'), 'utf8'))).toEqual({ args: ['mcp', 'start', '--project-dir', rootDir, '--disable-tools', 'envGet'], cwd: rootDir })
      expect(await mcp.callTool('tables', { deploymentSelector: 'x' })).toMatchObject({ content: [{ type: 'text', text: JSON.stringify({ tool: 'tables', arguments: { deploymentSelector: 'x' } }) }] })
    }
    finally {
      await mcp.close()
    }
  })

  it('backs the data tools when no stand-in is given: the deployment its status names, the schema it lists', async () => {
    const data = dataTools({ rootDir, prod: false })
    try {
      const tables = (await data.tools()).find(tool => tool.name === 'data-tables')!
      expect(tables.inputSchema).toEqual({ type: 'object', properties: {} })
      const answer = await tables.run({ componentPath: 'backend' }, context()) as { result: { content: Array<{ text: string }> } }
      expect(JSON.parse(answer.result.content[0]!.text)).toEqual({ tool: 'tables', arguments: { deploymentSelector: 'fake-dev-selector' } })
    }
    finally {
      await data.close()
    }
  })

  it('says to install convex when the project has none, without starting anything', async () => {
    resolver.absent = true
    await expect(startConvexMcp(rootDir, false)).rejects.toThrow('The Convex CLI is not installed in this project: install `convex` (npm i convex), then call again.')
  })
})

describe('a Convex child that does not start', () => {
  const working: ConvexMcp = {
    listTools: async () => [{ name: 'status', inputSchema: { type: 'object' } }, { name: 'envRemove', inputSchema: { type: 'object', properties: { deploymentSelector: {}, name: {} } } }],
    callTool: async name => name === 'status'
      ? { content: [{ type: 'text', text: JSON.stringify({ availableDeployments: [{ deploymentSelector: 'dev-selector' }] }) }] }
      : { content: [{ type: 'text', text: `${name} answered` }] },
    close: async () => {},
  }

  it('is said in the answer, and started again by the next call', async () => {
    const start = vi.fn<() => Promise<ConvexMcp>>()
      .mockRejectedValueOnce(new Error('spawn EACCES'))
      .mockRejectedValueOnce(new Error('spawn EACCES'))
      .mockResolvedValue(working)
    const data = dataTools({ rootDir, prod: false, start })
    const remove = (await data.tools()).find(tool => tool.name === 'data-env-remove')!
    await expect(remove.run({ name: 'EMAIL_FROM' }, context())).rejects.toThrow('The Convex CLI\'s MCP server did not start: spawn EACCES.')
    expect(await remove.run({ name: 'EMAIL_FROM' }, context())).toMatchObject({ result: { content: [{ text: 'envRemove answered' }] } })
    expect(start).toHaveBeenCalledTimes(3)
    await data.close()
  })

  it('asks before removing an env var, naming it and the command that does it by hand', async () => {
    const confirm = vi.fn(async () => {})
    const data = dataTools({ rootDir, prod: false, start: async () => working })
    await (await data.tools()).find(tool => tool.name === 'data-env-remove')!.run({ name: 'EMAIL_FROM' }, context({ confirm }))
    expect(confirm).toHaveBeenCalledWith({ action: 'remove EMAIL_FROM from the dev deployment', command: 'npx convex env remove EMAIL_FROM' })
    await data.close()
  })
})

describe('the developer MCP server on stdio', () => {
  it('speaks only the protocol on stdout, moves every log line to stderr, and stops when the client closes stdin', async () => {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    let written = ''
    stdout.setEncoding('utf8').on('data', (chunk: string) => {
      written += chunk
    })
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(stdin as unknown as typeof process.stdin)
    vi.spyOn(process, 'stdout', 'get').mockReturnValue(stdout as unknown as typeof process.stdout)
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void errors.push(args.join(' ')))
    const original = { log: console.log, info: console.info, debug: console.debug, warn: console.warn }
    try {
      const serving = runDeveloperMcp({ rootDir, prod: true })
      const answers = () => written.split('\n').filter(Boolean).map(line => JSON.parse(line) as { id: number, result?: { serverInfo?: { name: string }, tools?: Array<{ name: string }> } })
      stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'agent', version: '0' } } })}\n`)
      await vi.waitFor(() => expect(answers().map(answer => answer.id)).toEqual([1]))
      expect(answers()[0]!.result!.serverInfo!.name).toBe(DEVELOPER_MCP_NAME)

      // Any line the tools' shared code logs lands on stderr, not in the protocol.
      console.log('a stray log line')
      console.warn('a stray warning')
      expect(errors).toEqual(['a stray log line', 'a stray warning'])

      stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
      stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`)
      await vi.waitFor(() => expect(answers().map(answer => answer.id)).toEqual([1, 2]), { timeout: 15_000 })
      const names = answers()[1]!.result!.tools!.map(tool => tool.name)
      expect(names).toContain('doctor')
      expect(names.filter(name => name.startsWith('data-'))).toEqual(['data-logs', 'data-insights'])
      expect(written.split('\n').filter(Boolean).every(line => line.startsWith('{"'))).toBe(true)

      stdin.end()
      await serving
    }
    finally {
      Object.assign(console, original)
    }
  }, 30_000)
})
