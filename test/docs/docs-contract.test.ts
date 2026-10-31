import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_RETRY_BEHAVIOR } from '@convex-dev/workpool'
import { BACKEND_PAGE_DEFS } from '../../src/pages'
import { isSeatLikeQuota, SEAT_WORDS } from '../../src/convex/catalog'
import { DEFAULT_LIMITS } from '../../src/convex/integrations/rate-limit'
import { DEFAULT_HEALTH_PATH, HEALTH_ROUTE, IMPERSONATION_SESSION_SECONDS } from '../../src/convex/constants'
import { REQUIRED_FUNCTION_EXPORTS } from '../../src/contract'
import { BACKEND_FILE_TEMPLATES } from '../../src/templates'
import { LABELS } from '../../src/convex/labels'
import { SENSITIVE_ACTIONS } from '../../src/convex/sensitive-actions'
import { ADMIN_TABS } from '../../src/runtime/vue/components/admin/admin-tabs'
import { BACKEND_FLAG_KEYS, FLAG_TARGETS_MAX, PAUSE_FLAGS, ROLLOUT_BUCKETS } from '../../src/convex/flags'
import { MAINTENANCE_INTERVAL_MS, MAINTENANCE_JOB } from '../../src/convex/components/backend/maintenance'
import { ALERT_TAG, MONITORING_TAGS, monitorSlug, REPORT_TIMEOUT_MS } from '../../src/convex/monitoring'
import { AI_SPEND_BASELINE_DAYS, AI_SPEND_FACTOR, AI_SPEND_FLOOR_USD, ALERTS_JOB, EMAIL_QUOTA_THRESHOLDS } from '../../src/convex/components/backend/alerts'
import { AI_COST_RETENTION_MS } from '../../src/convex/components/backend/costs'
import { LOG_LEVELS, REPLAY, tracesSampleRate } from '../../src/runtime/monitoring/sdk/preset'
import { LOCAL_LOG_LIMIT } from '../../src/runtime/monitoring/report'
import { PACKAGE_MIGRATIONS } from '../../src/convex/package-migrations'
import { EMAIL_LIMITS, RATE_VOLUME } from '../../src/cli/posture'
import { HSTS_MIN_AGE } from '../../src/cli/probes'
import { FINDING_DOCS } from '../../scripts/docs-lookups/index.mjs'
import { repositoryFiles } from '../helpers/repository-files'
import { aheadOfCode, at, contentFile, documentedKeys, GENERATED_REFERENCE, interfaceKeys, read, walk } from './helpers'

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

