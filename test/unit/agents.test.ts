import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGENT_HINT, agentFilesFinding, agentsSection, AGENTS_END, AGENTS_START, DEVELOPER_MCP_SERVER, INSTALLED_SKILL, INSTALLED_SKILLS, installAgentSkills, installedVersion, mergeAgentsMd, mergeMcpJson, PROJECT_SKILLS, writeAgentFiles } from '../../src/agents'
import { packageVersion } from '../../src/dirs'
import { AGENT_SKILLS, TASK_SKILLS } from '../../src/guidance/skills'

const rootDir = fileURLToPath(new URL('../..', import.meta.url))
const read = (path: string) => readFileSync(join(rootDir, path), 'utf8')

const AGENTS_SECTION = agentsSection()

describe('agentsSection', () => {
  it('names the installed version and the skill that ships with it', () => {
    const section = agentsSection('0.2.0')
    expect(section).toContain('This app runs on [nuxt-backend](https://nuxt-backend.dev) `0.2.0`:')
    expect(section).toContain(`\`${INSTALLED_SKILL}/SKILL.md\``)
    expect(section).toContain('npx nuxt-backend init --agents')
    expect(section.startsWith(AGENTS_START)).toBe(true)
    expect(section.endsWith(`${AGENTS_END}\n`)).toBe(true)
  })

  it('routes to every task skill the package ships, by name and where it lives', () => {
    const section = agentsSection('0.2.0').replace(/\n\s*/g, ' ')
    expect(section).toContain(`\`${INSTALLED_SKILLS}/\``)
    expect(section).toContain(`\`${PROJECT_SKILLS}/\``)
    for (const skill of TASK_SKILLS) expect(section).toContain(`\`${skill.name}\``)
    // Wrapped like the rest of the section.
    for (const line of agentsSection('0.2.0').split('\n')) expect(line.length, line).toBeLessThanOrEqual(110)
  })

  it('tells an agent on the dev server where the skills are', () => {
    expect(AGENT_HINT).toContain(`${INSTALLED_SKILL}/SKILL.md`)
  })

  it('names no version without one, as the templates ship it', () => {
    expect(AGENTS_SECTION).toContain('This app runs on [nuxt-backend](https://nuxt-backend.dev):')
    expect(AGENTS_SECTION).not.toMatch(/\d+\.\d+\.\d+/)
  })
})

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

  it('never touches a file whose markers do not pair up', () => {
    const orphan = `# Notes\n${AGENTS_START}\nmy own notes\n`
    const repeated = `${agentsSection('0.1.0')}\n${agentsSection('0.1.0')}`
    const endFirst = `${AGENTS_END}\nmine\n${AGENTS_START}\n`
    for (const existing of [orphan, repeated, endFirst, `# Notes\n${AGENTS_END}\n`]) {
      for (const force of [false, true]) expect(mergeAgentsMd(existing, { force, version: '0.2.0' })).toEqual({ content: existing, action: 'malformed' })
    }
  })

  it('keeps the notes after an orphaned start marker through init and init --agents', () => {
    // The reproduction: a start marker without its end marker used to read
    // as "no section", so init appended one, and the next forced rewrite
    // replaced everything from the orphan on, the notes included.
    const notes = `# Notes\n${AGENTS_START}\nmy own notes\n`
    const afterInit = mergeAgentsMd(notes, { version: '0.2.0' })
    expect(afterInit).toEqual({ content: notes, action: 'malformed' })
    const afterRefresh = mergeAgentsMd(afterInit.content, { force: true, version: '0.2.0' })
    expect(afterRefresh.content).toContain('my own notes')
    // A file the old code already appended to keeps its notes too.
    const appended = `${notes}\n${agentsSection('0.1.0')}`
    expect(mergeAgentsMd(appended, { force: true, version: '0.2.0' })).toEqual({ content: appended, action: 'malformed' })
  })

  it('writes the section for the version it is given', () => {
    expect(mergeAgentsMd(undefined, { version: '0.2.0' }).content).toBe(agentsSection('0.2.0'))
    const old = mergeAgentsMd('# Rules\n', { version: '0.1.0' }).content
    expect(mergeAgentsMd(old, { force: true, version: '0.2.0' })).toEqual({ content: `# Rules\n\n${agentsSection('0.2.0')}`, action: 'replaced' })
  })
})

