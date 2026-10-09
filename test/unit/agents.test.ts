import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AGENTS_END, AGENTS_SECTION, AGENTS_START, CONVEX_MCP_SERVER, mergeAgentsMd, mergeMcpJson } from '../../src/agents'

const rootDir = fileURLToPath(new URL('../..', import.meta.url))
const read = (path: string) => readFileSync(join(rootDir, path), 'utf8')

describe('mergeAgentsMd', () => {
  it('creates the file with the section alone', () => {
    expect(mergeAgentsMd(undefined)).toEqual({ content: AGENTS_SECTION, action: 'created' })
  })

  it('appends to a file without the markers, leaving the rest byte for byte', () => {
    for (const existing of ['# Rules\n\nBe kind.', '# Rules\n\nBe kind.\n', '# Rules\n\nBe kind.\n\n', '']) {
      const { content, action } = mergeAgentsMd(existing)
      expect(action).toBe('appended')
      expect(content.startsWith(existing)).toBe(true)
      expect(content.endsWith(AGENTS_SECTION)).toBe(true)
      if (existing) expect(content.slice(existing.length)).toMatch(/^\n{0,2}<!-- nuxt-backend-start -->/)
    }
    expect(mergeAgentsMd('# Rules\n').content).toBe(`# Rules\n\n${AGENTS_SECTION}`)
  })

  it('leaves a file with the markers alone, run after run', () => {
    const once = mergeAgentsMd('# Rules\n').content
    expect(mergeAgentsMd(once)).toEqual({ content: once, action: 'unchanged' })
  })

  it('replaces only what sits between the markers when forced', () => {
    const edited = `# Rules\n\n${AGENTS_START}\nmy own words\n${AGENTS_END}\n\n## After\n`
    const { content, action } = mergeAgentsMd(edited, { force: true })
    expect(action).toBe('replaced')
    expect(content).toBe(`# Rules\n\n${AGENTS_SECTION}\n## After\n`)
    expect(mergeAgentsMd(content, { force: true }).action).toBe('unchanged')
  })
})

describe('mergeMcpJson', () => {
  it('creates the file with the Convex server', () => {
    const { content, action } = mergeMcpJson(undefined)
    expect(action).toBe('created')
    expect(JSON.parse(content!)).toEqual({ mcpServers: { convex: CONVEX_MCP_SERVER } })
    expect(content!.endsWith('}\n')).toBe(true)
  })

  it('adds the server beside the others, keeping indentation and the missing newline', () => {
    const existing = JSON.stringify({ mcpServers: { other: { url: 'https://example.com/mcp' } } }, null, 4)
    const { content, action } = mergeMcpJson(existing)
    expect(action).toBe('added')
    expect(JSON.parse(content!)).toEqual({ mcpServers: { other: { url: 'https://example.com/mcp' }, convex: CONVEX_MCP_SERVER } })
    expect(content).toMatch(/^\{\n {4}"mcpServers"/)
    expect(content!.endsWith('\n')).toBe(false)
  })

  it('adds a servers map to a file without one', () => {
    expect(JSON.parse(mergeMcpJson('{ "other": true }\n').content!)).toEqual({ other: true, mcpServers: { convex: CONVEX_MCP_SERVER } })
  })

  it('leaves a file that already has a convex server alone', () => {
    const existing = '{ "mcpServers": { "convex": { "command": "bunx", "args": ["convex", "mcp", "start"] } } }\n'
    expect(mergeMcpJson(existing)).toEqual({ content: existing, action: 'unchanged' })
  })

  it('refuses what is not a JSON object', () => {
    for (const existing of ['{ nope', '[]', '{ "mcpServers": [] }']) {
      expect(mergeMcpJson(existing)).toEqual({ content: undefined, action: 'invalid' })
    }
  })
})

describe('the starter template', () => {
  it('ships the agent files exactly as init writes them', () => {
    expect(read('templates/starter/AGENTS.md')).toBe(mergeAgentsMd(undefined).content)
    expect(read('templates/starter/.mcp.json')).toBe(mergeMcpJson(undefined).content)
  })
})
