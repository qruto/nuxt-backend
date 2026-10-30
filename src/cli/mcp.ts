/**
 * `nuxt-backend mcp` — the developer MCP server, on stdin and stdout, for
 * the coding agent that builds the app (src/mcp/server.ts). `init` writes it
 * into `.mcp.json`, so an agent that reads that file starts it on its own.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineCommand } from 'citty'
import { MCP_SDK } from '../agents'
import { nonProductionDeployKey, readEnvFiles } from '../env-push'
import { withContract } from './contract'

/** Whether `error` is the SDK failing to resolve, as opposed to a failure inside the server. */
export function isMissingMcpSdk(error: unknown): boolean {
  const { code, message } = (error ?? {}) as { code?: string, message?: string }
  return (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') && typeof message === 'string' && message.includes(MCP_SDK)
}

/** Why the server will not start, or null when it may. */
export function mcpStartRefusal(rootDir: string, prod: boolean): string | null {
  if (!existsSync(rootDir)) return `${rootDir} does not exist: pass the project directory with --cwd.`
  if (!prod) return null
  const type = nonProductionDeployKey({ ...readEnvFiles(rootDir), ...process.env })
  return type
    ? `--prod refused: CONVEX_DEPLOY_KEY is a ${type} deployment key, and the Convex CLI would read that deployment instead of production.`
    : null
}

export const mcp = withContract('mcp', {
  sideEffects: ['writes the dev deployment', 'writes provider accounts'],
  byFlag: { '--prod': ['reads only'] },
  json: 'none: it speaks MCP on stdin and stdout until the client closes it',
  exitCodes: {
    0: 'the client closed the connection',
    1: 'it could not start: no such project directory, @modelcontextprotocol/sdk not installed, or --prod refused for a deploy key of another deployment',
  },
}, defineCommand({
  meta: { name: 'mcp', description: 'Run the developer MCP server for your coding agent over stdio: the project\'s state, the docs, and the Convex, billing, email and hosting consoles on your own logins; every tool that writes asks you first' },
  args: {
    cwd: { type: 'string', description: 'Project directory', default: '.' },
    prod: { type: 'boolean', description: 'Read production: the project, billing, email and hosting tools read it, the data tools read only its logs and insights, and every write is refused', default: false },
  },
  async run({ args }) {
    const rootDir = resolve(process.cwd(), args.cwd)
    const refusal = mcpStartRefusal(rootDir, args.prod)
    if (refusal) {
      console.error(`[nuxt-backend] ${refusal}`)
      process.exitCode = 1
      return
    }
    // Loaded here, not at the top: every other command runs without the SDK.
    let server: typeof import('../mcp/server')
    try {
      server = await import('../mcp/server')
    }
    catch (error) {
      if (!isMissingMcpSdk(error)) throw error
      console.error(`[nuxt-backend] ${MCP_SDK} is not installed: run \`npm install -D ${MCP_SDK}\` (or \`npx nuxt-backend init --agents\`, which adds it), then restart your agent.`)
      process.exitCode = 1
      return
    }
    await server.runDeveloperMcp({ rootDir, prod: args.prod })
  },
}))
