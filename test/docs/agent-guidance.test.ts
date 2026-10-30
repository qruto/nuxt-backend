import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { bareName, collect, findingSkill, headingAnchor, knownNames, orphans, outputs, renamedNames, skillOf, skillRegions, surfaceManifest } from '../../scripts/agent-guidance.mjs'
import { RENAMES } from '../../src/guidance/renames'
import { AGENT_SKILLS, type AgentSkill } from '../../src/guidance/skills'
import { WRONG_NAMES, type WrongNameKind } from '../../src/guidance/wrong-names'
import { at, contentFile, read, readModuleSources, walk } from './helpers'

// The agent guidance the package ships under skills/, read from node_modules
// so it matches the installed version. scripts/agent-guidance.mjs writes it
// from the code (`pnpm generate`): the public-surface manifest, the rename
// map, the blocks of each SKILL.md that list names and each task skill's
// API. Here the files are held to the generator, the skills registry to the
// surface, the rename map to the Upgrade page, and the wrong-name list to
// the manifest.

const data = collect()
const manifest = surfaceManifest(data)
const known = knownNames(data)

describe('the generated guidance', () => {
  it.each(Object.entries(outputs(data)))('%s is current', (file, content) => {
    expect(read(file) === content, `${file} is stale: run \`pnpm generate\``).toBe(true)
  })

  it('leaves no generated file behind that it no longer writes', () => {
    expect(orphans(), 'run `pnpm generate`, which deletes them').toEqual([])
  })

  it.each(Object.keys(outputs(data)).filter(file => file.endsWith('/references/api.md')))('%s gives every name a sentence from its doc comment', (file) => {
    const empty = [...read(file).matchAll(/^\| `([^`]+)` \|\s*\|$/gm)].map(match => match[1])
    expect(empty, 'write a doc comment above each of these').toEqual([])
  })

  it.each(AGENT_SKILLS.map(skill => skill.name))('%s keeps each generated block of SKILL.md once, inside hand-written prose', (name) => {
    const skill = read(`skills/${name}/SKILL.md`)
    for (const region of skillRegions(name)) {
      expect(skill.split(`<!-- generated:${region} -->`).length, region).toBe(2)
      expect(skill.split(`<!-- /generated:${region} -->`).length, region).toBe(2)
    }
  })
})

// Every public name, how-to page, command and doctor finding belongs to one
// skill (src/guidance/skills.ts), so an agent routed by the core lands on the
// skill that lists it, and a name a later change adds is placed on purpose.
describe('the skills registry', () => {
  /** Who claims each item of one kind: every item exactly one skill, and nothing the package does not have. */
  function owners(kind: keyof AgentSkill, items: string[]) {
    const claims = AGENT_SKILLS.flatMap(skill => ((skill[kind] ?? []) as readonly string[]).map(item => [item, skill.name] as const))
    return {
      unknown: claims.filter(([item]) => !items.includes(item)).map(([item, skill]) => `${skill}: ${item}`),
      unowned: items.filter(item => !claims.some(([claimed]) => claimed === item)),
      twice: items.filter(item => claims.filter(([claimed]) => claimed === item).length > 1),
    }
  }

  it.each([
    ['entrypoints', data.entries.map(entry => entry.path)],
    ['composables', data.composables.map(item => item.name)],
    ['components', data.components.map(item => item.name)],
    ['server', data.server],
    ['commands', data.cli.map(command => command.path)],
    ['functions', Object.keys(data.functions)],
  ] as const)('gives every one of the %s to exactly one skill', (kind, items) => {
    expect(items.length).toBeGreaterThan(0)
    expect(owners(kind, [...items])).toEqual({ unknown: [], unowned: [], twice: [] })
  })

  it('gives every doctor finding to exactly one skill, by its id or else its group', () => {
    const ids = data.findings.map(item => item.id)
    const groups = [...new Set(data.findings.map(item => item.group))]
    const claims = AGENT_SKILLS.flatMap(skill => (skill.findings ?? []).map(item => [item, skill.name] as const))
    expect(claims.filter(([item]) => !ids.includes(item) && !groups.includes(item)), 'neither a finding id nor a group').toEqual([])
    expect([...ids, ...groups].filter(item => claims.filter(([claimed]) => claimed === item).length > 1), 'claimed twice').toEqual([])
    expect(data.findings.filter(item => !findingSkill(item)).map(item => item.id), 'no owner').toEqual([])
    // The coding-agent files are the core's, in its `scaffold` group; the docs for agents the live site serves are the ship skill's, in `site`.
    expect(findingSkill({ id: 'agent-files', group: 'scaffold' })?.name).toBe('nuxt-backend')
    expect(findingSkill({ id: 'agent-docs', group: 'site' })?.name).toBe('nuxt-backend-ship')
  })

  it('routes every how-to page to a skill', () => {
    const pages = data.docs.filter(page => page.kind === 'how-to')
    expect(pages.length).toBeGreaterThan(40)
    expect(pages.filter(page => !skillOf(page.route)).map(page => page.route)).toEqual([])
  })

  it('gives a page to the skill with the longest prefix of its route', () => {
    expect(skillOf('/docs/ship/releases/upgrade')?.name).toBe('nuxt-backend-upgrade')
    expect(skillOf('/docs/ship/deploy')?.name).toBe('nuxt-backend-ship')
    expect(skillOf('/docs/develop/agents')?.name).toBe('nuxt-backend')
    expect(skillOf('/docs/develop/agents/mcp')?.name).toBe('nuxt-backend')
    expect(skillOf('/docs/develop/testing/e2e')?.name).toBe('nuxt-backend-ship')
    expect(skillOf('/docs/build/growth/offers')?.name).toBe('nuxt-backend-growth')
    expect(skillOf('/docs/shipping')).toBeUndefined()
  })

  it('gives every skill a how-to page of its own', () => {
    for (const skill of AGENT_SKILLS) {
      expect(data.docs.some(page => page.kind === 'how-to' && skillOf(page.route) === skill), skill.name).toBe(true)
    }
  })
})

describe('the public-surface manifest', () => {
  it('lists every import path the package exports', () => {
    const subpaths = Object.keys((JSON.parse(read('package.json')) as { exports: Record<string, unknown> }).exports)
      .filter(key => key !== './package.json' && !key.endsWith('.js'))
      .map(key => key === '.' ? 'nuxt-backend' : `nuxt-backend/${key.slice(2)}`)
    expect(Object.keys(manifest.entrypoints).sort()).toEqual(subpaths.sort())
  })

  it('lists every name the module registers', () => {
    const listed = new Set([...manifest.autoImports.composables, ...manifest.autoImports.components, ...manifest.autoImports.server, ...manifest.autoImports.middleware])
    const registered = [...readModuleSources().matchAll(/\b(?:addImports|addComponent|addRouteMiddleware|component)\(\{\s*name: '([\w-]+)'|\{ name: '(\w+)', from: resolver|as: '(\w+)'/g)]
      .map(match => match[1] ?? match[2] ?? match[3]!)
    expect(registered.length).toBeGreaterThan(40)
    for (const name of registered) expect(listed.has(name), name).toBe(true)
  })

  it('names what the setup functions return beside what they export', () => {
    expect(manifest.entrypoints['nuxt-backend/auth']!.values).toContain('setupAuth')
    expect(manifest.functions.auth).toContain('getAuthUser')
    expect(manifest.aliases).toEqual(expect.arrayContaining(['#backend/api', '#backend/dataModel', '#backend/server']))
  })
})

describe('the rename map', () => {
  const page = read(contentFile('/docs/ship/releases/upgrade'))
  const sections = new Map(page.split(/^## /m).slice(1).map(chunk => [chunk.slice(0, chunk.indexOf('\n')), chunk]))

  it('has an entry for every section of the Upgrade page, as every breaking change adds one', () => {
    const covered = new Set(RENAMES.map(entry => entry.section))
    expect(sections.size).toBeGreaterThan(10)
    for (const heading of sections.keys()) {
      expect(covered.has(heading), `"## ${heading}" on the Upgrade page has no entry in src/guidance/renames.ts`).toBe(true)
    }
  })

  it('lists the sections in the order of the page, newest first', () => {
    const order = [...new Set(RENAMES.map(entry => entry.section))]
    expect(order).toEqual([...sections.keys()].filter(heading => order.includes(heading)))
  })

  it.each(RENAMES.map(entry => [entry.from, entry] as const))('`%s` is named in its section, beside what replaces it', (_from, entry) => {
    const text = sections.get(entry.section)
    expect(text, `the Upgrade page has no "## ${entry.section}"`).toBeDefined()
    expect(text).toContain(entry.from)
    if (entry.to !== null) expect(text!.includes(entry.to) || known.has(bareName(entry.to)), `${entry.to} is neither in the section nor a public name`).toBe(true)
  })

  // Every API-shaped name a Gone column lists that the package no longer has:
  // composables, components, factories, types and constants. Members and
  // option keys that are still there (a slot prop, `signOut`) and values
  // (`null`, `'Browser'`) are the page's to explain, not the map's.
  const API_SHAPED = /^(?:<[A-Z]\w*>|use[A-Z]\w*(?:\(\))?|(?:create|setup|define|provide|register|make|get|list|generate|cancel|change|send|require|sync|claim)[A-Z]\w*(?:\(\))?|[A-Z][a-z]+[A-Z]\w*|[A-Z][A-Z0-9]*_[A-Z0-9_]+)$/
  /** Every member of every interface in the files behind the public API: what is still there under its name. */
  const members = new Set(walk('src', ['.ts'], path => /\/(?:_generated|devtools)\//.test(path)).flatMap((file) => {
    const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true)
    const names: string[] = []
    const visit = (node: ts.Node) => {
      if ((ts.isPropertySignature(node) || ts.isMethodSignature(node)) && node.name && ts.isIdentifier(node.name)) names.push(node.name.text)
      ts.forEachChild(node, visit)
    }
    visit(source)
    return names
  }))
  const stillThere = new Set([...known, ...members, ...Object.values(manifest.functions).flat(), ...Object.keys(manifest.env), 'ComputedRef'])
  const gone = [...new Set([...page.matchAll(/^\| (.+?) \| .+ \|$/gm)]
    .filter(([row]) => !row.startsWith('| Gone') && !row.startsWith('|---'))
    .flatMap(([, cell]) => [...cell!.matchAll(/`([^`]+)`/g)].map(match => match[1]!))
    .filter(name => API_SHAPED.test(name) && !stillThere.has(bareName(name))))]

  it('reads the names the Gone columns list as removed', () => {
    expect(gone.length).toBeGreaterThan(40)
  })

  it.each(gone)('carries `%s`, which a Gone column lists', (name) => {
    expect(RENAMES.some(entry => entry.from.includes(name) || entry.from.includes(bareName(name))), `add ${name} to src/guidance/renames.ts`).toBe(true)
  })

  it('links a section by the anchor the site gives its heading', () => {
    // Anchors the docs and the module already link by hand.
    expect(headingAnchor('Page paths, the stylesheet and the webhook log')).toBe('page-paths-the-stylesheet-and-the-webhook-log')
    expect(headingAnchor('The surface says backend, never a provider')).toBe('the-surface-says-backend-never-a-provider')
    expect(headingAnchor('The scaffolded `send` is internal')).toBe('the-scaffolded-send-is-internal')
  })

  it('is the rule CONTRIBUTING.md gives a breaking change', () => {
    expect(read('CONTRIBUTING.md')).toContain('src/guidance/renames.ts')
  })
})

