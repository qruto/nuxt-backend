import { existsSync, lstatSync, readdirSync, readlinkSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AGENT_HINT, agentsSection } from '../../src/agents'
import { main } from '../../src/cli/main'
import { BACKEND_ENV } from '../../src/env-registry'
import { MONITORING_PLATFORM_ENV } from '../../src/monitoring'
import { AGENT_SKILLS, CORE_SKILL, SKILL_BUDGETS } from '../../src/guidance/skills'
import { baseModuleSurface } from '../../scripts/lib/surface.mjs'
import { at, contentFile, contentRoute, frontmatter, read, readModuleSources, walk } from './helpers'

// What coding agents are told about the package: the consumer skills under
// skills/, the core and a task skill per feature (published by the docs site
// at /.well-known/skills/ and installable with `npx skills add
// qruto/nuxt-backend`), and the section `init` writes into an app's
// AGENTS.md. An agent follows them to the letter and never asks
// whether a name is real, so the commands, paths, env names, links and API
// names in them are held to the code here. Runs in CI's `static` job, so a
// change to the skill alone is checked too. The skill's generated parts
// have a test of their own, test/docs/agent-guidance.test.ts.

const SKILLS_DIR = 'skills'
// A pattern rather than a substring: CodeQL reads `includes(url)` as URL
// validation, and the check here is only that the skill points at the site.
const SITE = /https:\/\/nuxt-backend\.dev(?:\/|\b)/
const skills = readdirSync(at(SKILLS_DIR))
const skillFiles = walk(SKILLS_DIR, ['.md']).map(file => file.slice(file.indexOf(`${SKILLS_DIR}/`)))
const version = (JSON.parse(read('package.json')) as { version: string }).version

/**
 * What a text states as fact. The wrong-name list names what does not exist
 * on purpose, and upgrade.md what used to: both leave it, and
 * agent-guidance.test.ts holds them to the manifest instead.
 */
function stated(file: string, text: string): string {
  if (file === `${SKILLS_DIR}/nuxt-backend-upgrade/references/upgrade.md`) return ''
  return text.replace(/<!-- generated:wrong-names -->[\s\S]*?<!-- \/generated:wrong-names -->/, '')
}

const sources: Array<[string, string]> = [['AGENTS section', agentsSection(version)], ['dev-server agent hint', AGENT_HINT], ...skillFiles.map(file => [file, read(file)] as [string, string])]
const texts: Array<[string, string]> = sources.map(([file, text]) => [file, stated(file, text)])
const docsRoutes = new Set(walk('website/content', ['.md']).map(contentRoute))

describe('published skills', () => {
  // The skills CLI rejects the site's whole index when one entry is invalid.
  it('finds every skill src/guidance/skills.ts names, and nothing else', () => {
    expect([...skills].sort()).toEqual(AGENT_SKILLS.map(skill => skill.name).sort())
  })

  it.each(skills)('%s follows the Agent Skills spec', (name) => {
    const dir = `${SKILLS_DIR}/${name}`
    expect(lstatSync(at(dir)).isSymbolicLink(), `${dir} is a symlink — Docus skips those, so it would not be published`).toBe(false)
    const skill = read(`${dir}/SKILL.md`)
    const meta = frontmatter(skill)
    expect(meta.name, `${dir}/SKILL.md needs a \`name\` equal to its directory — the skills CLI requires it`).toBe(name)
    expect(name).toMatch(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)
    expect(name).not.toContain('--')
    expect(name.length).toBeLessThanOrEqual(64)
    expect(meta.description?.length ?? 0, 'a description agents can choose the skill by').toBeGreaterThan(50)
    expect(meta.description!.length, 'description is capped at 1024 characters').toBeLessThanOrEqual(1024)
    const allowed = ['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']
    for (const key of Object.keys(meta)) expect(allowed, `\`${key}\` is not an Agent Skills frontmatter key; claude.ai rejects the upload`).toContain(key)
    expect(skill.split('\n').length, 'keep SKILL.md under 500 lines — move detail to references/').toBeLessThanOrEqual(500)
    expect(existsSync(at(`${dir}/references`)), `${dir} has no references/`).toBe(true)
  })

  // Agents load the core with every task and a task skill whole when they
  // pick it; the lists live in references/ (see scripts/agent-guidance.mjs),
  // which they open when a task needs them.
  it.each(skills)('%s keeps SKILL.md within its budget', (name) => {
    const budget = name === CORE_SKILL.name ? SKILL_BUDGETS.core : SKILL_BUDGETS.task
    expect(Buffer.byteLength(read(`${SKILLS_DIR}/${name}/SKILL.md`)), `keep ${name}/SKILL.md within ${budget / 1000} kB — move detail to references/`).toBeLessThanOrEqual(budget)
  })

  it('is served by the docs site', () => {
    expect(read('website/nuxt.config.ts')).toContain(`skills: { dir: '../skills' }`)
  })

  it('is named, every one, on the Agent skills page', () => {
    const page = read(contentFile('/docs/develop/agents/skills'))
    for (const skill of AGENT_SKILLS) expect(page, skill.name).toContain(`| \`${skill.name}\` |`)
  })

  it('ships in the package', () => {
    expect((JSON.parse(read('package.json')) as { files: string[] }).files).toContain(SKILLS_DIR)
  })
})

