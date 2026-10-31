import { existsSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEVELOPER_MCP_SERVER, MCP_SERVER_NAME } from '../../src/agents'
import { DATA_TOOLS } from '../../src/mcp/data'
import { DOCS_MCP_ENDPOINT } from '../../src/mcp/docs'
import { createDeveloperMcpServer } from '../../src/mcp/server'
import { DOCS_MCP_NAME, DOCS_MCP_URL } from '../../website/shared/docs-mcp'
import { contentFile, read } from './helpers'

// The developer MCP server (src/mcp/) and the agent plugin
// (.claude-plugin/marketplace.json) against the pages that describe them:
// Develop › Agents › Developer MCP server, Agent files and Agent plugin.

const page = read(contentFile('/docs/develop/agents/developer-mcp'))
const plugin = read(contentFile('/docs/develop/agents/plugin'))

/** Every tool name the server lists in a mode, with the providers' parts faked so nothing reaches out. */
async function toolNames(prod: boolean): Promise<string[]> {
  const { server, close } = createDeveloperMcpServer({
    rootDir: process.cwd(),
    prod,
    docs: { call: async () => ({ content: [] }), line: async () => null },
    startConvex: async () => { throw new Error('not here') },
  })
  const handler = (server.server as unknown as { _requestHandlers: Map<string, (request: unknown, extra: unknown) => Promise<{ tools: Array<{ name: string }> }>> })._requestHandlers.get('tools/list')!
  const { tools } = await handler({ method: 'tools/list', params: {} }, {})
  await close()
  return tools.map(tool => tool.name)
}

describe('the developer MCP server page', () => {
  it('names every tool the server lists, and no other', async () => {
    const names = await toolNames(false)
    const documented = new Set([...page.matchAll(/`([a-z]+(?:-[a-z]+)*)`/g)].map(match => match[1]!).filter(name => names.includes(name) || /^(?:data|billing|email|hosting)-[a-z-]+[a-z]$/.test(name)))
    for (const name of names) expect(documented, name).toContain(name)
    for (const name of documented) expect(names, name).toContain(name)
  })

  it('says --prod keeps the data tools to production\'s logs and insights, and lists no write', async () => {
    const names = await toolNames(true)
    expect(names.filter(name => name.startsWith('data-'))).toEqual(DATA_TOOLS.filter(tool => tool.prod).map(tool => tool.name))
    expect(page).toContain('the `data-*` tools read only its logs and insights')
    for (const write of ['data-run', 'data-env-set', 'data-env-remove', 'email-send-test']) {
      expect(names).not.toContain(write)
      expect(page).toContain(`\`${write}\``)
    }
  })

  it('shows the .mcp.json entry init writes', () => {
    const entry = { [MCP_SERVER_NAME]: DEVELOPER_MCP_SERVER }
    const block = /```json \[\.mcp\.json\]\n([\s\S]*?)```/.exec(read(contentFile('/docs/develop/agents/agent-files')))![1]!
    expect(JSON.parse(block)).toEqual({ mcpServers: entry })
    expect(page).toContain(`claude mcp add --scope project ${MCP_SERVER_NAME} -- ${DEVELOPER_MCP_SERVER.command} ${DEVELOPER_MCP_SERVER.args.join(' ')}`)
  })

  it('answers the docs tools from the docs MCP the site serves', () => {
    expect(DOCS_MCP_ENDPOINT).toBe(DOCS_MCP_URL)
  })
})

describe('the agent plugin', () => {
  const marketplace = JSON.parse(read('.claude-plugin/marketplace.json')) as {
    name: string
    plugins: Array<{ name: string, source: string, skills: string[], mcpServers: Record<string, { command?: string, args?: string[], type?: string, url?: string }> }>
  }
  const [entry] = marketplace.plugins

  it('is installed as the page says', () => {
    expect(plugin).toContain(`/plugin install ${entry!.name}@${marketplace.name}`)
    expect(plugin).toContain(`/plugin marketplace update ${marketplace.name}`)
    expect(marketplace.plugins).toHaveLength(1)
  })

  it('bundles the skills the package ships, from the repository, with no other files', () => {
    expect(entry!.source).toBe('./skills')
    expect(entry!.skills).toEqual(['./'])
    for (const name of readdirSync('skills')) expect(existsSync(`skills/${name}/SKILL.md`), name).toBe(true)
    // The plugin root holds no .mcp.json of its own: the servers are the entry's.
    expect(existsSync('skills/.mcp.json')).toBe(false)
  })

  it('bundles the developer MCP server and the docs MCP, under the names the page gives', () => {
    expect(entry!.mcpServers).toEqual({
      [MCP_SERVER_NAME]: DEVELOPER_MCP_SERVER,
      [DOCS_MCP_NAME]: { type: 'http', url: DOCS_MCP_URL },
    })
    expect(plugin).toContain(`\`${MCP_SERVER_NAME}\` and \`${DOCS_MCP_NAME}\``)
  })
})