describe('the wrong-name list', () => {
  const PLATFORM_ENV = ['CONVEX_DEPLOYMENT', 'CONVEX_SITE_URL', 'CONVEX_SELF_HOSTED_URL']

  /** Whether `text` names something real, looked up where a name of its kind lives. */
  function isReal(kind: WrongNameKind, text: string): boolean {
    switch (kind) {
      case 'composable': return known.has(text.match(/^\w+/)![0])
      case 'component': return known.has(text.match(/^<(\w+)>/)![1]!)
      case 'env': return text in manifest.env || PLATFORM_ENV.includes(text)
      case 'command': return text.slice('npx nuxt-backend '.length) in manifest.cli
      case 'import': return text in manifest.entrypoints || manifest.aliases.includes(text)
      case 'function': {
        const [, module, name] = text.split('.')
        return manifest.functions[module!]?.includes(name!) ?? false
      }
    }
  }

  it.each(WRONG_NAMES.map(entry => [entry.wrong, entry] as const))('`%s` is not a name, and what replaces it is', (_wrong, entry) => {
    expect(isReal(entry.kind, entry.wrong), `${entry.wrong} exists: drop it from the wrong-name list`).toBe(false)
    expect(isReal(entry.kind, entry.right), `${entry.right} does not exist`).toBe(true)
  })

  // `useBilling().products`: the member, read off what the composable returns.
  const memberUses = WRONG_NAMES.flatMap(entry => [...entry.right.matchAll(/\b(use\w+)\(\)\.(\w+)/g)].map(([, composable, member]) => [`${composable}().${member}`, composable!, member!] as const))
  const checker = (() => {
    const files = [...new Set(data.composables.map(item => at(item.file)))]
    const program = ts.createProgram(files, { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, skipLibCheck: true, noEmit: true, types: [] })
    return { program, checker: program.getTypeChecker() }
  })()

  /** The names of what `composable()` returns, inherited members included. */
  function returnedMembers(composable: string): string[] {
    const file = data.composables.find(item => item.name === composable)!.file
    const source = checker.program.getSourceFile(at(file))!
    const symbol = checker.checker.getExportsOfModule(checker.checker.getSymbolAtLocation(source)!).find(item => item.name === composable)!
    const signature = checker.checker.getTypeOfSymbolAtLocation(symbol, source).getCallSignatures()[0]!
    return checker.checker.getPropertiesOfType(signature.getReturnType()).map(item => item.name)
  }

  it('reads the members a composable returns', () => {
    expect(returnedMembers('useAuth')).toEqual(expect.arrayContaining(['user', 'signOut', 'isSignedIn']))
    expect(memberUses.length).toBeGreaterThan(8)
  })

  it.each(memberUses)('`%s` is a member its composable returns', (_use, composable, member) => {
    expect(returnedMembers(composable), `${composable}() returns no ${member}`).toContain(member)
  })

  it.each(renamedNames(data).map(entry => [entry.wrong, entry] as const))('0.1\'s `%s` is gone from what an app sees', (_wrong, entry) => {
    expect(known.has(bareName(entry.wrong))).toBe(false)
    expect(known.has(bareName(entry.right))).toBe(true)
  })
})