// `npx skills add qruto/nuxt-backend` clones the repository and lists every
// SKILL.md in skills/, .agents/skills/ and .claude/skills/ (one level deep,
// the first of a name wins), except a skill skills-lock.json records under
// an agent's folder: that one is installed for this project's contributors,
// not published. So it lists exactly the consumer skills while every
// contributor skill is in the lock and every consumer skill stays out of it.
describe('the skills CLI', () => {
  const lock = Object.keys((JSON.parse(read('skills-lock.json')) as { skills: Record<string, unknown> }).skills)

  function listed(): string[] {
    const found = new Set<string>()
    for (const dir of [SKILLS_DIR, '.agents/skills', '.claude/skills']) {
      for (const entry of readdirSync(at(dir))) {
        if (!existsSync(at(`${dir}/${entry}/SKILL.md`))) continue
        const name = frontmatter(read(`${dir}/${entry}/SKILL.md`)).name!
        if (dir !== SKILLS_DIR && (lock.includes(name) || lock.includes(entry))) continue
        found.add(name)
      }
    }
    return [...found].sort()
  }

  it('lists every consumer skill, and only those', () => {
    expect(listed()).toEqual(AGENT_SKILLS.map(skill => skill.name).sort())
  })

  it.each(AGENT_SKILLS.map(skill => skill.name))('%s stays out of the lock, linked where agents here read it', (name) => {
    expect(lock, `${name} has no upstream to restore it from`).not.toContain(name)
    // Agents working in this repository load what users' agents load.
    expect(readlinkSync(at(`.agents/skills/${name}`))).toBe(`../../${SKILLS_DIR}/${name}`)
    expect(readlinkSync(at(`.claude/skills/${name}`))).toBe(`../../.agents/skills/${name}`)
  })
})

