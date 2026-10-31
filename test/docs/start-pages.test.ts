import { describe, expect, it } from 'vitest'
import { LABELS } from '../../src/convex/labels'
import { BACKEND_PAGE_DEFS } from '../../src/pages/registry'
import { BACKEND_FILE_TEMPLATES } from '../../src/templates'
import { AGENT_PROMPT } from '../../website/shared/agent-prompt'
import { APP_CAPABILITY_IDS } from '../../website/shared/docs-capabilities'
import { DOCS_FRAGMENT_MOVES } from '../../website/shared/docs-fragment-moves'
import { DOCS_REDIRECTS } from '../../website/shared/docs-routes'
import WHAT_YOU_GET from '../../website/shared/what-you-get.json'
import { contentFile, read } from './helpers'

// Start here: the pages an evaluator and a first-hour builder read first. The
// Quickstart makes an honest promise (which accounts, how long) and keeps it
// short: two checkpoints, the first with no account, the second on Polar's
// sandbox, nothing deployed. What it shows is held to the code it shows: the
// starter's buttons, the refusals' own words, and an inventory read from the
// registries.

const quickstart = read(contentFile('/docs/start/quickstart'))
const starterApp = read('templates/starter/app/pages/app/index.vue')

/** The text from a heading to the next heading of its level or higher. */
function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`\n${heading}\n`)
  expect(start, heading).toBeGreaterThan(-1)
  const level = heading.match(/^#+/)![0].length
  const next = markdown.slice(start + heading.length + 2).search(new RegExp(`^#{1,${level}} `, 'm'))
  return next === -1 ? markdown.slice(start) : markdown.slice(start, start + heading.length + 2 + next)
}

