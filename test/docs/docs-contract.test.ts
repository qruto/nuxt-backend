import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BACKEND_PAGE_DEFS } from '../../src/pages'
import { at, contentFile, documentedKeys, GENERATED_REFERENCE, interfaceKeys, read, walk } from './helpers'

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
const handWritten = walk('website/content', ['.md'], path => `${path}/`.includes(GENERATED_REFERENCE))
const prose = [at('README.md'), ...handWritten]

describe('module options', () => {
  const keys = interfaceKeys(at('src/module.ts'), 'ModuleOptions')
  const reference = read(contentFile('/docs/reference/configuration/module-options'))

  it('reads the interface', () => {
    expect(keys).toContain('devtools')
    expect(keys.length).toBeGreaterThanOrEqual(8)
  })

  it.each(keys)('`%s` is in the module options page (fields and interface) and STABILITY.md', (key) => {
    expect(documentedKeys(reference, 'interface ModuleOptions {'), `the module options interface block lacks ${key}`).toContain(key)
    expect(documentedKeys(reference, '## Options'), `the module options field group lacks ${key}`).toContain(key)
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
  const page = read(contentFile('/docs/reference/cli'))

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

/** The first code span of each line in every run of `- \`name\`` list items at one indent. */
function nameRuns(text: string, indent: string): string[][] {
  const runs: string[][] = [[]]
  for (const line of text.split('\n')) {
    const name = line.startsWith(`${indent}- \``) ? line.slice(indent.length + 3).split('`')[0]! : undefined
    if (name !== undefined) runs.at(-1)!.push(name)
    else if (runs.at(-1)!.length > 0) runs.push([])
  }
  return runs.filter(run => run.length > 1)
}

describe('shared lists hold one name per line, sorted', () => {
  // Most pull requests add a name to these lists. One per line, in order,
  // two additions land on different lines instead of in a merge conflict.
  const section = (heading: string) => README.slice(README.indexOf(heading), README.indexOf('\n### ', README.indexOf(heading) + 1))
  const runs = [
    ...nameRuns(STABILITY, '  ').map(run => ['STABILITY.md', run] as const),
    ...['### Composables', '### Components', '### Server (Nitro)'].flatMap(heading => nameRuns(section(heading), '').map(run => [`README.md ${heading}`, run] as const)),
  ]

  it('finds the lists', () => {
    expect(runs.length).toBeGreaterThanOrEqual(12)
  })

  it.each(runs.map(([file, run]) => [`${file}: ${run[0]} …`, run] as const))('%s', (_label, run) => {
    expect(run).toEqual([...run].sort())
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

describe('nothing names what 0.2 removed', () => {
  // The Upgrade page names each removal to say what to do instead, and the
  // changelog records it; nothing else may still offer it.
  const record = [contentFile('/docs/ship/migrate/upgrade'), contentFile('/docs/ship/releases/changelog')]
  const files = [...prose, at('AGENTS.md'), at('CONTRIBUTING.md'), at('STABILITY.md'), ...walk('src', ['.ts', '.vue']), ...walk('skills', ['.md'])]
    .filter(file => !record.some(page => file.endsWith(page)))
  it.each([
    ['installation: \'local\'', 'the local installation'],
    ['--installation', 'the local installation'],
    ['nuxt-backend/component/', 'the component\'s schema and function modules as subpaths'],
    ['templates:generate', 'the generated re-export lists of the local installation'],
    ['mcp: false', 'the agent surface is always on'],
    ['workspaces: false', 'workspaces are always on'],
    ['organization: false', 'workspaces are always on'],
    ['admin: false', 'roles are always on'],
    ['personal: false', 'every user gets a personal workspace'],
    ['tools.builtin', 'every built-in tool ships, gated by its scope'],
    ['builtinToolEnabled', 'every built-in tool ships, gated by its scope'],
    ['pages: false', 'every module page mounts'],
    ['backend.loginPath', 'the auth middleware follows pages.login'],
    ['css: false', 'the stylesheet always loads, layered'],
    ['nuxt-backend/ui.css', 'the module adds the stylesheet'],
    ['nuxt-backend/auth.css', 'the module adds the stylesheet'],
    ['deliveryLog', 'every webhook delivery is logged'],
    ['benefitMetadataTtlMs', 'the benefit metadata TTL is fixed'],
    ['offerPasskey', 'the passkey step is always offered'],
    ['welcomeEmail', 'the packaged welcome always sends'],
    ['createAuthOptions', 'setupAuth is the one auth factory'],
    ['createBetterAuth', 'setupAuth is the one auth factory'],
    ['makeAuthApi', 'setupAuth is the one auth factory'],
    ['CreateBetterAuthOptions', 'SetupAuthOptions holds every option'],
    ['defaultEmailTemplates', 'an override receives its default'],
    ['integrations: {', 'setupAuth takes its integrations at the top level'],
    ['integrations.email', 'setupAuth takes its integrations at the top level'],
    ['sendVerificationEmail', 'every address is verified by code'],
    ['email-change-requested', 'an email change is by code: email-changed'],
    ['verification-sent', 'every address is verified by code'],
    ['`emailTemplates`', 'the templates live on setupEmail'],
    ['emailTemplates:', 'the templates live on setupEmail'],
    ['giftEmail', 'the gift email is the gift template on setupEmail'],
    ['AuthEmailSender', 'setupAuth sends through the setupEmail instance'],
    ['AuthEmailTemplates', 'the templates live on setupEmail'],
    ['gift_email_unsent', 'the gift email goes through the email instance'],
  ])('no file still offers %s (%s)', (needle) => {
    const offenders = files.filter(file => read(file).includes(needle)).map(file => file.replace(`${process.cwd()}/`, ''))
    expect(offenders).toEqual([])
  })

  // A page key takes a path; 0.1 also took `true` and `false`. A needle per
  // spelling missed `profile: false` inside a `pages: { … }` sample, so every
  // `pages: {` block is read as code, braces balanced, for a page key set to
  // a boolean, and prose for a `pages.<key>:` one.
  const pageKeys = new Set<string>(BACKEND_PAGE_DEFS.map(def => def.key))
  function booleanPageValues(text: string): string[] {
    const found = [...text.matchAll(/\bpages\.(?:<\w+>|\w+)\s*:\s*(?:true|false)\b/g)].map(([entry]) => entry)
    for (const match of text.matchAll(/\bpages\s*:\s*\{/g)) {
      const open = match.index + match[0].length - 1
      let close = open
      for (let depth = 0; close < text.length; close++) {
        if (text[close] === '{') depth++
        else if (text[close] === '}' && --depth === 0) break
      }
      const entries = [...text.slice(open, close).matchAll(/\b(\w+)\s*:\s*(?:true|false)\b/g)]
      found.push(...entries.filter(([, key]) => pageKeys.has(key!)).map(([entry]) => entry))
    }
    return found
  }

  it('reads a boolean page value wherever docs could show one', () => {
    expect(booleanPageValues('```ts\nbackend: {\n  pages: {\n    pricing: \'/plans\',\n    profile: false,      // bring your own\n  },\n}\n```')).toEqual(['profile: false'])
    expect(booleanPageValues('A page disabled with `pages.<key>: false` gets no rule; `pages.login: true` mounts it.')).toEqual(['pages.<key>: false', 'pages.login: true'])
    expect(booleanPageValues('pages: { acceptInvitation: true, agentConsent: \'/consent\' }')).toEqual(['acceptInvitation: true'])
    expect(booleanPageValues('pages: { pricing: \'/plans\' }, devtools: { enabled: true }, autoClaim: false')).toEqual([])
  })

  it('no file shows a page turned on or off with a boolean (every page mounts)', () => {
    const offenders = files.flatMap(file => booleanPageValues(read(file)).map(entry => `${file.replace(`${process.cwd()}/`, '')}: ${entry}`))
    expect(offenders).toEqual([])
  })
})

describe('the docs links the module prints', () => {
  // An error or a warning links its docs section by URL: each one lands on a
  // page that exists, at a heading it has.
  const anchors = (markdown: string) => [...markdown.matchAll(/^#{1,6} (.+)$/gm)].map(([, text]) => text!
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^(\d)/, '_$1'))
  const links = [...new Set(walk('src', ['.ts', '.vue']).flatMap(file => [...read(file).matchAll(/https:\/\/nuxt-backend\.dev(\/docs\/[\w/-]*\w(?:#[\w-]+)?)/g)].map(([, target]) => target!)))]

  it('finds them', () => {
    expect(links).toEqual(expect.arrayContaining([
      '/docs/ship/migrate/upgrade#pages-the-stylesheet-and-the-webhook-log-are-always-on',
      '/docs/ui/pages#caches',
    ]))
  })

  it.each(links)('%s', (target) => {
    const [route, anchor] = target.split('#') as [string, string | undefined]
    const page = read(contentFile(route))
    if (anchor) expect(anchors(page), `${route} has no heading #${anchor}`).toContain(anchor)
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
  const page = read(contentFile('/docs/start/develop/devtools'))

  it('reads the tabs', () => {
    expect(labels).toContain('Overview')
    expect(labels.length).toBeGreaterThan(4)
  })

  it.each(labels)('`%s` has a section on the DevTools page', (label) => {
    expect(page).toContain(`\n## ${label}\n`)
  })

  it('lists them in the order of the panel', () => {
    expect(labels.map(label => page.indexOf(`\n## ${label}\n`))).toEqual(labels.map(label => page.indexOf(`\n## ${label}\n`)).sort((a, b) => a - b))
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
  const page = read(contentFile('/docs/reference/ecosystem'))
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