describe('the agent guidance', () => {
  it.each(texts)('%s names only real CLI commands', (_, text) => {
    const commands = Object.keys(main.subCommands as Record<string, unknown>)
    for (const [, command] of text.matchAll(/npx nuxt-backend ([a-z]+)/g)) expect(commands, command).toContain(command)
  })

  it.each(texts)('%s names only published import paths', (_, text) => {
    const exports = Object.keys((JSON.parse(read('package.json')) as { exports: Record<string, unknown> }).exports)
    for (const [, subpath] of text.matchAll(/`nuxt-backend\/([\w./-]+)`/g)) expect(exports, subpath).toContain(`./${subpath}`)
  })

  it.each(texts)('%s names only env vars the package or the Convex CLI knows', (_, text) => {
    // The package's names (src/env-registry.ts) and the platform's own,
    // the deploy key a host's build hands `convex deploy` and the names
    // Sentry's Vercel integration sets among them. A
    // constant an import path exports (`BACKEND_ERRORS`) is no env var.
    const surface = JSON.parse(read(`${SKILLS_DIR}/${CORE_SKILL.name}/references/surface.json`)) as { entrypoints: Record<string, { values: string[] }> }
    const constants = Object.values(surface.entrypoints).flatMap(entry => entry.values)
    const known = new Set<string>([...Object.keys(BACKEND_ENV), 'CONVEX_DEPLOYMENT', 'CONVEX_SITE_URL', 'CONVEX_SELF_HOSTED_URL', 'CONVEX_DEPLOY_KEY', 'NUXT_PUBLIC_CONVEX_SITE_URL', ...MONITORING_PLATFORM_ENV, ...constants])
    for (const [, name] of text.matchAll(/`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)(?:=[^`]*)?`/g)) expect(known, name).toContain(name)
  })

  it.each(sources)('%s links only to docs pages that exist', (_, text) => {
    for (const [, raw] of text.matchAll(/https:\/\/nuxt-backend\.dev(\/[\w./-]*)/g)) {
      // A sentence may end right after a link; `/raw/<page>.md` is the
      // Markdown copy of a page.
      const path = raw!.replace(/[./]+$/, '').replace(/^\/raw(\/.*?)(?:\.md)?$/, '$1').replace(/\/index$/, '') || '/'
      if (path === '/llms.txt' || path === '/llms-full.txt' || path === '/' || path.startsWith('/playground') || path.startsWith('/.well-known/')) continue
      // A file the site serves as is, such as doctor's JSON Schema.
      if (/\.\w+$/.test(path) && existsSync(at(`website/public${path}`))) continue
      expect(docsRoutes, path).toContain(path)
    }
  })
})

describe('the nuxt-backend skills', () => {
  const files = skillFiles
  const links = files.flatMap(file => [...read(file).matchAll(/\]\(([^)\s]+)\)/g)].map(m => ({ file, href: m[1]!.replace(/[.,;:]$/, '') })))
  const relative = links.filter(link => !/^[a-z]+:/.test(link.href) && !link.href.startsWith('#'))

  it('reads every skill', () => {
    for (const name of skills) expect(files).toContain(`${SKILLS_DIR}/${name}/SKILL.md`)
  })

  it.each(relative.map(link => [`${link.file} → ${link.href}`, link] as const))('%s stays inside its skill', (_where, { file, href }) => {
    // Each skill installs on its own, and is served from
    // /.well-known/skills/<name>/: a link out of its folder can 404.
    const dir = file.split('/').slice(0, 2).join('/')
    const target = new URL(href.split('#')[0]!, `file:///${file}`).pathname.slice(1)
    expect(target.startsWith(`${dir}/`), `${file} links ${href}, outside its skill`).toBe(true)
    expect(existsSync(at(target)), `${file} links ${href}, which does not exist`).toBe(true)
  })

  it.each(AGENT_SKILLS.filter(skill => skill !== CORE_SKILL).map(skill => skill.name))('the core routes to %s, and it points back at the core', (name) => {
    expect(read(`${SKILLS_DIR}/${CORE_SKILL.name}/SKILL.md`)).toContain(`\`${name}\``)
    const skill = read(`${SKILLS_DIR}/${name}/SKILL.md`)
    expect(frontmatter(skill).description).toContain(`${CORE_SKILL.name} core skill`)
    expect(skill).toContain(`\`${CORE_SKILL.name}\` core skill`)
  })

  // Names shaped like this package's API or the base module's. The plain Vue
  // and Nuxt names an agent also writes (`useState`, `<NuxtPage>`) don't
  // match; a plausible-sounding invention (`useWorkspace`, `<PlanPicker>`)
  // does, and fails unless it exists.
  const API_NAME = /\buse(?:Auth\w*|LoginFlow|Organization\w*|Workspace\w*|Member\w*|Invitation\w*|Billing\w*|Feature\w*|Credit\w*|Order\w*|Usage\w*|Gift\w*|Passkey\w*|Session\w*|Backend\w*|Email\w*|Sandbox\w*|Workflow\w*|Ai\w*|Search\w*|Aggregate|Count|Admin\w*|Presence\w*|Connection\w*|Convex\w*|Query\w*|Queries|Mutation|Action|Upload\w*|PaginatedQuery\w*|AsyncQuery|AsyncPaginatedQuery|Preloaded\w*|StorageUrl|BetterAuth)\b/g
  const API_TAG = /<((?:Auth|Pricing|Billing|Credit|Organization|Role|Workspace|Gift|Passkey|Session|Account|Usage|Plan|Feature|Convex|Checkout|Invitation|Profile|Security|Sandbox|Member|Admin)\w*)\b/g
  const registered = new Set([
    // This module: addImports / addComponent entries and server import aliases.
    ...[...readModuleSources().matchAll(/\b(?:name|as): '(\w+)'/g)].map(m => m[1]!),
    // The base module's auto-imports and components, which every app gets
    // too — less the brand-named ones the module hides (`hideBaseBrandNames`),
    // read the way the docs lookups and the skill's generator read them.
    ...Object.values(baseModuleSurface()).flat(),
  ])
  const exported = new Set(walk('src/runtime', ['.ts']).flatMap(file => [
    ...[...read(file).matchAll(/export (?:declare )?(?:async )?(?:function|const|class|interface|type) (\w+)/g)].map(m => m[1]!),
    ...[...read(file).matchAll(/export (?:type )?\{([^}]+)\}/g)].flatMap(m => m[1]!.split(',').map(s => s.trim().split(/\s+as\s+/).pop()!.replace(/^type\s+/, ''))),
  ]))
  const named = files.flatMap((file) => {
    const text = stated(file, read(file))
    return [...text.matchAll(API_NAME), ...text.matchAll(API_TAG)].map(m => ({ file, name: m[1] ?? m[0] }))
  })

  it('names the API', () => {
    expect(new Set(named.map(n => n.name)).size).toBeGreaterThan(8)
  })

  it.each([...new Set(named.map(n => n.name))])('`%s` is real', (name) => {
    const where = named.filter(n => n.name === name).map(n => n.file).join(', ')
    expect(registered.has(name) || exported.has(name), `${where} names \`${name}\`, which neither this module nor nuxt-convex-module auto-imports or exports`).toBe(true)
  })

  // The Upgrade page lists its sections newest first, and a later change can
  // build on an earlier one (a name renamed twice): applied newest first, the
  // later rename finds nothing to change and the earlier one stops short.
  it('has the upgrade skill apply the Upgrade page oldest first', () => {
    const upgrade = read(`${SKILLS_DIR}/nuxt-backend-upgrade/SKILL.md`)
    expect(upgrade).toContain('oldest first')
    expect(upgrade).not.toMatch(/(?:work through|apply)[^.]*newest first/i)
  })

  it('links the docs site it is published on', () => {
    expect(files.some(file => SITE.test(read(file)))).toBe(true)
  })
})
