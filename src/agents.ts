/**
 * The files `nuxt-backend init` writes for coding agents: a section of
 * `AGENTS.md` (read by Codex, Cursor, Copilot, Claude Code through
 * `@AGENTS.md`, and most others) and the Convex MCP server in `.mcp.json`.
 * The merges are pure, so `init` and the tests share them.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The markers around the section `init` owns in AGENTS.md. Text outside them is never touched. */
export const AGENTS_START = '<!-- nuxt-backend-start -->'
export const AGENTS_END = '<!-- nuxt-backend-end -->'

/** The AGENTS.md section, markers included. */
export const AGENTS_SECTION = `${AGENTS_START}
## nuxt-backend

This app runs on [nuxt-backend](https://nuxt-backend.dev): a Nuxt module plus an all-in-one Convex
backend (passwordless auth, workspaces, billing with credits and gifts, email, webhooks, an agent
endpoint).

- \`backend/\` holds the Convex functions (\`convex.json\` points there). The scaffolded files
  re-export the package's setup; add your own functions beside them. Never edit
  \`backend/_generated/\`: \`convex dev\` rewrites it.
- The app imports them through \`#backend/api\` and \`#backend/dataModel\`. Composables such as
  \`useAuth\`, \`useBilling\`, \`useCredits\` and \`useOrganization\` are auto-imported.
- Names are neutral: auth, billing, email, backend. Keep provider names out of app code, labels and
  env var names.
- \`npx nuxt-backend dev\` runs Convex and Nuxt together, and \`npx nuxt-backend doctor\` checks the
  whole setup. \`npx nuxt-backend env push\` syncs \`.env.local\` to the deployment, and
  \`npx nuxt-backend billing sync\` turns \`backend/billing.catalog.ts\` into products.
- The deployment's env: \`AUTH_SECRET\` and \`SITE_URL\` are required, and \`EMAIL_*\` and
  \`BILLING_*\` are optional. \`CONVEX_DEPLOYMENT\` belongs to the Convex CLI: read it, never rename
  it.
- Docs for agents: https://nuxt-backend.dev/llms.txt. The \`nuxt-backend\` skill covers the same
  ground: \`npx skills add https://nuxt-backend.dev -s nuxt-backend\`.
- For Convex itself, \`npx convex ai-files install\` writes its guidelines, and the \`convex\` server in
  \`.mcp.json\` reads the deployment.
${AGENTS_END}
`

export type AgentsMdAction = 'created' | 'appended' | 'replaced' | 'unchanged'

/**
 * AGENTS.md with the section in place. A missing file is created, a file
 * without the markers gets the section appended, and one with them is left
 * as it is unless `force` replaces what sits between the markers.
 */
export function mergeAgentsMd(existing: string | undefined, { force = false } = {}): { content: string, action: AgentsMdAction } {
  if (existing === undefined) return { content: AGENTS_SECTION, action: 'created' }
  const start = existing.indexOf(AGENTS_START)
  const end = existing.indexOf(AGENTS_END, start)
  if (start === -1 || end === -1) {
    const separator = existing === '' || existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n'
    return { content: `${existing}${separator}${AGENTS_SECTION}`, action: 'appended' }
  }
  if (!force) return { content: existing, action: 'unchanged' }
  const after = existing.slice(end + AGENTS_END.length).replace(/^\n/, '')
  const content = `${existing.slice(0, start)}${AGENTS_SECTION}${after}`
  return { content, action: content === existing ? 'unchanged' : 'replaced' }
}

/** The Convex MCP server: the app's own `convex` CLI, reading this project's deployment. */
export const CONVEX_MCP_SERVER = { command: 'npx', args: ['convex', 'mcp', 'start'] } as const

/**
 * What the dev server tells a coding agent while setup still needs attention.
 * nuxt-convex-module prints a hint of its own that points agents at
 * `convex dev --once`, which cannot finish a first push here: the deployment
 * needs AUTH_SECRET and SITE_URL before it, and `nuxt-backend dev`
 * provisions them.
 */