describe('the Quickstart', () => {
  const checkpoints = [...quickstart.matchAll(/^## (Checkpoint \d: .+)$/gm)].map(([, title]) => title!)

  it('opens with the accounts and the time each checkpoint takes', () => {
    const intro = quickstart.slice(0, quickstart.indexOf('\n## '))
    expect(intro).toContain('| Checkpoint | Accounts | Time |')
    const rows = intro.split('\n').filter(line => /^\| \[\d\. /.test(line))
    expect(rows).toHaveLength(checkpoints.length)
    expect(rows.map(row => row.split('|')[2]!.trim())).toEqual(['None', 'A Polar sandbox account'])
  })

  it('gets there in two checkpoints of six steps, and deploys nothing', () => {
    expect(checkpoints).toHaveLength(2)
    const steps = checkpoints.flatMap(title => [...section(quickstart, `## ${title}`).matchAll(/^### (.+)$/gm)].map(([, step]) => step))
    expect(steps.length).toBeLessThanOrEqual(6)
    expect(quickstart).not.toMatch(/convex deploy|--prod\b|CONVEX_DEPLOY_KEY/)
  })

  it('bills in Polar\'s sandbox, with a sandbox token and the test card', () => {
    const billing = section(quickstart, `## ${checkpoints[1]}`)
    expect(billing).toContain('BILLING_ACCESS_TOKEN')
    expect(billing).toContain('npx nuxt-backend billing sync')
    expect(billing).toContain('4242 4242 4242 4242')
    expect(quickstart).toContain('(/docs/develop/sandboxes)')
  })

  it('presses buttons the starter has', () => {
    const buttons = [...section(quickstart, `## ${checkpoints[1]}`).matchAll(/\*\*([^*]+)\*\*/g)].map(([, label]) => label!).filter(label => label !== 'Pay' && !label.startsWith('You should'))
    expect(buttons).toEqual(['Buy 500 credits', 'Spend 1 credit'])
    for (const label of buttons) expect(starterApp, label).toContain(label)
    // The spend is the scaffold's own metered action.
    expect(starterApp).toContain('useAction(api.ai.transform)')
    expect(BACKEND_FILE_TEMPLATES['ai.ts']).toContain('export const transform = ai.meteredAction(')
  })

  it('quotes the sign-in refusals in their own words', () => {
    // Those a first run meets: test mode with a real address, and no transport.
    for (const message of [LABELS.errors.unavailable_test_mode, LABELS.errors.unavailable_unconfigured]) expect(quickstart).toContain(`"${message}"`)
  })

  it('keeps the anchors other pages link, as a heading or a move', () => {
    expect(quickstart).toMatch(/^### Sign in with the code in the terminal$/m)
    expect(DOCS_FRAGMENT_MOVES['/docs/start/quickstart#sign-in-with-the-console-otp']).toBe('/docs/start/quickstart#sign-in-with-the-code-in-the-terminal')
    expect(DOCS_FRAGMENT_MOVES['/docs/start/quickstart#declare-a-billing-catalog-and-sync-it']).toBe('/docs/start/quickstart#checkpoint-2-credits-bought-and-spent')
  })
})

describe('What you just got', () => {
  const page = read(contentFile('/docs/start/what-you-got'))
  const inventory = WHAT_YOU_GET['first-run'] as Array<{ kind: string, items: Array<{ name: string }> }>
  const names = (kind: string) => inventory.find(group => group.kind === kind)?.items.map(item => item.name) ?? []

  it('renders the inventory the registries hold', () => {
    expect(page).toContain('::what-you-get{area="first-run"}')
  })

  it('lists every file the scaffold writes, and says which are regenerated', () => {
    const files = [...names('Your files'), ...names('Regenerated files')]
    expect(files.sort()).toEqual([...Object.keys(BACKEND_FILE_TEMPLATES).map(file => `backend/${file}`), 'backend/_generated/'].sort())
    expect(names('Regenerated files')).toContain('backend/billing.generated.ts')
  })

  it('lists every page, the env the first run sets and the maintenance it starts', () => {
    expect(names('Pages').sort()).toEqual(BACKEND_PAGE_DEFS.map(def => def.defaultPath).sort())
    expect(names('Env it sets')).toEqual(expect.arrayContaining(['AUTH_SECRET', 'SITE_URL']))
    const source = read('src/convex/components/backend/maintenance.ts')
    const tasks = source.slice(source.indexOf('export const MAINTENANCE_TASKS = {'))
    for (const task of names('Maintenance')) expect(tasks).toMatch(new RegExp(`^ {2}${task}: async|^const EMAIL_RECORDS_TASK = '${task}'$`, 'm'))
    expect(names('Maintenance')).toEqual(expect.arrayContaining(['sessions', 'emailRecords']))
  })
})

describe('Installation', () => {
  const page = read(contentFile('/docs/start/installation'))

  it('offers three ways in as tabs, the agent first, with the shared prompt', () => {
    expect([...page.matchAll(/^:::tabs-item\{label="([^"]+)"/gm)].map(([, label]) => label)).toEqual(['Agent', 'CLI', 'By hand'])
    const agentTab = page.slice(page.indexOf(':::tabs-item{label="Agent"'), page.indexOf(':::tabs-item{label="CLI"'))
    expect(agentTab).toContain(`\`\`\`text\n${AGENT_PROMPT}\n\`\`\``)
    expect(agentTab).toContain(':agent-prompt-links')
  })

  it('sends the old agent anchor to the tabs', () => {
    expect(DOCS_FRAGMENT_MOVES['/docs/start/installation#with-an-ai-agent']).toBe('/docs/start/installation#install')
  })
})

describe('the Start tab', () => {
  // The pages the docs map gives Start, and the Glossary under Reference.
  const ROUTES = [
    '/docs/start',
    '/docs/start/quickstart',
    '/docs/start/what-you-got',
    '/docs/start/feature-map',
    '/docs/start/roadmap',
    '/docs/start/installation',
    '/docs/start/templates',
    '/docs/start/playground',
    '/docs/start/playground/try-everything',
    '/docs/start/concepts/how-it-works',
    '/docs/start/concepts/capabilities',
    '/docs/start/concepts/principles',
    '/docs/start/concepts/environments',
    '/docs/start/concepts/nuxt-convex-module',
    '/docs/start/concepts/choosing',
    '/docs/develop/dev-loop',
    '/docs/develop/doctor',
    '/docs/develop/devtools',
    '/docs/develop/sandboxes',
    '/docs/reference/glossary',
  ]

  it.each(ROUTES)('has %s', (route) => {
    expect(() => contentFile(route)).not.toThrow()
  })

  it('answers the Develop and Playground folders with pages of their own, not redirects', () => {
    const redirected = new Set(DOCS_REDIRECTS.map(redirect => redirect.from))
    for (const route of ['/docs/develop/dev-loop', '/docs/start/playground']) expect(redirected.has(route), route).toBe(false)
  })

  it('tells an evaluator when to pick something else', () => {
    const intro = read(contentFile('/docs/start'))
    expect(intro).toContain('| Use it when | Pick something else when |')
    expect(intro).toContain('(/docs/start/concepts/principles)')
  })

  it('opens with what the package composes, who it is for, what it is not and what an app has on day one', () => {
    const intro = read(contentFile('/docs/start'))
    for (const heading of ['What it is made of', 'Who it is for', 'What it is not', 'Day one']) expect(intro).toContain(`\n## ${heading}\n`)
    // A row of the services table for each service it composes.
    for (const service of ['Convex', 'Better Auth', 'Polar', 'Resend', 'Vercel', 'Sentry', 'Convex AI Gateway']) expect(intro, service).toContain(`\n| [${service}](`)
    expect(intro).toContain('(/docs/start/feature-map)')
    expect(intro).toContain('(/docs/start/roadmap)')
  })

  it('describes the release\'s twelve capabilities, in the Feature map\'s order', () => {
    const page = read(contentFile('/docs/start/concepts/capabilities'))
    const rows = [...page.slice(page.indexOf('## The twelve capabilities')).matchAll(/^\| `([a-z]+)`/gm)].map(([, name]) => name)
    expect(rows.slice(0, 12)).toEqual(APP_CAPABILITY_IDS)
  })

  it('names each service-app feature the release defers, and the upstream holds, on the Roadmap', () => {
    const page = read(contentFile('/docs/start/roadmap'))
    for (const feature of ['API keys', 'Outgoing webhooks', 'An MCP endpoint for your users\' agents', 'Custom workspace roles', 'Workspace ownership transfer', 'Workspace billing permissions', 'The full workspace API', 'Workspace invite links']) expect(page, feature).toContain(`\n| ${feature} |`)
    for (const hold of ['Better Auth 1.7', 'Polar SDK 1.0', 'Nuxt 5']) expect(page, hold).toContain(`**${hold}.**`)
  })

  it('states each principle with its reason', () => {
    const page = read(contentFile('/docs/start/concepts/principles'))
    const table = page.slice(page.indexOf('| Principle | Why |')).split('\n\n')[0]!.split('\n').slice(2)
    const sections = [...page.matchAll(/^## (.+)$/gm)].map(([, title]) => title!).filter(title => title !== 'What this means for you')
    // One row per section, each linking it and giving its reason.
    expect(table.map(row => row.match(/^\| \[([^\]]+)\]\(#/)?.[1])).toEqual(sections)
    for (const row of table) expect(row.split('|')[2]!.trim().length, row).toBeGreaterThan(30)
  })
})
