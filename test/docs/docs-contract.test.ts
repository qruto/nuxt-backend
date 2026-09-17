import { describe, expect, it } from 'vitest'
import { at, documentedKeys, interfaceKeys, read, walk } from './helpers'

// The hand-written docs against the code, in both directions: every module
// option is documented where the docs list options, every registry name the
// docs cite exists, README links resolve from npm, the contributor docs name
// real CI jobs, and nothing describes the repository as it no longer is.
// Runs in CI's `static` job, which every pull request gets — the `test` job
// is skipped for docs-only changes. test/nuxt/public-surface.test.ts covers
// the package exports and the auto-import registry.

const README = read('README.md')
const STABILITY = read('STABILITY.md')
const CONTRIBUTING = read('CONTRIBUTING.md')
const manifest = JSON.parse(read('package.json')) as { engines: { node: string }, peerDependencies: Record<string, string> }
const handWritten = walk('website/content', ['.md'], path => path.includes('/9.reference/'))
const prose = [at('README.md'), ...handWritten]

describe('module options', () => {
  const keys = interfaceKeys(at('src/module.ts'), 'ModuleOptions')
  const reference = read('website/content/7.api-reference/5.module-options.md')
  const configuration = read('website/content/1.getting-started/4.configuration.md')

  it('reads the interface', () => {
    expect(keys).toContain('workspaces')
    expect(keys.length).toBeGreaterThan(8)
  })

  it.each(keys)('`%s` is in the API reference, the configuration page and STABILITY.md', (key) => {
    expect(documentedKeys(reference, 'interface ModuleOptions {'), `5.module-options.md's interface block lacks ${key}`).toContain(key)
    expect(documentedKeys(configuration, '## Module options'), `4.configuration.md's field group lacks ${key}`).toContain(key)
    expect(STABILITY, `STABILITY.md's configuration surface lacks \`${key}\``).toContain(`\`${key}\``)
  })
})

describe('route middleware', () => {
  // The package promises `auth`; the base module registers the same guard as
  // `convex-auth`. Anything else in a `definePageMeta` is a typo that would
  // silently leave a page unguarded.
  it.each(prose)('%s names only a registered middleware', (file) => {
    for (const [, name] of read(file).matchAll(/middleware:\s*'([^']+)'/g)) {
      expect(['auth', 'convex-auth'], `${file} uses middleware '${name}'`).toContain(name)
    }
  })
})

describe('CLI', () => {
  const commands = [...read('src/cli/main.ts').matchAll(/subCommands: \{([^}]+)\}/g)].flatMap(m => m[1]!.split(',').map(s => s.trim().split(':')[0]!.trim()).filter(Boolean))
  const page = read('website/content/5.tooling/1.cli.md')

  it('reads the commands', () => {
    expect(commands).toEqual(expect.arrayContaining(['init', 'doctor', 'env', 'billing']))
  })

  it.each(commands.filter(c => !['env', 'billing', 'push'].includes(c)))('`%s` has a section on the CLI page', (command) => {
    expect(page).toContain(`## \`${command}\``)
  })

  it('documents the nested commands', () => {
    expect(page).toContain('## `env push`')
    expect(page).toContain('## `billing sync`')
  })
})

describe('stability', () => {
  it('states the convex and vue peer ranges as declared', () => {
    for (const [pkg, range] of Object.entries(manifest.peerDependencies)) {
      if (pkg === 'convex-test') continue
      expect(STABILITY, `STABILITY.md does not state the ${pkg} peer range ${range}`).toContain(`\`${range}\``)
    }
  })

  it('names the 0.x line, not a version that never shipped', () => {
    expect(STABILITY).toContain('## The 0.x line')
    expect(STABILITY).not.toMatch(/0\.1 line/)
  })
})

describe('contributor docs cite real CI jobs', () => {
  const jobIds = new Set([...read('.github/workflows/ci.yml').matchAll(/^ {2}([a-z-]+):$/gm)].map(m => m[1]!))
  const hooksTable = CONTRIBUTING.match(/\| Hook \| Runs \| Mirrors[\s\S]*?\n\n/)?.[0] ?? ''
  const cited = [...hooksTable.matchAll(/`([a-z-]+)`(?: \(| \|)/g)].map(m => m[1]!).filter(id => jobIds.has(id) || ['static', 'test'].includes(id))
  const inHooks = ['.githooks/pre-commit', '.githooks/pre-push'].flatMap(f => [...read(f).matchAll(/`([a-z-]+)` job/g)].map(m => m[1]!))

  it('reads the workflow', () => {
    expect(jobIds.has('static')).toBe(true)
    expect(jobIds.has('all-checks')).toBe(true)
    expect(inHooks.length).toBeGreaterThan(2)
  })

  it.each([...new Set([...cited, ...inHooks])])('`%s` is a job in ci.yml', (job) => {
    expect(jobIds.has(job), `CONTRIBUTING.md or a git hook cites a \`${job}\` job; ci.yml has ${[...jobIds].join(', ')}`).toBe(true)
  })

  it('the aggregate check is the name the ruleset requires', () => {
    expect(read('.github/workflows/ci.yml')).toContain('name: All checks passed')
    expect(read('.github/rulesets/main-pr-gate.json')).toContain('All checks passed')
  })
})

describe('README', () => {
  it('links the docs site absolutely and serves its hero from an absolute URL', () => {
    // npm renders the README: a root-relative docs link 404s there, a
    // relative image never loads.
    expect(README).not.toContain('](./website/content/')
    expect(README).not.toMatch(/\]\(\/[a-z]/)
    for (const src of README.matchAll(/(?:srcset|src)="([^"]+)"/g)) expect(src[1], 'npm does not rewrite relative image sources').toMatch(/^https:\/\//)
  })

  it('states the Nuxt and Node floors the module enforces', () => {
    const nuxtFloor = read('src/module.ts').match(/nuxt: '>=(\d+\.\d+)/)?.[1]
    const nodeFloor = manifest.engines.node.match(/>=(\d+\.\d+)/)?.[1]
    expect(nuxtFloor && nodeFloor).toBeTruthy()
    expect(README).toMatch(new RegExp(`Nuxt\\s*(>=|≥)\\s*${nuxtFloor!.replace('.', '\\.')}`))
    expect(README).toMatch(new RegExp(`Node\\s*(>=|≥)\\s*${nodeFloor!.replace('.', '\\.')}`))
  })
})

describe('nothing describes the repository as it no longer is', () => {
  const files = [...prose, at('CONTRIBUTING.md'), at('AGENTS.md'), at('RELEASE.md'), at('SECURITY.md'), at('commitlint.config.js'), ...walk('.github', ['.yml', '.yaml', '.md']), ...walk('scripts', ['.mjs', '.js']), ...walk('src', ['.ts'])]
  it.each([
    ['link:../nuxt-convex-module', 'the base module installs from npm'],
    ['simple-git-hooks', 'hooks live in .githooks/'],
    ['RELEASING.md', 'the release document is RELEASE.md'],
    ['public-hoist-pattern[]', 'pnpm 11 reads publicHoistPattern from pnpm-workspace.yaml'],
  ])('no file still says %s (%s)', (needle) => {
    const offenders = files.filter(file => read(file).includes(needle)).map(file => file.replace(`${process.cwd()}/`, ''))
    expect(offenders).toEqual([])
  })
})

describe('hand-written pages', () => {
  it('exist', () => {
    expect(handWritten.length).toBeGreaterThan(40)
  })
})