describe('agentFilesFinding', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agent-files-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const check = () => agentFilesFinding(dir, '0.2.0')

  it('passes for the files init writes for the installed version', () => {
    writeAgentFiles(dir, { version: '0.2.0' })
    expect(check()).toMatchObject({ id: 'agent-files', capability: 'data', status: 'pass' })
  })

  it('passes for the section the templates ship, which names no version', () => {
    writeAgentFiles(dir)
    expect(check().status).toBe('pass')
  })

  it('warns, naming both versions, when the section was written for another one', () => {
    writeAgentFiles(dir, { version: '0.1.0' })
    const reported = check()
    expect(reported.status).toBe('warn')
    expect(reported.message).toContain('written for 0.1.0, and 0.2.0 is installed')
    expect(reported.fixHint).toContain('npx nuxt-backend init --agents')
  })

  it('warns when the section was edited by hand', () => {
    writeAgentFiles(dir, { version: '0.2.0' })
    writeFileSync(join(dir, 'AGENTS.md'), readFileSync(join(dir, 'AGENTS.md'), 'utf8').replace('Docs for agents', 'Docs'))
    expect(check()).toMatchObject({ status: 'warn', message: expect.stringContaining('differs from the one 0.2.0 writes') })
  })

  it('passes with a note when there is no AGENTS.md, as --no-agents leaves it', () => {
    expect(check()).toMatchObject({ status: 'pass', message: expect.stringContaining('No AGENTS.md') })
  })

  it('reads a section written with CRLF line endings as the same section', () => {
    writeAgentFiles(dir, { version: '0.2.0' })
    writeFileSync(join(dir, 'AGENTS.md'), agentsSection('0.2.0').replace(/\n/g, '\r\n'))
    expect(check().status).toBe('pass')
  })

  it('warns, without offering the rewrite, when the markers do not pair up', () => {
    writeAgentFiles(dir, { version: '0.2.0' })
    writeFileSync(join(dir, 'AGENTS.md'), `# Notes\n${AGENTS_START}\nmine\n`)
    const reported = check()
    expect(reported).toMatchObject({ status: 'warn', message: expect.stringContaining('unpaired or repeated') })
    expect(reported.fixHint).not.toContain('init --agents')
  })

  it('warns, naming them, while .agents/skills holds skills another version wrote', () => {
    writeAgentFiles(dir, { version: '0.2.0' })
    expect(check()).toMatchObject({ status: 'pass', message: expect.stringContaining(`${PROJECT_SKILLS} its skills`) })
    writeFileSync(join(dir, PROJECT_SKILLS, 'nuxt-backend-billing/SKILL.md'), 'old guidance')
    const reported = check()
    expect(reported).toMatchObject({ status: 'warn', message: expect.stringContaining('nuxt-backend-billing') })
    expect(reported.message).toContain('differ from the ones 0.2.0 ships')
    expect(reported.fixHint).toContain('npx nuxt-backend init --agents')
  })

  it('passes with a note while .agents/skills holds only some of the skills, as a subset install leaves it', () => {
    writeAgentFiles(dir, { version: '0.2.0' })
    rmSync(join(dir, PROJECT_SKILLS, 'nuxt-backend-ship'), { recursive: true })
    expect(check()).toMatchObject({ status: 'pass', message: expect.stringContaining(`${PROJECT_SKILLS} ${AGENT_SKILLS.length - 1} of its ${AGENT_SKILLS.length} skills`) })
    rmSync(join(dir, 'AGENTS.md'))
    expect(check()).toMatchObject({ status: 'pass', message: expect.stringContaining('No AGENTS.md') })
  })

  it('warns about a copy of a skill the installed version no longer ships', () => {
    writeAgentFiles(dir, { version: '0.2.0' })
    mkdirSync(join(dir, PROJECT_SKILLS, 'nuxt-backend-gone'))
    writeFileSync(join(dir, PROJECT_SKILLS, 'nuxt-backend-gone/SKILL.md'), 'a task skill a later release folded')
    const reported = check()
    expect(reported).toMatchObject({ status: 'warn', message: expect.stringContaining('skills 0.2.0 doesn\'t ship (nuxt-backend-gone)') })
    expect(reported.fixHint).toContain('npx nuxt-backend init --agents')
  })

  it('passes without the skills, as --no-agents leaves a project', () => {
    writeAgentFiles(dir, { version: '0.2.0' })
    rmSync(join(dir, PROJECT_SKILLS), { recursive: true })
    expect(check()).toMatchObject({ status: 'pass', message: expect.not.stringContaining(PROJECT_SKILLS) })
  })

  it('warns when the section or the developer MCP server is missing', () => {
    writeFileSync(join(dir, 'AGENTS.md'), '# Rules\n')
    expect(check()).toMatchObject({ status: 'warn', message: expect.stringContaining('no nuxt-backend section') })
    writeFileSync(join(dir, 'AGENTS.md'), agentsSection('0.2.0'))
    expect(check()).toMatchObject({ status: 'warn', message: expect.stringContaining('.mcp.json has no nuxt-backend server') })
    writeFileSync(join(dir, '.mcp.json'), '[]')
    expect(check()).toMatchObject({ status: 'warn', message: expect.stringContaining('not a JSON object') })
  })
})