/** The anchors a page's headings get, the way the site writes them. */
const anchors = (markdown: string) => [...markdown.matchAll(/^#{1,6} (.+)$/gm)].map(([, text]) => text!
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .toLowerCase()
  .replace(/[^\w\s-]/g, '')
  .trim()
  .replace(/\s+/g, '-')
  .replace(/^(\d)/, '_$1'))

/** Why a docs route with an optional `#anchor` lands nowhere: the page or the heading it misses; `undefined` when it lands. */
function pageMisses(target: string): string | undefined {
  const [route, anchor] = target.split('#') as [string, string | undefined]
  let page: string
  try {
    page = read(contentFile(route))
  }
  catch {
    return `${target}: no page`
  }
  return anchor && !anchors(page).includes(anchor) ? `${target}: no heading #${anchor}` : undefined
}

/** Every file git would commit: what a link to a file on main may name. */
const committed = repositoryFiles()

/** Every text file git would commit but the vendored agent skills, the tests and the generated changelog. */
function linkingFiles(): string[] {
  return committed.filter(file => /\.(?:json|md|mjs|ts|vue|ya?ml)$/.test(file)
    && !/^(?:\.agents|\.claude|test)\//.test(file)
    && !/(?:^|\/)CHANGELOG\.md$/.test(file))
}

/** Whether a file on main, or a folder (`tree/main/…`), is one git would commit: never build output or an ignored file. */
const onMain = (path: string): boolean => {
  const target = path.replace(/\/$/, '')
  return committed.includes(target) || committed.some(file => file.startsWith(`${target}/`))
}

describe('module options', () => {
  const keys = interfaceKeys(at('src/module.ts'), 'ModuleOptions')
  const reference = read(contentFile('/docs/reference/configuration/module-options'))

  it('reads the interface', () => {
    expect(keys).toContain('devtools')
    expect(keys.length).toBeGreaterThanOrEqual(5)
  })

  it.each(keys)('`%s` is in the module options page (fields and interface) and STABILITY.md', (key) => {
    expect(documentedKeys(reference, 'interface ModuleOptions {'), `the module options interface block lacks ${key}`).toContain(key)
    expect(documentedKeys(reference, '## Options'), `the module options field group lacks ${key}`).toContain(key)
    expect(STABILITY, `STABILITY.md's configuration surface lacks \`${key}\``).toContain(`\`${key}\``)
  })
})

/** The skills users' agents load, their generated references included: they ship with the package. */
const skillDocs = walk('skills', ['.md'])

/** The text between the bracket at `open` and the one that closes it. */
function balanced(text: string, open: number): string {
  let depth = 0
  for (let index = open; index < text.length; index++) {
    if ('{[('.includes(text[index]!)) depth++
    else if ('}])'.includes(text[index]!) && --depth === 0) return text.slice(open + 1, index)
  }
  return text.slice(open + 1)
}

/** An object literal's entries at its own level, each trimmed: `a: 1, b: { c }` → `['a: 1', 'b: { c }']`. */
function entries(body: string): string[] {
  const items: string[] = []
  let depth = 0
  let item = ''
  for (const character of body) {
    if ('{[('.includes(character)) depth++
    else if ('}])'.includes(character)) depth--
    if (depth === 0 && character === ',') {
      items.push(item.trim())
      item = ''
    }
    else item += character
  }
  return [...items, item.trim()].filter(Boolean)
}

/** The keys of every `auth` rules object a `definePageMeta({ … })` in a text writes, shorthand included. */
function pageRuleKeys(text: string): string[] {
  return [...text.matchAll(/definePageMeta\(\s*\{/g)].flatMap((call) => {
    const auth = entries(balanced(text, call.index + call[0].length - 1)).find(entry => /^auth\s*:\s*\{/.test(entry))
    if (!auth) return []
    return entries(balanced(auth, auth.indexOf('{'))).flatMap(entry => entry.match(/^(\w+)/)?.[1] ?? [])
  })
}

describe('route middleware', () => {
  // The package names no route middleware: `definePageMeta({ auth })` is the
  // one page guard, and the base module's `convex-auth` is hidden, so a page
  // naming either fails to resolve its middleware. The two show only in
  // rename rows, each to `auth: true`. The skills ship to users' agents, so
  // they are read too.
  it.each([...prose, ...skillDocs])('%s names no package middleware, outside a rename row', (file) => {
    for (const line of read(file).split('\n')) {
      for (const [, name] of line.matchAll(/middleware:\s*'([^']+)'/g)) {
        if (line.includes('auth: true')) continue
        expect(name, `${file} uses middleware '${name}': ${line.trim()}`).not.toMatch(/^(?:auth|convex-auth)$/)
      }
    }
  })
})

describe('page guard', () => {
  // A page ahead of the code (`status: planned` or `changing`,
  // website/shared/planned.ts) shows the rules as its unit leaves them, so it
  // may write a rule the guard reads only once that unit lands, and Protect
  // pages, when it is ahead, keeps a row for each rule and reason that stays.
  const source = at('src/runtime/vue/utils/access-rules.ts')
  const rules = interfaceKeys(source, 'PageAccessRules')
  const reasons = [...(read(source).match(/ACCESS_DENIED_REASONS\b[^=]*=\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/'(\w+)'/g)].map(([, reason]) => reason!)
  const file = contentFile('/docs/build/auth/access/pages')
  const page = read(file)
  /** The first cells of a page's table rows: `| \`role\` | … |` → `role`. */
  const rowKeys = [...page.matchAll(/^\| `([^`]+)` \|/gm)].map(([, key]) => key!)
  const described = (names: string[]) => aheadOfCode(file) ? names.filter(name => rowKeys.includes(name)) : names

  it('reads the rules and the reasons', () => {
    expect(rules).toEqual(expect.arrayContaining(['role', 'workspace', 'feature', 'hidden']))
    expect(reasons).toEqual(expect.arrayContaining(['role', 'workspace', 'feature', 'banned']))
    expect(described(rules)).toContain('role')
  })

  it.each(described(rules))('the rule `%s` has a row on Protect pages', (rule) => {
    expect(rowKeys).toContain(rule)
  })

  it.each(described(reasons))('the 403\'s reason `%s` has a row on Protect pages', (reason) => {
    expect(rowKeys).toContain(reason)
  })

  it.each([...prose, ...skillDocs].filter(file => !aheadOfCode(file)))('%s writes only rules the guard reads in `definePageMeta({ auth })`', (file) => {
    for (const key of pageRuleKeys(read(file))) {
      expect(rules, `${file} writes the page rule \`${key}\``).toContain(key)
    }
  })

  it('reads the keys of a page\'s rules, nested values and shorthand included', () => {
    expect(pageRuleKeys('definePageMeta({ layout: \'x\', auth: { role: [\'a\', \'b\'], permission: { user: [\'ban\'] } } })')).toEqual(['role', 'permission'])
    expect(pageRuleKeys('`definePageMeta({ auth: { role, workspaceRole } })` and `auth: { title }`')).toEqual(['role', 'workspaceRole'])
    expect(pageRuleKeys('definePageMeta({ middleware: \'auth\' })')).toEqual([])
  })
})

