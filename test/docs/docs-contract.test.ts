import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { at, contentFile, documentedKeys, interfaceKeys, read, walk } from './helpers'

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
  const reference = read(contentFile('/api-reference/module-options'))
  const configuration = read(contentFile('/getting-started/configuration'))

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
  const page = read(contentFile('/tooling/cli'))

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

  it('documents the agent files init writes, and how to skip them', () => {
    const init = page.slice(page.indexOf('## `init`'), page.indexOf('## `dev`'))
    expect(init).toContain('--no-agents')
    expect(init).toContain('AGENTS.md')
    expect(init).toContain('.mcp.json')
  })
})

describe('stability', () => {
  it('states the convex and vue peer ranges as declared', () => {
    for (const [pkg, range] of Object.entries(manifest.peerDependencies)) {
      if (pkg === 'convex-test') continue
      expect(STABILITY, `STABILITY.md does not state the ${pkg} peer range ${range}`).toContain(`\`${range}\``)
    }
  })

  it('lists every peer with its declared range under Supported versions', () => {
    const section = STABILITY.slice(STABILITY.indexOf('## Supported versions'))
    for (const [pkg, range] of Object.entries(manifest.peerDependencies)) {
      // A pipe inside a table cell is written `\|`.
      const cell = range.replaceAll('|', '\\|')
      expect(section, `STABILITY.md's Supported versions table lacks ${pkg} ${range}`).toContain(`| \`${pkg}\` | \`${cell}\` |`)
    }
  })

  it('states the Nuxt and Node floors under Supported versions', () => {
    const section = STABILITY.slice(STABILITY.indexOf('## Supported versions'))
    const nuxtRange = read('src/module.ts').match(/compatibility: \{ nuxt: '([^']+)' \}/)?.[1]
    expect(nuxtRange).toBeTruthy()
    expect(section).toContain(`Nuxt \`${nuxtRange}\``)
    expect(section).toContain(`Node \`${manifest.engines.node}\``)
  })

  it('offers the registry the Nuxt range the module declares', () => {
    const nuxtRange = read('src/module.ts').match(/compatibility: \{ nuxt: '([^']+)' \}/)?.[1]
    expect(read('.github/registry/backend.yml')).toContain(`nuxt: '${nuxtRange}'`)
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
    const nuxtFloor = read('src/module.ts').match(/nuxt: '(?:>=|\^)(\d+\.\d+)/)?.[1]
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
    ['examples/minimal', 'the starter app is templates/starter'],
    ['nuxi init -t', 'templates are created with `create nuxt`'],
    ['nuxi module add', 'the Nuxt CLI is `nuxt` now: `npx nuxt module add`'],
    ['nuxi init', 'apps are created with `create nuxt`'],
    ['nuxt-backend/component/convex.config', 'the component is `nuxt-backend/convex.config`, the name every Convex component uses'],
  ])('no file still says %s (%s)', (needle) => {
    const offenders = files.filter(file => read(file).includes(needle)).map(file => file.replace(`${process.cwd()}/`, ''))
    expect(offenders).toEqual([])
  })
})

describe('templates', () => {
  // Every `create nuxt` path the docs hand out is an app in this repository,
  // and so is the StackBlitz template the preview workflow publishes: a moved
  // or renamed template is otherwise a 404 at a user's first command.
  const buildOutput = (path: string) => /\/(?:node_modules|\.nuxt|\.output)(?:\/|$)/.test(path)
  const sources = [...prose, at('CONTRIBUTING.md'), ...walk('templates', ['.md'], buildOutput), ...walk('examples', ['.md'], buildOutput)]
  const paths = [...new Set(sources.flatMap(file => [...read(file).matchAll(/gh:qruto\/nuxt-backend\/([\w./-]*\w)/g)].map(m => m[1]!)))]

  it('reads the create commands', () => {
    expect(paths).toContain('templates/starter')
  })

  it.each(paths)('`gh:qruto/nuxt-backend/%s` is an app in the repository', (path) => {
    expect(existsSync(at(`${path}/package.json`)), `no app at ${path}`).toBe(true)
  })

  it('the pkg.pr.new StackBlitz template is an app in the repository', () => {
    const template = read('.github/workflows/preview.yml').match(/--template '\.\/([^']+)'/)?.[1]
    expect(template).toBeTruthy()
    expect(existsSync(at(`${template}/package.json`)), `preview.yml publishes ${template}`).toBe(true)
  })
})