describe('installAgentSkills', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agent-skills-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const installed = (name: string, file = 'SKILL.md') => join(dir, PROJECT_SKILLS, name, file)
  const names = AGENT_SKILLS.map(skill => skill.name).sort()
  const nothing = { installed: [], refreshed: [], removed: [], stale: [] }

  it('copies every skill the package ships into .agents/skills, as the package ships it', () => {
    expect(installAgentSkills(dir)).toEqual({ ...nothing, installed: names })
    expect(readdirSync(join(dir, PROJECT_SKILLS)).sort()).toEqual(names)
    for (const name of names) expect(readFileSync(installed(name), 'utf8'), name).toBe(read(`skills/${name}/SKILL.md`))
    expect(readFileSync(installed('nuxt-backend', 'references/api.md'), 'utf8')).toBe(read('skills/nuxt-backend/references/api.md'))
    expect(installAgentSkills(dir)).toEqual(nothing)
  })

  it('reads the skills of the app\'s own copy of the package, leaving its dotfiles out', () => {
    const shipped = join(dir, INSTALLED_SKILLS, 'nuxt-backend')
    mkdirSync(shipped, { recursive: true })
    writeFileSync(join(shipped, 'SKILL.md'), '---\nname: nuxt-backend\n---\nAn older core.\n')
    writeFileSync(join(shipped, '.DS_Store'), 'Finder')
    expect(installAgentSkills(dir)).toEqual({ ...nothing, installed: ['nuxt-backend'] })
    expect(readdirSync(join(dir, PROJECT_SKILLS, 'nuxt-backend'))).toEqual(['SKILL.md'])
    expect(readFileSync(installed('nuxt-backend'), 'utf8')).toContain('An older core.')
  })

  it('leaves a copy another version wrote unless forced, then replaces it whole', () => {
    installAgentSkills(dir)
    writeFileSync(installed('nuxt-backend-auth'), 'old guidance')
    writeFileSync(installed('nuxt-backend-auth', 'references/gone.md'), 'a file the new version dropped')
    rmSync(join(dir, PROJECT_SKILLS, 'nuxt-backend-ui'), { recursive: true })

    // A missing skill is written all the same, and the report says so beside the stale one.
    expect(installAgentSkills(dir)).toEqual({ ...nothing, installed: ['nuxt-backend-ui'], stale: ['nuxt-backend-auth'] })
    expect(readFileSync(installed('nuxt-backend-auth'), 'utf8')).toBe('old guidance')
    expect(existsSync(installed('nuxt-backend-ui'))).toBe(true)

    expect(installAgentSkills(dir, { force: true })).toEqual({ ...nothing, refreshed: ['nuxt-backend-auth'] })
    expect(readFileSync(installed('nuxt-backend-auth'), 'utf8')).toBe(read('skills/nuxt-backend-auth/SKILL.md'))
    expect(existsSync(installed('nuxt-backend-auth', 'references/gone.md'))).toBe(false)
  })

  it('takes a copy checked out with CRLF line endings, or holding a .DS_Store, as current', () => {
    installAgentSkills(dir)
    for (const file of ['SKILL.md', 'references/api.md']) writeFileSync(installed('nuxt-backend', file), read(`skills/nuxt-backend/${file}`).replace(/\n/g, '\r\n'))
    writeFileSync(installed('nuxt-backend', '.DS_Store'), 'Finder')
    expect(installAgentSkills(dir)).toEqual(nothing)
  })

  it('replaces a link in .agents/skills by a copy when forced, and never writes through it', () => {
    const elsewhere = join(dir, 'elsewhere')
    mkdirSync(elsewhere)
    writeFileSync(join(elsewhere, 'SKILL.md'), 'not ours')
    mkdirSync(join(dir, PROJECT_SKILLS), { recursive: true })
    symlinkSync(elsewhere, join(dir, PROJECT_SKILLS, 'nuxt-backend'), 'dir')

    expect(installAgentSkills(dir).stale).toEqual(['nuxt-backend'])
    expect(installAgentSkills(dir, { force: true }).refreshed).toEqual(['nuxt-backend'])
    expect(lstatSync(join(dir, PROJECT_SKILLS, 'nuxt-backend')).isSymbolicLink()).toBe(false)
    expect(readFileSync(installed('nuxt-backend'), 'utf8')).toBe(read('skills/nuxt-backend/SKILL.md'))
    expect(readdirSync(elsewhere)).toEqual(['SKILL.md'])
    expect(readFileSync(join(elsewhere, 'SKILL.md'), 'utf8')).toBe('not ours')
  })

  it('counts a copy it cannot read as stale, and replaces it when forced', () => {
    installAgentSkills(dir)
    // A plain file where the folder belongs, and a linked folder inside a copy.
    rmSync(join(dir, PROJECT_SKILLS, 'nuxt-backend-ui'), { recursive: true })
    writeFileSync(join(dir, PROJECT_SKILLS, 'nuxt-backend-ui'), 'not a folder')
    const references = join(dir, PROJECT_SKILLS, 'nuxt-backend-auth/references')
    rmSync(references, { recursive: true })
    mkdirSync(join(dir, 'elsewhere'))
    symlinkSync(join(dir, 'elsewhere'), references, 'dir')

    expect(installAgentSkills(dir)).toEqual({ ...nothing, stale: ['nuxt-backend-auth', 'nuxt-backend-ui'] })
    expect(agentFilesFinding(dir, '0.2.0')).toMatchObject({ status: 'warn', message: expect.stringContaining('(nuxt-backend-auth, nuxt-backend-ui)') })
    expect(installAgentSkills(dir, { force: true }).refreshed).toEqual(['nuxt-backend-auth', 'nuxt-backend-ui'])
    expect(installAgentSkills(dir)).toEqual(nothing)
    expect(existsSync(join(dir, 'elsewhere')), 'a link is removed as a link').toBe(true)
  })

  it('removes a skill the installed version no longer ships only when forced, a link as a link', () => {
    writeFileSync(join(dir, 'CLAUDE.md'), '@AGENTS.md\n')
    installAgentSkills(dir)
    mkdirSync(join(dir, PROJECT_SKILLS, 'nuxt-backend-gone'))
    writeFileSync(installed('nuxt-backend-gone'), '---\nname: nuxt-backend-gone\n---\nA task skill a later release folded.\n')
    symlinkSync(join('..', '..', PROJECT_SKILLS, 'nuxt-backend-gone'), join(dir, '.claude/skills/nuxt-backend-gone'), 'dir')
    const elsewhere = join(dir, 'elsewhere')
    mkdirSync(elsewhere)
    writeFileSync(join(elsewhere, 'SKILL.md'), 'not ours')
    symlinkSync(elsewhere, join(dir, PROJECT_SKILLS, 'nuxt-backend-old'), 'dir')

    expect(installAgentSkills(dir)).toEqual({ ...nothing, stale: ['nuxt-backend-gone', 'nuxt-backend-old'] })
    expect(existsSync(installed('nuxt-backend-gone'))).toBe(true)

    expect(installAgentSkills(dir, { force: true })).toEqual({ ...nothing, removed: ['nuxt-backend-gone', 'nuxt-backend-old'] })
    expect(readdirSync(join(dir, PROJECT_SKILLS)).sort()).toEqual(names)
    expect(readdirSync(join(dir, '.claude/skills')).sort()).toEqual(names)
    expect(readFileSync(join(elsewhere, 'SKILL.md'), 'utf8')).toBe('not ours')
  })

  it('leaves the skills skills-lock.json lists to the skills CLI, even when forced', () => {
    installAgentSkills(dir)
    writeFileSync(installed('nuxt-backend'), 'the site\'s newer core')
    mkdirSync(join(dir, PROJECT_SKILLS, 'nuxt-backend-gone'))
    writeFileSync(installed('nuxt-backend-gone'), 'a skill the site has and this version doesn\'t')
    rmSync(join(dir, PROJECT_SKILLS, 'nuxt-backend-ship'), { recursive: true })
    const lock = { version: 1, skills: Object.fromEntries(['nuxt-backend', 'nuxt-backend-gone', 'nuxt-backend-ship', 'animate'].map(name => [name, { source: 'https://nuxt-backend.dev', sourceType: 'well-known' }])) }
    writeFileSync(join(dir, 'skills-lock.json'), JSON.stringify(lock))

    const { skills, messages } = writeAgentFiles(dir, { force: true, version: '0.2.0' })
    expect(skills).toEqual({ ...nothing, stale: ['nuxt-backend', 'nuxt-backend-gone'] })
    expect(readFileSync(installed('nuxt-backend'), 'utf8')).toBe('the site\'s newer core')
    expect(existsSync(installed('nuxt-backend-gone'))).toBe(true)
    expect(existsSync(installed('nuxt-backend-ship')), 'a skill the lock lists is the CLI\'s to restore').toBe(false)
    expect(messages.join('\n')).toContain('The skills CLI manages nuxt-backend, nuxt-backend-gone (skills-lock.json)')
    expect(messages.join('\n')).toContain('npx skills add ./node_modules/nuxt-backend/skills --skill \'*\' -y')

    const reported = agentFilesFinding(dir, '0.2.0')
    expect(reported).toMatchObject({ status: 'warn', message: expect.stringContaining('nuxt-backend-gone') })
    expect(reported.fixHint).toContain('npx skills add ./node_modules/nuxt-backend/skills')
    expect(reported.fixHint).not.toContain('init --agents')
  })

  it('links each skill for Claude Code in a project that uses it, and nowhere else', () => {
    installAgentSkills(dir)
    expect(existsSync(join(dir, '.claude'))).toBe(false)

    writeFileSync(join(dir, 'CLAUDE.md'), '@AGENTS.md\n')
    expect(installAgentSkills(dir)).toEqual({ ...nothing, installed: names })
    for (const name of names) {
      const link = join(dir, '.claude/skills', name)
      expect(lstatSync(link).isSymbolicLink(), name).toBe(true)
      // A relative link, as the skills CLI makes one; a junction, with an absolute target, on Windows.
      if (process.platform !== 'win32') expect(readlinkSync(link)).toBe(join('..', '..', PROJECT_SKILLS, name))
      expect(realpathSync(link)).toBe(realpathSync(join(dir, PROJECT_SKILLS, name)))
      expect(readFileSync(join(link, 'SKILL.md'), 'utf8')).toBe(read(`skills/${name}/SKILL.md`))
    }
    expect(installAgentSkills(dir)).toEqual(nothing)
  })

  it('keeps a copy of its own in .claude/skills current when forced, and says so', () => {
    mkdirSync(join(dir, '.claude/skills/nuxt-backend'), { recursive: true })
    writeFileSync(join(dir, '.claude/skills/nuxt-backend/SKILL.md'), 'old guidance')
    expect(installAgentSkills(dir).stale).toEqual(['nuxt-backend'])
    expect(readFileSync(join(dir, '.claude/skills/nuxt-backend/SKILL.md'), 'utf8')).toBe('old guidance')
    expect(agentFilesFinding(dir, '0.2.0')).toMatchObject({ status: 'warn', message: expect.stringContaining('.claude/skills') })

    expect(installAgentSkills(dir, { force: true })).toEqual({ ...nothing, refreshed: ['nuxt-backend'] })
    expect(readFileSync(join(dir, '.claude/skills/nuxt-backend/SKILL.md'), 'utf8')).toBe(read('skills/nuxt-backend/SKILL.md'))
  })
})