describe('the billing section of /settings', () => {
  // The Manage subscriptions page lists the panel's states, the provider's
  // cancellation reasons and the neutral benefit kinds by hand: each list is
  // held to the code it describes, in order where the order means something.
  const page = read('website/content/docs/04.build/2.billing/5.subscriptions/index.md')
  const start = page.indexOf('## The billing section of /settings')
  const section = page.slice(start, page.indexOf('\n## ', start))
  /** The members of a string-literal union, read off its declaration. */
  const unionMembers = (file: string, name: string): string[] => {
    const source = read(file)
    const start = source.indexOf(`export type ${name}`)
    expect(start, `${file} declares ${name}`).toBeGreaterThan(-1)
    return [...source.slice(start, source.indexOf('\n\n', start)).matchAll(/'([^']+)'/g)].map(match => match[1]!)
  }

  it('lists the plan states in the order the section tries them', () => {
    const order = read('src/runtime/vue/components/workspaces/workspace-billing.ts').match(/export const PLAN_STATES = \[([^\]]+)\] as const/)?.[1]
    expect(order).toBeTruthy()
    const states = [...order!.matchAll(/'([a-z_]+)'/g)].map(match => match[1]!)
    const rows = [...section.matchAll(/^\| [^|]*\(`([a-z_]+)`\) \|/gm)].map(match => match[1]!)
    expect(rows).toEqual(states)
  })

  it('names every cancellation reason the provider takes', () => {
    const listed = section.match(/cancellation's reason \(([^)]+)\)/)?.[1] ?? ''
    expect([...listed.matchAll(/`([a-z_]+)`/g)].map(match => match[1]!).sort())
      .toEqual(unionMembers('src/runtime/vue/composables/use-billing.ts', 'CancellationReason').sort())
  })

  it('lists every benefit kind, and only those', () => {
    const table = section.slice(section.indexOf('### What the plan includes'))
    // The rows under the header, whose first cell names the `kind` column.
    const kinds = [...table.slice(table.indexOf('|---')).matchAll(/^\| `([a-z_]+)` \|/gm)].map(match => match[1]!)
    expect(kinds).toEqual(unionMembers('src/runtime/vue/composables/use-billing.ts', 'BenefitKind'))
    // The component's record type says the same.
    expect(unionMembers('src/convex/integrations/billing/types/records.ts', 'BenefitKind')).toEqual(kinds)
  })
})

describe('plan quotas never count people', () => {
  // Every page that says which quotas the sync refuses lists the words the
  // check refuses, all of them, in the order the code keeps them.
  const listed = `quota on ${SEAT_WORDS.slice(0, -1).join(', ')} or ${SEAT_WORDS.at(-1)}`

  it.each([
    'website/content/docs/04.build/2.billing/5.subscriptions/3.quotas.md',
    'website/content/docs/04.build/2.billing/3.catalog.md',
    'skills/nuxt-backend-billing/SKILL.md',
    'SECURITY.md',
  ])('%s lists the people the check refuses', (file) => {
    expect(read(file).replace(/\s+/g, ' ')).toContain(listed)
  })

  it('refuses every word listed', () => {
    for (const word of SEAT_WORDS) expect(isSeatLikeQuota(word), word).toBe(true)
  })
})

describe('the errors reference', () => {
  // A 429 from a package limit names it in `limit`; the reference lists the
  // names a refusal can carry. The agent endpoint's `mcp` limit answers in
  // its own OAuth-style body, which names none.
  it('names every default limit a rate_limited refusal can carry', () => {
    const page = read('website/content/docs/10.reference/08.backend/5.errors.md')
    const list = page.slice(page.indexOf('A `rate_limited` from a package limit')).split('\n\n')[0]!
    for (const name of Object.keys(DEFAULT_LIMITS).filter(name => name !== 'mcp')) expect(list, name).toContain(`\`${name}\``)
  })
})

describe('CLI', () => {
  const commands = [...read('src/cli/main.ts').matchAll(/subCommands: \{([^}]+)\}/g)].flatMap(m => m[1]!.split(',').map(s => s.trim().split(':')[0]!.trim()).filter(Boolean))
  const page = read(contentFile('/docs/reference/cli'))

  it('reads the commands', () => {
    expect(commands).toEqual(expect.arrayContaining(['init', 'doctor', 'env', 'billing']))
  })

  it.each(commands.filter(c => !['env', 'billing', 'email', 'push', 'rotate'].includes(c)))('`%s` has a section on the CLI page', (command) => {
    expect(page).toContain(`## \`${command}\``)
  })

  it('documents the nested commands', () => {
    expect(page).toContain('## `env push`')
    expect(page).toContain('## `env rotate`')
    expect(page).toContain('## `billing sync`')
  })

  it('has no section for a simulator: `simulate` is not a command', () => {
    expect(commands).not.toContain('simulate')
    expect(page).not.toMatch(/^## `simulate/m)
  })

  it('documents the agent files init writes, and how to skip them', () => {
    const init = page.slice(page.indexOf('## `init`'), page.indexOf('## `dev`'))
    expect(init).toContain('--no-agents')
    expect(init).toContain('AGENTS.md')
    expect(init).toContain('.mcp.json')
  })
})

describe('doctor --prod\'s thresholds', () => {
  /** A rate as the docs write it: `4%`, `0.08%`. */
  const percent = (rate: number) => `${Number((rate * 100).toPrecision(6))}%`
  const bounce = percent(EMAIL_LIMITS.bounce)
  const complaint = percent(EMAIL_LIMITS.complaint)

  it('states the provider\'s bounce and complaint limits as the check applies them', () => {
    const pages = ['website/content/docs/04.build/3.email/3.delivery/1.deliverability.md', 'website/content/docs/05.ship/2.checklist.md']
    for (const text of [...pages.map(read), FINDING_DOCS['email-reputation']!.checks]) {
      expect(text).toContain(bounce)
      expect(text).toContain(complaint)
    }
  })

  it('states the volume below which a rate above its limit only warns', () => {
    expect(read('website/content/docs/05.ship/2.checklist.md')).toContain(`on ${RATE_VOLUME} sends or more`)
    expect(FINDING_DOCS['email-reputation']!.checks).toContain(`once ${RATE_VOLUME} or more were sent`)
    expect(FINDING_DOCS['email-reputation']!.prodFails).toContain(`${RATE_VOLUME} sends or more`)
  })

  it('states the least HSTS lifetime as a day', () => {
    expect(HSTS_MIN_AGE).toBe(24 * 60 * 60)
    expect(FINDING_DOCS['site-https']!.checks).toContain('for a day or more')
  })
})