export const AGENT_HINT = 'A coding agent is running this app, which runs on nuxt-backend. '
  + 'Set it up with `npx nuxt-backend init`, then start it with `npx nuxt-backend dev`: it provisions AUTH_SECRET and SITE_URL on the deployment before `convex dev` (a bare `convex dev --once` cannot finish its first push here). '
  + 'Check the setup with `npx nuxt-backend doctor`. '
  + 'The package\'s agent skill: `npx skills add https://nuxt-backend.dev --skill nuxt-backend`.'

export type McpJsonAction = 'created' | 'added' | 'unchanged' | 'invalid'

/**
 * `.mcp.json` with a `convex` server. A missing file is created; an existing
 * one gains the server only when it has none by that name, keeping its
 * indentation and final newline. A file that is not a JSON object is left
 * alone (`invalid`).
 */
export function mergeMcpJson(existing: string | undefined): { content: string | undefined, action: McpJsonAction } {
  if (existing === undefined) {
    return { content: `${JSON.stringify({ mcpServers: { convex: CONVEX_MCP_SERVER } }, null, 2)}\n`, action: 'created' }
  }
  let config: unknown
  try {
    config = JSON.parse(existing)
  }
  catch {
    return { content: undefined, action: 'invalid' }
  }
  if (!isRecord(config) || (config.mcpServers !== undefined && !isRecord(config.mcpServers))) {
    return { content: undefined, action: 'invalid' }
  }
  const servers = (config.mcpServers ?? {}) as Record<string, unknown>
  if ('convex' in servers) return { content: existing, action: 'unchanged' }
  const indent = /^(\s+)"/m.exec(existing)?.[1] ?? '  '
  const eol = existing.endsWith('\n') ? '\n' : ''
  const content = JSON.stringify({ ...config, mcpServers: { ...servers, convex: CONVEX_MCP_SERVER } }, null, indent) + eol
  return { content, action: 'added' }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const readIfExists = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined)

const AGENTS_MESSAGES: Record<AgentsMdAction, string | undefined> = {
  created: 'Created AGENTS.md with a nuxt-backend section for coding agents',
  appended: 'Added a nuxt-backend section to AGENTS.md',
  replaced: 'Replaced the nuxt-backend section in AGENTS.md',
  unchanged: undefined,
}

const MCP_MESSAGES: Record<McpJsonAction, string | undefined> = {
  created: 'Created .mcp.json with the Convex MCP server',
  added: 'Added the Convex MCP server to .mcp.json',
  unchanged: undefined,
  invalid: '.mcp.json is not a JSON object, so it was left alone. Add the Convex server yourself: "convex": { "command": "npx", "args": ["convex", "mcp", "start"] }',
}

/**
 * Write AGENTS.md and `.mcp.json` in `rootDir`, and return what happened,
 * one line each, for `init` to print.
 */
export function writeAgentFiles(rootDir: string, { force = false } = {}): string[] {
  const messages: string[] = []

  const agentsPath = join(rootDir, 'AGENTS.md')
  const agents = mergeAgentsMd(readIfExists(agentsPath), { force })
  if (agents.action !== 'unchanged') writeFileSync(agentsPath, agents.content)
  if (AGENTS_MESSAGES[agents.action]) messages.push(AGENTS_MESSAGES[agents.action]!)

  const mcpPath = join(rootDir, '.mcp.json')
  const mcp = mergeMcpJson(readIfExists(mcpPath))
  if ((mcp.action === 'created' || mcp.action === 'added') && mcp.content) writeFileSync(mcpPath, mcp.content)
  if (MCP_MESSAGES[mcp.action]) messages.push(MCP_MESSAGES[mcp.action]!)

  // Claude Code reads CLAUDE.md, and follows AGENTS.md only when CLAUDE.md
  // imports it. Say so; never edit the user's CLAUDE.md.
  const claude = readIfExists(join(rootDir, 'CLAUDE.md'))
  if (claude !== undefined && !claude.includes('AGENTS.md')) {
    messages.push('CLAUDE.md does not mention AGENTS.md. Add a line with `@AGENTS.md` so Claude Code reads it too')
  }
  return messages
}