describe('mergeMcpJson', () => {
  it('creates the file with the developer MCP server', () => {
    const { content, action } = mergeMcpJson(undefined)
    expect(action).toBe('created')
    expect(JSON.parse(content!)).toEqual({ mcpServers: { 'nuxt-backend': DEVELOPER_MCP_SERVER } })
    expect(DEVELOPER_MCP_SERVER).toEqual({ command: 'npx', args: ['nuxt-backend', 'mcp'] })
    expect(content!.endsWith('}\n')).toBe(true)
  })

  it('adds the server beside the others, keeping indentation and the missing newline', () => {
    const existing = JSON.stringify({ mcpServers: { other: { url: 'https://example.com/mcp' } } }, null, 4)
    const { content, action } = mergeMcpJson(existing)
    expect(action).toBe('added')
    expect(JSON.parse(content!)).toEqual({ mcpServers: { 'other': { url: 'https://example.com/mcp' }, 'nuxt-backend': DEVELOPER_MCP_SERVER } })
    expect(content).toMatch(/^\{\n {4}"mcpServers"/)
    expect(content!.endsWith('\n')).toBe(false)
  })

  it('adds a servers map to a file without one', () => {
    expect(JSON.parse(mergeMcpJson('{ "other": true }\n').content!)).toEqual({ other: true, mcpServers: { 'nuxt-backend': DEVELOPER_MCP_SERVER } })
  })

  it('leaves a nuxt-backend server alone, unless forced to the installed version\'s', () => {
    const existing = '{ "mcpServers": { "nuxt-backend": { "command": "bunx", "args": ["nuxt-backend", "mcp"] } } }\n'
    expect(mergeMcpJson(existing)).toEqual({ content: existing, action: 'unchanged', convexServer: false })
    const forced = mergeMcpJson(existing, { force: true })
    expect(forced.action).toBe('replaced')
    expect(JSON.parse(forced.content!)).toEqual({ mcpServers: { 'nuxt-backend': DEVELOPER_MCP_SERVER } })
    const current = mergeMcpJson(undefined).content!
    expect(mergeMcpJson(current, { force: true })).toEqual({ content: current, action: 'unchanged', convexServer: false })
  })

  it('keeps the Convex server an earlier version wrote, and says it is redundant', () => {
    const existing = '{ "mcpServers": { "convex": { "command": "npx", "args": ["convex", "mcp", "start"] } } }\n'
    const { content, action, convexServer } = mergeMcpJson(existing)
    expect(action).toBe('added')
    expect(convexServer).toBe(true)
    expect(Object.keys((JSON.parse(content!) as { mcpServers: object }).mcpServers)).toEqual(['convex', 'nuxt-backend'])
  })

  it('refuses what is not a JSON object', () => {
    for (const existing of ['{ nope', '[]', '{ "mcpServers": [] }']) {
      expect(mergeMcpJson(existing)).toEqual({ content: undefined, action: 'invalid', convexServer: false })
    }
  })
})

describe('the template apps', () => {
  it.each(['templates/starter', 'examples/advanced'])('%s ships the agent files exactly as init writes them', (app) => {
    expect(read(`${app}/AGENTS.md`)).toBe(mergeAgentsMd(undefined).content)
    expect(read(`${app}/.mcp.json`)).toBe(mergeMcpJson(undefined).content)
  })
})

describe('installedVersion', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'installed-version-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('reads the app\'s own copy of the package, else the running one', () => {
    expect(installedVersion(dir)).toBe(packageVersion())
    mkdirSync(join(dir, 'node_modules/nuxt-backend'), { recursive: true })
    writeFileSync(join(dir, 'node_modules/nuxt-backend/package.json'), '{ "name": "nuxt-backend", "version": "9.9.9" }')
    expect(installedVersion(dir)).toBe('9.9.9')
  })
})