describe('nuxt-backend upgrade', () => {
  const cli = read(contentFile('/docs/reference/cli'))
  const section = cli.slice(cli.indexOf('## `upgrade`'), cli.indexOf('\n## ', cli.indexOf('## `upgrade`') + 1))

  it('names every state of the data step, and only those', () => {
    const source = read('src/cli/upgrade/data.ts')
    const union = source.slice(source.indexOf('export type DataState'), source.indexOf('\n', source.indexOf('export type DataState')))
    const states = [...union.matchAll(/'([a-z-]+)'/g)].map(match => match[1]!)
    expect(states.length).toBeGreaterThan(5)
    const rows = [...section.matchAll(/^\| `([a-z-]+)` \| /gm)].map(match => match[1]!).filter(state => !state.startsWith('-'))
    expect(rows).toEqual(states)
  })

  it('lists every package migration, with its release, where the migrations page lists them', () => {
    const page = read(contentFile('/docs/build/data/jobs/migrations'))
    const table = page.slice(page.indexOf('## The package\'s own migrations'))
    const rows = [...table.matchAll(/^\| `(\w+)` \| ([\d.]+) \|/gm)].map(([, name, since]) => ({ name, since }))
    expect(rows).toEqual(PACKAGE_MIGRATIONS.map(({ name, since }) => ({ name, since })))
  })

  it('is what the Upgrade page starts with', () => {
    const upgrade = read(contentFile('/docs/ship/releases/upgrade'))
    expect(upgrade.slice(0, upgrade.indexOf('\n## '))).toContain('npx nuxt-backend upgrade --dry-run')
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
  // changelog records it; nothing else may still offer it. The rename map
  // records them for agents (src/guidance/renames.ts, and upgrade.md and the
  // wrong-name list of the skill, generated from it), each held to the
  // Upgrade page by test/docs/agent-guidance.test.ts.
  const record = [contentFile('/docs/ship/releases/upgrade'), contentFile('/docs/ship/releases/changelog'), 'src/guidance/renames.ts', 'skills/nuxt-backend-upgrade/references/upgrade.md']
  const offered = (file: string) => read(file).replace(/<!-- generated:wrong-names -->[\s\S]*?<!-- \/generated:wrong-names -->/, '')
  // The playground's app code too: it is what a reader copies from.
  const built = (path: string) => /\/(?:node_modules|\.nuxt|\.output|\.data|_generated)(?:\/|$)/.test(path)
  const playground = [...walk('website/pages', ['.vue', '.ts'], built), ...walk('website/components', ['.vue', '.ts'], built), ...walk('website/layouts', ['.vue'], built), ...walk('website/backend', ['.ts'], built), ...walk('templates/panels', ['.vue', '.ts'], built)]
  const files = [...prose, at('AGENTS.md'), at('CONTRIBUTING.md'), at('STABILITY.md'), ...walk('src', ['.ts', '.vue']), ...walk('skills', ['.md']), ...playground]
    .filter(file => !record.some(page => file.endsWith(page)))
  // Where a removed name is someone else's to keep, needle by needle: a
  // directory that speaks a provider's own names, never the package's.
  const owners: Record<string, string[]> = {}
  // UIKIT brings `css: false` and `pages.<key>: false` back: a page that
  // documents the 0.2.0 UI ahead of the code (`plannedBy` or `changedBy:
  // UIKIT`) may show them. Drop this once UIKIT lands and the rows go.
  const returning = new Set(['css: false'])
  const byUikit = (file: string) => /^(?:plannedBy|changedBy): UIKIT$/m.test(read(file).split(/\n---\n/)[0]!)
  const exempt = (file: string, needle: string) => (owners[needle] ?? []).some(dir => file.includes(dir)) || (returning.has(needle) && byUikit(file))
  /** A needle as a whole word where it starts or ends in one: `useCount` is not `useCountdown`. */
  const offers = (text: string, needle: string) => new RegExp(`${/^\w/.test(needle) ? '\\b' : ''}${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${/\w$/.test(needle) ? '\\b' : ''}`).test(text)

  it('matches a needle as a whole word', () => {
    expect(offers('const n = useCount(q)', 'useCount')).toBe(true)
    expect(offers('const { count } = useCountdown(10)', 'useCount')).toBe(false)
    expect(offers('if (delivery.isError.value) …', 'isError.value')).toBe(true)
    expect(offers('pages: false', 'pages: false')).toBe(true)
  })

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
    ['useCount', 'useAggregate is the one aggregate composable'],
    ['isError.value', 'useEmailStatus says isFailed'],
    ['isClaiming', 'useGifts says isPending'],
    ['pendingUpdate.value', 'useBilling says pendingChange'],
    ['pausedAt', 'useBilling reads isPaused and resumesAt'],
    ['useCredits(\'', 'useCredits takes { meter }'],
    ['UseBackendAuthService', 'useAuth returns UseAuthReturn'],
    ['flow.pending', 'useLoginFlow says isPending'],
    ['emailChange.pending', 'useEmailChange says isPending'],
    ['api.email.send', 'the scaffolded send is internal: internal.email.send, or sendAsAdmin from the browser'],
  ])('no file still offers %s (%s)', (needle) => {
    const offenders = files.filter(file => !exempt(file, needle) && offers(offered(file), needle)).map(file => file.replace(`${process.cwd()}/`, ''))
    expect(offenders).toEqual([])
  })

  // A page key takes a path, or `false` to turn the page off (UIKIT, docs v3);
  // 0.1 also took `true`. A needle per spelling missed `profile: true` inside
  // a `pages: { … }` sample, so every `pages: {` block is read as code, braces
  // balanced, for a page key set to `true`, and prose for a `pages.<key>:` one.
  const pageKeys = new Set<string>(BACKEND_PAGE_DEFS.map(def => def.key))
  function booleanPageValues(text: string): string[] {
    const found = [...text.matchAll(/\bpages\.(?:<\w+>|\w+)\s*:\s*true\b/g)].map(([entry]) => entry)
    for (const match of text.matchAll(/\bpages\s*:\s*\{/g)) {
      const open = match.index + match[0].length - 1
      let close = open
      for (let depth = 0; close < text.length; close++) {
        if (text[close] === '{') depth++
        else if (text[close] === '}' && --depth === 0) break
      }
      const entries = [...text.slice(open, close).matchAll(/\b(\w+)\s*:\s*true\b/g)]
      found.push(...entries.filter(([, key]) => pageKeys.has(key!)).map(([entry]) => entry))
    }
    return found
  }

  it('reads a page turned on with `true` wherever docs could show one', () => {
    expect(booleanPageValues('```ts\nbackend: {\n  pages: {\n    pricing: \'/plans\',\n    profile: true,       // on\n    gifts: false,        // off: allowed\n  },\n}\n```')).toEqual(['profile: true'])
    expect(booleanPageValues('A page enabled with `pages.<key>: true`, or `pages.login: true`; `pages.gifts: false` turns one off.')).toEqual(['pages.<key>: true', 'pages.login: true'])
    expect(booleanPageValues('pages: { acceptInvitation: true, agentConsent: \'/consent\' }')).toEqual(['acceptInvitation: true'])
    expect(booleanPageValues('pages: { pricing: \'/plans\' }, devtools: { enabled: true }, autoClaim: false')).toEqual([])
  })

  it('no file shows a page turned on with `true` (every page mounts unless turned off)', () => {
    const offenders = files.flatMap(file => booleanPageValues(read(file)).map(entry => `${file.replace(`${process.cwd()}/`, '')}: ${entry}`))
    expect(offenders).toEqual([])
  })
})

describe('composable actions are never unwrapped again', () => {
  // useAuth, useWorkspace and usePasskeys resolve with their data and
  // reject on failure. `unwrapAuth(await …)` stays only for a raw client call
  // (`client.…`), whose `{ data, error }` answer still needs it: around a
  // composable's action it reads a field of the data as if it were the
  // answer, and quietly gets `undefined`.
  const built = (path: string) => /\/(?:node_modules|\.nuxt|\.output|\.data|_generated)(?:\/|$)/.test(path)
  const files = [
    ...prose,
    ...walk('src', ['.ts', '.vue']),
    ...walk('skills', ['.md']),
    ...['website/pages', 'website/components', 'website/layouts', 'website/utils', 'examples', 'templates']
      .flatMap(dir => walk(dir, ['.vue', '.ts', '.md'], built)),
  ]
  /** What each `unwrapAuth(await X)` awaits, where X is not a raw client call. */
  const unwrappedActions = (text: string) => [...text.matchAll(/\bunwrapAuth\s*(?:<(?:[^<>]|<[^<>]*>)*>)?\(\s*await\s+([^\n]{0,60})/g)]
    .map(([, awaited]) => awaited!.trim())
    .filter(awaited => !/^\(?\s*(?:client|authClient|auth\.client|useAuth\(\)\.client)\b/.test(awaited))

  it('reads what an unwrap awaits', () => {
    expect(unwrappedActions('unwrapAuth(await auth.deleteAccount())')).toEqual(['auth.deleteAccount())'])
    expect(unwrappedActions('const w = unwrapAuth<Workspace>(await workspace.create({ name }))')).toEqual(['workspace.create({ name }))'])
    expect(unwrappedActions('unwrapAuth<{ users: Row[] }>(await (client as never).admin.listUsers())')).toEqual([])
    expect(unwrappedActions('unwrapAuth(await client.signOut())')).toEqual([])
  })

  it('no file unwraps a composable\'s action', () => {
    const offenders = files.flatMap(file => unwrappedActions(read(file)).map(awaited => `${file.replace(`${process.cwd()}/`, '')}: unwrapAuth(await ${awaited}`))
    expect(offenders).toEqual([])
  })
})

describe('the docs links the module prints', () => {
  // An error or a warning links its docs section by URL: each one lands on a
  // page that exists, at a heading it has.
  const links = [...new Set(walk('src', ['.ts', '.vue']).flatMap(file => [...read(file).matchAll(/https:\/\/nuxt-backend\.dev(\/docs\/[\w/-]*\w(?:#[\w-]+)?)/g)].map(([, target]) => target!)))]

  it('finds them', () => {
    expect(links).toEqual(expect.arrayContaining([
      '/docs/ship/releases/upgrade#page-paths-the-stylesheet-and-the-webhook-log',
      '/docs/build/ui/pages#caches',
    ]))
  })

  it.each(links)('%s', (target) => {
    expect(pageMisses(target)).toBeUndefined()
  })
})

describe('the links to this repository and to the docs site', () => {
  // The weekly link check leaves both to this test (lychee.toml): each names
  // this very checkout, a file on main or a page under website/content, so
  // the checkout answers for it the day it is written, where the live site
  // would only answer once it deploys, and github.com with 503s when asked
  // for all of them at once (issue #96).
  const linked = linkingFiles().map(file => [file, read(file)] as const)
  const pages = [...new Set(linked.flatMap(([, text]) => [...text.matchAll(/https:\/\/nuxt-backend\.dev(?:\/raw)?(\/docs\/[\w/-]*\w)(?:\.md)?(#[\w-]+)?/g)].map(([, route, anchor]) => `${route}${anchor ?? ''}`)))]
  const files = [...new Set(linked.flatMap(([, text]) => [...text.matchAll(/https:\/\/github\.com\/qruto\/nuxt-backend\/(?:blob|tree)\/main\/([\w./@-]*[\w/])/g)].map(([, path]) => path!)))]

  it('finds them in the prose, the policy files and the generated reference', () => {
    expect(pages).toEqual(expect.arrayContaining(['/docs/build/ui/accessibility', '/docs/reference/components#the-component-contract']))
    expect(files).toEqual(expect.arrayContaining(['STABILITY.md', 'templates/starter']))
    expect(files.some(file => file.startsWith('src/')), 'the API reference links its sources').toBe(true)
  })

  it('every docs-site link lands on a page of website/content, at a heading it has', () => {
    expect(pages.flatMap(target => pageMisses(target) ?? [])).toEqual([])
  })

  it('every link to a file on main names one this checkout would commit', () => {
    expect(files.filter(path => !onMain(path))).toEqual([])
  })

  it('reads build output and ignored files as not on main', () => {
    expect(onMain('src/module.ts')).toBe(true)
    expect(onMain('templates/starter')).toBe(true)
    expect(onMain('dist/module.mjs')).toBe(false)
    expect(onMain('node_modules')).toBe(false)
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
  // the homepage drawing of the panel lists the same ones. A page ahead of
  // the code (`status: changing`, website/shared/planned.ts) describes the
  // panel its unit leaves, so it has a section for each tab that stays.
  const labels = [...read('devtools-client-app/app/nav.ts').matchAll(/label: '([^']+)'/g)].map(m => m[1]!)
  const file = contentFile('/docs/develop/devtools')
  const page = read(file)
  const described = aheadOfCode(file) ? labels.filter(label => page.includes(`\n## ${label}\n`)) : labels

  it('reads the tabs', () => {
    expect(labels).toContain('Overview')
    expect(labels.length).toBeGreaterThan(4)
    expect(described.length).toBeGreaterThan(4)
  })

  it.each(described)('`%s` has a section on the DevTools page', (label) => {
    expect(page).toContain(`\n## ${label}\n`)
  })

  it('lists them in the order of the panel', () => {
    expect(described.map(label => page.indexOf(`\n## ${label}\n`))).toEqual(described.map(label => page.indexOf(`\n## ${label}\n`)).sort((a, b) => a - b))
  })
})

describe('the Upgrade page\'s copy of the email sequence loop', () => {
  // The workflow component replays a run step by step against the code, by
  // each step's kind, name and arguments. The copy that keeps preview-era
  // runs going must take the steps defineEmailSequence takes, under the same
  // names, or those runs fail at their next wake all the same.
  const loop = read('src/convex/integrations/workflows.ts')
  const page = read(contentFile('/docs/ship/releases/upgrade'))

  it.each([
    'if (after > 0) await step.sleep(after, { name: `email-sequence-wait-${index}` })',
    'if (message) await step.runMutation(components.backend.email.send, message)',
  ])('takes the step the package takes: %s', (copy) => {
    expect(page).toContain(copy)
  })

  it('matches the package\'s own loop', () => {
    expect(loop).toContain('await step.sleep(sequenceStep.after, { name: `email-sequence-wait-${index}` })')
    expect(loop).toContain('const send = components.backend.email.send')
    // The send is journaled by name and kind (unstableArgs): a replay may render it differently.
    expect(loop).toContain('await step.runMutation(send as never, message as never, { unstableArgs: true })')
  })
})

describe('hand-written pages', () => {
  it('exist', () => {
    expect(handWritten.length).toBeGreaterThan(40)
  })
})

describe('the flags page', () => {
  // The how-to restates the package's own flags, what a target list holds and
  // how fine a rollout is cut, and the refusal of a paused call: each is held
  // to the code that decides it.
  const page = read(contentFile('/docs/ship/operate/flags'))
  const kills = page.slice(page.indexOf('| Flag | While it is on |')).split('\n\n')[0]!.split('\n').slice(2)

  it('lists the package\'s own flags in their order', () => {
    expect(kills.map(row => row.match(/^\| `(\w+)` \|/)?.[1])).toEqual(BACKEND_FLAG_KEYS)
  })

  it('names each paused service and its reason as the refusal carries them', () => {
    expect(page).toContain(`(${Object.keys(PAUSE_FLAGS).map(service => `\`${service}\``).join(', ').replace(/, (?=[^,]*$)/, ' or ')})`)
    expect(page).toContain('the reason `<service>_paused`')
  })

  it('states the limits the code holds a target list and a rollout to', () => {
    expect(page).toContain(`Each list holds at most ${FLAG_TARGETS_MAX} entries`)
    expect(page).toContain(`from 0 to ${(ROLLOUT_BUCKETS - 1).toLocaleString('en-US')}`)
  })

  it('pins the scaffold\'s exports it names to the contract', () => {
    const line = page.match(/^export const \{ ([^}]+) \} = flags\.api$/m)?.[1]?.split(', ') ?? []
    expect(line).toEqual(expect.arrayContaining([...REQUIRED_FUNCTION_EXPORTS.flags]))
    expect(BACKEND_FILE_TEMPLATES['flags.ts']).toContain(`export const { ${line.join(', ')} } = flags.api`)
    expect(SENSITIVE_ACTIONS['flags:setFlag']?.recentSignIn).not.toBeNull()
  })
})

describe('the admin console pages', () => {
  // The how-to restates the console's tabs, the admin routes' rows of the
  // sensitive-action table and setupAdmin's reads; the impersonation page
  // and the Upgrade section state how long a visit lasts. Each is held to
  // the code that decides it.
  const howTo = read(contentFile('/docs/build/auth/admin'))
  const impersonation = read(contentFile('/docs/build/auth/admin/impersonation'))
  const upgrade = read(contentFile('/docs/ship/releases/upgrade'))
  /** The body rows of the first table after a heading row that starts with `header`, as cells. */
  const tableAfter = (page: string, header: string) => {
    const table = page.slice(page.indexOf(header)).split('\n\n')[0]!
    return table.split('\n').slice(2).map(row => row.split('|').slice(1, -1).map(cell => cell.trim()))
  }

  it('lists the console\'s tabs in their order, by their labels', () => {
    expect(tableAfter(howTo, '| Tab |').map(([tab]) => tab)).toEqual(ADMIN_TABS.map(tab => LABELS.admin.tabs[tab.key as keyof typeof LABELS.admin.tabs]))
  })

  it('says which admin routes ask for a recent sign-in, and that each spends the admin limit', () => {
    const rows = tableAfter(howTo, '| Action | Route |')
    expect(rows.length).toBeGreaterThan(0)
    for (const [, routes, recent] of rows) {
      for (const [, route] of routes!.matchAll(/`(\/admin\/[a-z-]+)`/g)) {
        const row = SENSITIVE_ACTIONS[route!]
        expect(row, route).toBeDefined()
        expect(recent!.startsWith('yes'), route).toBe(row!.recentSignIn !== null)
        expect(row!.limit, route).toMatchObject({ caller: 'admin' })
      }
    }
  })

  it('names setupAdmin\'s reads, and only those', () => {
    const fields = [...howTo.matchAll(/:::field\{name="(\w+)" type="query"\}/g)].map(match => match[1])
    expect(fields).toEqual([...REQUIRED_FUNCTION_EXPORTS.admin])
  })

  it('states how long a visit lasts', () => {
    const word = ({ 10: 'ten', 15: 'fifteen', 20: 'twenty', 30: 'thirty' } as Record<number, string>)[IMPERSONATION_SESSION_SECONDS / 60]
    expect(word, 'the window, in a word the pages use').toBeDefined()
    expect(impersonation).toContain(`**${word![0]!.toUpperCase()}${word!.slice(1)} minutes at most.**`)
    expect(upgrade).toContain(`A visit now lasts at most ${word} minutes`)
  })
})

describe('the defaults the background-work pages state', () => {
  // The workpool page states the component's own defaults: an app imports
  // it directly, so a change upstream fails here until the page says the same.
  const workpool = read(contentFile('/docs/build/data/jobs/workpool'))
  const count = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

  it('states the parallelism and retry behaviour the workpool falls back to', () => {
    const parallelism = read('node_modules/@convex-dev/workpool/dist/component/shared.js').match(/DEFAULT_MAX_PARALLELISM = (\d+)/)?.[1]
    expect(parallelism, 'the component names its default parallelism').toBeDefined()
    expect(workpool).toContain(`| \`maxParallelism\` | \`${parallelism}\` |`)
    const { maxAttempts, initialBackoffMs, base } = DEFAULT_RETRY_BEHAVIOR
    expect(workpool).toContain(`| \`defaultRetryBehavior\` | \`{ maxAttempts: ${maxAttempts}, initialBackoffMs: ${initialBackoffMs}, base: ${base} }\` | How an action that asks for retries is retried: ${count[maxAttempts]} attempts in all, ${initialBackoffMs} ms before the second`)
  })
})

describe('the monitoring pages', () => {
  // The facts the monitoring page and the DevTools tab state, each read
  // from the constant that holds it.
  const page = read(contentFile('/docs/ship/operate/monitoring'))
  const devtools = read(contentFile('/docs/develop/devtools'))
  const seconds = (ms: number) => `${['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][ms / 1000]} seconds`

  it('names every tag a report carries, in its table', () => {
    for (const tag of Object.values(MONITORING_TAGS)) expect(page, tag).toMatch(new RegExp(`^\\| \`${tag.replace('.', '\\.')}\` \\|`, 'm'))
  })

  it('names both health routes, and the maintenance cron\'s monitor and schedule', () => {
    expect(page).toContain(`\`GET ${HEALTH_ROUTE}\``)
    expect(page).toContain(`\`${DEFAULT_HEALTH_PATH}\``)
    expect(page).toContain(`the monitor \`${monitorSlug(MAINTENANCE_JOB)}\``)
    expect(MAINTENANCE_INTERVAL_MS).toBe(60 * 60 * 1000)
    expect(page).toContain('its hourly pass')
  })

  it('states how long a report may take, and the rate the package\'s config traces at', () => {
    expect(page).toContain(`within ${seconds(REPORT_TIMEOUT_MS)}`)
    for (const file of ['src/runtime/monitoring/sdk/sentry.client.config.ts', 'src/runtime/monitoring/sdk/sentry.server.config.ts']) {
      expect(read(file), file).toContain('tracesSampleRate: tracesSampleRate(import.meta.dev),')
    }
    expect([tracesSampleRate(true), tracesSampleRate(false)]).toEqual([1, 0.1])
    expect(page).toContain('traces at every request in dev and one in ten in production')
  })

  it('states what the preset sends as log lines, and what replay records', () => {
    expect(LOG_LEVELS).toEqual(['warn', 'error'])
    expect(page).toContain('`console.warn` and `console.error` as log lines')
    expect(REPLAY.sampling).toEqual({ replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 1 })
    expect(REPLAY.privacy).toEqual({ maskAllText: true, maskAllInputs: true, blockAllMedia: true })
    expect(page).toContain('sends nothing until an error. Then it sends the minute before the error and records the rest of that visit, until 15 idle minutes or an hour end it')
  })

  it('states each alert\'s threshold, its tag and its cron, and how long costs are kept', () => {
    const words: Record<number, string> = { 2: 'twice', 7: 'seven' }
    expect(page).toContain(`the hourly \`${ALERTS_JOB}\` cron`)
    expect(page).toContain(`\`${ALERT_TAG}\``)
    expect(EMAIL_QUOTA_THRESHOLDS).toEqual([0.8, 1])
    expect(page).toContain('once 80% of it is used, and again once it is used up')
    expect(page).toContain(`passes ${words[AI_SPEND_FACTOR]} the daily average of the ${words[AI_SPEND_BASELINE_DAYS]} days before, and $${AI_SPEND_FLOOR_USD}`)
    expect(page).toContain(`${AI_COST_RETENTION_MS / 86_400_000} days`)
  })

  it('states how many entries the local error log keeps, and how often the DevTools tab reads it', () => {
    expect(devtools).toContain(`the last ${LOCAL_LOG_LIMIT} are kept, and **Clear** forgets them`)
    const poll = Number(read('devtools-client-app/app/components/panel/Monitoring.vue').match(/const POLL_MS = (\d+)/)?.[1])
    expect(devtools).toContain(`every ${seconds(poll)} while it is open`)
  })
})

describe('the ecosystem page', () => {
  // Each table row names one package and where it stands. The manifest is the
  // truth for what ships: a component added without its row, or a row that
  // claims a package the manifest lacks, fails here.
  const page = read(contentFile('/docs/reference/ecosystem'))
  const STATUSES = ['Shipped', 'Optional peer', 'Bundled', 'Supported', 'Planned', 'Recipe', 'Not planned']
  const rows = [...page.matchAll(/^\| `((?:@[\w.-]+\/)?[\w.-]+)` \| ([^|]+?) \|/gm)].map(([, name, status]) => ({ name: name!, status: status!.trim() }))
  const statusOf = (name: string) => rows.find(row => row.name === name)?.status
  const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string>, peerDependencies: Record<string, string>, peerDependenciesMeta: Record<string, { optional?: boolean }> }
  const declared = new Set([...Object.keys(pkg.dependencies), ...Object.keys(pkg.peerDependencies)])
  const moduleSource = read('src/module.ts')
  const moduleDependencies = [...moduleSource.slice(moduleSource.indexOf('moduleDependencies:'), moduleSource.indexOf('async setup('))
    .matchAll(/^ {6,}'((?:@[\w.-]+\/)?[\w.-]+)': \{/gm)].map(([, name]) => name!)

  it('reads the rows and the module dependencies', () => {
    expect(rows.length).toBeGreaterThan(30)
    expect(moduleDependencies).toEqual(expect.arrayContaining(['nuxt-convex-module']))
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
      expect(pkg.peerDependenciesMeta[name]?.optional, `${name} is an optional peer, which the app installs itself`).not.toBe(true)
    }
  })

  it('calls an optional peer what the manifest calls it', () => {
    const optional = Object.keys(pkg.peerDependenciesMeta).filter(name => pkg.peerDependenciesMeta[name]!.optional)
    for (const { name } of rows.filter(row => row.status === 'Optional peer')) expect(optional, name).toContain(name)
    expect(rows.filter(row => row.status === 'Optional peer').map(row => row.name)).toEqual(expect.arrayContaining(['ai', '@convex-dev/crons']))
  })

  it('bundles only what arrives through a shipped package', () => {
    for (const { name } of rows.filter(row => row.status === 'Bundled')) {
      expect(declared.has(name), `${name} is declared, so it is shipped`).toBe(false)
      expect(existsSync(at(`node_modules/${name}/package.json`)), `${name} is not installed`).toBe(true)
    }
  })

  it('declares nothing it calls supported, planned, a recipe or left out', () => {
    for (const { name, status } of rows.filter(row => !['Shipped', 'Optional peer', 'Bundled'].includes(row.status))) {
      expect(declared.has(name), `${name} is ${status} but the manifest declares it`).toBe(false)
    }
  })
})
