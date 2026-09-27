import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AGENTS_END, AGENTS_SECTION, AGENTS_START, CONVEX_MCP_SERVER, mergeAgentsMd, mergeMcpJson } from '../../src/agents'
import { main } from '../../src/cli/main'
import { BACKEND_ENV_NAMES } from '../../src/env-push'

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

// ---------------------------------------------------------------------------
// What the AGENTS.md section and the skill tell an agent must be true.

function walk(dir: string): string[] {
  return readdirSync(join(rootDir, dir), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`])
}

const skillFiles = walk('skills').filter(file => file.endsWith('.md'))
const texts: Array<[string, string]> = [['AGENTS section', AGENTS_SECTION], ...skillFiles.map(file => [file, read(file)] as [string, string])]

/** Docs routes from the content tree: `1.getting-started/2.quickstart.md` → `/getting-started/quickstart`. */
const docsRoutes = new Set(walk('website/content')
  .filter(file => file.endsWith('.md'))
  .map(file => `/${file.slice('website/content/'.length).replace(/\.md$/, '').split('/').map(part => part.replace(/^\d+\./, '')).join('/')}`.replace(/\/index$/, '') || '/'))

describe('the agent guidance', () => {
  it('has a skill whose frontmatter the skills tools accept', () => {
    expect(skillFiles).toContain('skills/nuxt-backend/SKILL.md')
    for (const dir of readdirSync(join(rootDir, 'skills'))) {
      const text = read(`skills/${dir}/SKILL.md`)
      const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/)?.[1]
      expect(frontmatter, dir).toBeDefined()
      const name = frontmatter!.match(/^name: (.+)$/m)?.[1]
      const description = frontmatter!.match(/^description: (.+)$/m)?.[1]
      expect(name).toBe(dir)
      expect(name).toMatch(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)
      expect(description?.length).toBeGreaterThan(50)
      expect(description!.length).toBeLessThanOrEqual(1024)
    }
  })

  it.each(texts)('%s names only real CLI commands', (_, text) => {
    const commands = Object.keys(main.subCommands as Record<string, unknown>)
    for (const [, command] of text.matchAll(/npx nuxt-backend ([a-z]+)/g)) expect(commands, command).toContain(command)
  })

  it.each(texts)('%s names only published import paths', (_, text) => {
    const exports = Object.keys((JSON.parse(read('package.json')) as { exports: Record<string, unknown> }).exports)
    for (const [, subpath] of text.matchAll(/`nuxt-backend\/([\w./-]+)`/g)) expect(exports, subpath).toContain(`./${subpath}`)
  })

  it.each(texts)('%s names only env vars the package or the Convex CLI knows', (_, text) => {
    const known = new Set<string>([...BACKEND_ENV_NAMES, 'NUXT_PUBLIC_BACKEND_URL', 'CONVEX_DEPLOYMENT', 'CONVEX_SITE_URL', 'CONVEX_SELF_HOSTED_URL'])
    for (const [, name] of text.matchAll(/`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)(?:=[^`]*)?`/g)) expect(known, name).toContain(name)
  })

  it.each(texts)('%s links only to docs pages that exist', (_, text) => {
    for (const [, raw] of text.matchAll(/https:\/\/nuxt-backend\.dev(\/[\w./-]*)/g)) {
      // A sentence may end right after a link.
      const path = raw!.replace(/[./]+$/, '') || '/'
      if (path === '/llms.txt' || path === '/' || path.startsWith('/playground')) continue
      expect(docsRoutes, path).toContain(path)
    }
  })

  it('is served by the docs site', () => {
    expect(read('website/nuxt.config.ts')).toContain(`skills: { dir: '../skills' }`)
  })
})
