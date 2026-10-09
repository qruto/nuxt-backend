import { lstatSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AGENTS_SECTION } from '../../src/agents'
import { main } from '../../src/cli/main'
import { BACKEND_ENV_NAMES } from '../../src/env-push'
import { at, contentRoute, frontmatter, read, walk } from './helpers'

// What coding agents are told about the package: the consumer skill under
// skills/ (published by the docs site at /.well-known/skills/ and installable
// with `npx skills add qruto/nuxt-backend`) and the section `init` writes into
// an app's AGENTS.md. An agent follows them to the letter and never asks
// whether a name is real, so the commands, paths, env names, links and API
// names in them are held to the code here. Runs in CI's `static` job, so a
// change to the skill alone is checked too.

const SKILLS_DIR = 'skills'
// A pattern rather than a substring: CodeQL reads `includes(url)` as URL
// validation, and the check here is only that the skill points at the site.
const SITE = /https:\/\/nuxt-backend\.dev(?:\/|\b)/
const skills = readdirSync(at(SKILLS_DIR))
const skillFiles = walk(SKILLS_DIR, ['.md']).map(file => file.slice(file.indexOf(`${SKILLS_DIR}/`)))
const texts: Array<[string, string]> = [['AGENTS section', AGENTS_SECTION], ...skillFiles.map(file => [file, read(file)] as [string, string])]
const docsRoutes = new Set(walk('website/content', ['.md']).map(contentRoute))

describe('published skills', () => {
  // The skills CLI rejects the site's whole index when one entry is invalid.
  it('finds the consumer skill', () => {
    expect(skills).toContain('nuxt-backend')
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
  })

  it('is served by the docs site', () => {
    expect(read('website/nuxt.config.ts')).toContain(`skills: { dir: '../skills' }`)
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
    const known = new Set<string>([...BACKEND_ENV_NAMES, 'NUXT_PUBLIC_BACKEND_URL', 'CONVEX_DEPLOYMENT', 'CONVEX_SITE_URL', 'CONVEX_SELF_HOSTED_URL'])
    for (const [, name] of text.matchAll(/`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)(?:=[^`]*)?`/g)) expect(known, name).toContain(name)
  })

  it.each(texts)('%s links only to docs pages that exist', (_, text) => {
    for (const [, raw] of text.matchAll(/https:\/\/nuxt-backend\.dev(\/[\w./-]*)/g)) {
      // A sentence may end right after a link; `/raw/<page>.md` is the
      // Markdown copy of a page.
      const path = raw!.replace(/[./]+$/, '').replace(/^\/raw(\/.*?)(?:\.md)?$/, '$1').replace(/\/index$/, '') || '/'
      if (path === '/llms.txt' || path === '/llms-full.txt' || path === '/' || path.startsWith('/playground') || path.startsWith('/.well-known/')) continue
      expect(docsRoutes, path).toContain(path)
    }
  })
})

describe('the nuxt-backend skill', () => {
  const dir = `${SKILLS_DIR}/nuxt-backend`
  const files = skillFiles.filter(file => file.startsWith(`${dir}/`))
  const links = files.flatMap(file => [...read(file).matchAll(/\]\(([^)\s]+)\)/g)].map(m => ({ file, href: m[1]!.replace(/[.,;:]$/, '') })))
  const relative = links.filter(link => !/^[a-z]+:/.test(link.href) && !link.href.startsWith('#'))

  it('reads the skill', () => {
    expect(files).toContain(`${dir}/SKILL.md`)
  })

  it.each(relative.map(link => [`${link.file} → ${link.href}`, link] as const))('%s stays inside the skill', (_where, { file, href }) => {
    // Served from /.well-known/skills/, a link out of the skill folder 404s.
    const target = new URL(href.split('#')[0]!, `file:///${file}`).pathname.slice(1)
    expect(target.startsWith(`${dir}/`), `${file} links ${href}, outside the skill`).toBe(true)
    expect(files, `${file} links ${href}, which does not exist`).toContain(target)
  })

  // Names shaped like this package's API or the base module's. The plain Vue
  // and Nuxt names an agent also writes (`useState`, `<NuxtPage>`) don't
  // match; a plausible-sounding invention (`useWorkspace`, `<PlanPicker>`)
  // does, and fails unless it exists.
  const API_NAME = /\buse(?:Auth\w*|LoginFlow|Organization\w*|Workspace\w*|Member\w*|Invitation\w*|Billing\w*|Feature\w*|Credit\w*|Order\w*|Usage\w*|Gift\w*|Passkey\w*|Session\w*|Backend\w*|Email\w*|Sandbox\w*|Workflow\w*|Ai\w*|Search\w*|Aggregate|Count|Admin\w*|Presence\w*|Connection\w*|Convex\w*|Query\w*|Queries|Mutation|Action|Upload\w*|PaginatedQuery\w*|AsyncQuery|AsyncPaginatedQuery|Preloaded\w*|StorageUrl|BetterAuth)\b/g
  const API_TAG = /<((?:Auth|Pricing|Billing|Credit|Organization|Role|Workspace|Gift|Passkey|Session|Account|Usage|Plan|Feature|Convex|Checkout|Invitation|Profile|Security|Sandbox|Member|Admin)\w*)\b/g
  const registered = new Set([
    // This module: addImports / addComponent entries and server import aliases.
    ...[...read('src/module.ts').matchAll(/\b(?:name|as): '(\w+)'/g)].map(m => m[1]!),
    // The base module's auto-imports and components, which every app gets too.
    ...[...read('node_modules/nuxt-convex-module/dist/module.mjs').matchAll(/\bname: "(\w+)"/g)].map(m => m[1]!),
  ])
  const exported = new Set(walk('src/runtime', ['.ts']).flatMap(file => [
    ...[...read(file).matchAll(/export (?:declare )?(?:async )?(?:function|const|class|interface|type) (\w+)/g)].map(m => m[1]!),
    ...[...read(file).matchAll(/export (?:type )?\{([^}]+)\}/g)].flatMap(m => m[1]!.split(',').map(s => s.trim().split(/\s+as\s+/).pop()!.replace(/^type\s+/, ''))),
  ]))
  const named = files.flatMap((file) => {
    const text = read(file)
    return [...text.matchAll(API_NAME), ...text.matchAll(API_TAG)].map(m => ({ file, name: m[1] ?? m[0] }))
  })

  it('names the API', () => {
    expect(new Set(named.map(n => n.name)).size).toBeGreaterThan(8)
  })

  it.each([...new Set(named.map(n => n.name))])('`%s` is real', (name) => {
    const where = named.filter(n => n.name === name).map(n => n.file).join(', ')
    expect(registered.has(name) || exported.has(name), `${where} names \`${name}\`, which neither this module nor nuxt-convex-module auto-imports or exports`).toBe(true)
  })

  it('links the docs site it is published on', () => {
    expect(files.some(file => SITE.test(read(file)))).toBe(true)
  })
})