describe('DevTools panel', () => {
  // The panel's tabs, read as text from its nav (this project imports
  // nothing from the app): the DevTools docs page describes each one, and
  // the homepage drawing of the panel lists the same ones.
  const labels = [...read('devtools-client-app/app/nav.ts').matchAll(/label: '([^']+)'/g)].map(m => m[1]!)
  const page = read(contentFile('/tooling/devtools'))

  it('reads the tabs', () => {
    expect(labels).toContain('Overview')
    expect(labels.length).toBeGreaterThan(4)
  })

  it.each(labels)('`%s` has a section on the DevTools page', (label) => {
    expect(page).toContain(`\n## ${label}\n`)
  })

  it('the homepage drawing lists the same tabs', () => {
    const tabs = read('website/components/home/DevX.vue').match(/const TABS = \[([\s\S]*?)\n\]/)?.[1] ?? ''
    expect([...tabs.matchAll(/label: '([^']+)'/g)].map(m => m[1])).toEqual(labels)
  })
})

describe('hand-written pages', () => {
  it('exist', () => {
    expect(handWritten.length).toBeGreaterThan(40)
  })
})

describe('the ecosystem page', () => {
  // Each table row names one package and where it stands. The manifest is the
  // truth for what ships: a component added without its row, or a row that
  // claims a package the manifest lacks, fails here.
  const page = read('website/content/1.getting-started/7.ecosystem.md')
  const STATUSES = ['Shipped', 'Bundled', 'Supported', 'Planned', 'Recipe', 'Not planned']
  const rows = [...page.matchAll(/^\| `((?:@[\w.-]+\/)?[\w.-]+)` \| ([^|]+?) \|/gm)].map(([, name, status]) => ({ name: name!, status: status!.trim() }))
  const statusOf = (name: string) => rows.find(row => row.name === name)?.status
  const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string>, peerDependencies: Record<string, string> }
  const declared = new Set([...Object.keys(pkg.dependencies), ...Object.keys(pkg.peerDependencies)])
  const moduleSource = read('src/module.ts')
  const moduleDependencies = [...moduleSource.slice(moduleSource.indexOf('moduleDependencies:'), moduleSource.indexOf('async setup('))
    .matchAll(/^ {6,}'((?:@[\w.-]+\/)?[\w.-]+)': \{/gm)].map(([, name]) => name!)

  it('reads the rows and the module dependencies', () => {
    expect(rows.length).toBeGreaterThan(30)
    expect(moduleDependencies).toEqual(expect.arrayContaining(['nuxt-convex-module', '@nuxtjs/mcp-toolkit']))
  })

  it('uses only the legend\'s statuses, one row per package', () => {
    for (const { name, status } of rows) expect(STATUSES, `${name}: ${status}`).toContain(status)
    expect(new Set(rows.map(row => row.name)).size).toBe(rows.length)
  })

  it('marks every component and module this package installs as shipped', () => {
    const installed = [...Object.keys(pkg.dependencies).filter(name => name.startsWith('@convex-dev/')), ...moduleDependencies]
    for (const name of installed) expect(statusOf(name), name).toBe('Shipped')
  })

  it('ships only what the manifest declares', () => {
    for (const { name } of rows.filter(row => row.status === 'Shipped')) {
      expect(declared.has(name) || moduleDependencies.includes(name), `${name} is marked shipped but not declared`).toBe(true)
    }
  })

  it('bundles only what arrives through a shipped package', () => {
    for (const { name } of rows.filter(row => row.status === 'Bundled')) {
      expect(declared.has(name), `${name} is declared, so it is shipped`).toBe(false)
      expect(existsSync(at(`node_modules/${name}/package.json`)), `${name} is not installed`).toBe(true)
    }
  })

  it('declares nothing it calls supported, planned, a recipe or left out', () => {
    for (const { name, status } of rows.filter(row => !['Shipped', 'Bundled'].includes(row.status))) {
      expect(declared.has(name), `${name} is ${status} but the manifest declares it`).toBe(false)
    }
  })
})
