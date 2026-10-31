import { describe, expect, it, vi } from 'vitest'
import { currentText, expectedText } from '../../scripts/docs-lookups/index.mjs'
import { FEATURE_MAP_FILE, STATUS_LABELS, statusCell } from '../../scripts/docs-lookups/feature-map.mjs'
import { CAPABILITY_NAMES } from '../../src/capabilities/registry'
import { changingCallout, enrichPage, PLANNED_CALLOUT } from '../../website/modules/docs-pages'
import { openTwin } from '../../website/shared/agent-markdown'
import { llmsSections } from '../../website/shared/agent-surfaces'
import { APP_CAPABILITY_IDS, DOCS_CAPABILITIES, DOCS_CAPABILITY_IDS } from '../../website/shared/docs-capabilities'
import { DOCS_VERSION } from '../../website/shared/docs-version'
import * as planned from '../../website/shared/planned'
import { badgeShape, badgeTone, CHANGING_BADGE, EXPERIMENTAL_BADGE, hoistBadges, PLANNED_BADGE } from '../../website/utils/nav-badges'
import { contentRoute, frontmatter, GENERATED_REFERENCE, read, walk } from './helpers'
import { component, parts, renderComponent } from './sfc'

const { CHANGING, changingDescription, changingNote, FEATURE_MAP, FEATURE_MAP_STATUSES, PLANNED, PLANNED_NOTE, PLANNED_RELEASE, plannedDescription } = planned

vi.mock('nitropack/runtime', () => ({ defineNitroPlugin: (plugin: unknown) => plugin }))

// The release markers (website/shared/planned.ts): a docs page may describe
// what the release has not built yet (`status: planned` + `plannedBy`), or a
// built feature's API as the release reshapes it (`status: changing` +
// `changedBy`), so the docs show the whole package. Each marker puts a chip
// on the page, opens it with a callout the site's search and the Markdown
// twin carry, badges its entry, and says so in llms.txt; the code pins skip
// it. These tests hold the rules only: no list of pages lives here. Each
// page names its own unit and its Feature map section (`capability`), and the map
// is generated from that frontmatter (scripts/docs-lookups/feature-map.mjs),
// so the writers of different tabs never edit one shared list.

/**
 * The units of the 0.2.0 plan:
 * the changes to built APIs first, then the new features. A page names one
 * of these and nothing else: the units the plan retired are gone from the
 * docs, their kept parts moved into the units here and the rest to the
 * Roadmap.
 */
const UNITS = new Set([
  'RENAME', 'SIMPLIFY', 'ENV', 'NOSIM', 'RESET', 'DEFER',
  'ACCESS', 'WAITLIST', 'REF', 'GIFTS', 'ENGAGE', 'FUNNEL', 'GRACE', 'CONSENT', 'OPS1', 'SAFETY', 'FILES', 'RETAIN',
  'JOBS', 'AI', 'NOTIFY', 'PREFS', 'SHELL', 'THEME', 'ADMINX', 'INBOUND', 'OPS2', 'DEVMCP', 'PROD', 'SEC2',
  'ANALYZE', 'I18N',
  'SETUP', 'UIKIT', 'AUTHSEC', 'LIFECYCLE', 'PROVENANCE', 'LEGAL', 'OBSERVE', 'PLAYDEMO',
])

const DOCS = 'website/content/docs'
const handWritten = walk(DOCS, ['.md'], path => `${path}/`.includes(GENERATED_REFERENCE)).map(file => file.slice(file.indexOf(DOCS)))
const pages = handWritten.map(file => ({ file, route: contentRoute(file), meta: frontmatter(read(file)) }))
const marked = pages.filter(page => page.meta.status === PLANNED || page.meta.status === CHANGING)
const unitOf = (meta: Record<string, string>) => meta.plannedBy ?? meta.changedBy

describe('pages ahead of the code', () => {
  it.each(pages.map(page => [page.route, page] as const))('%s names a unit of the plan exactly when it is planned or changing', (_route, page) => {
    expect(page.meta.plannedBy !== undefined, '`plannedBy` goes with `status: planned`, and only with it').toBe(page.meta.status === PLANNED)
    expect(page.meta.changedBy !== undefined, '`changedBy` goes with `status: changing`, and only with it').toBe(page.meta.status === CHANGING)
    const unit = unitOf(page.meta)
    if (unit !== undefined) expect([...UNITS], unit).toContain(unit)
  })

  it('are each on the Feature map when planned, by the section they name', () => {
    // A changing page joins the map by its `capability` too, when it documents a
    // feature; a concept or a tutorial ahead of the code has no row.
    const unplaced = marked.filter(page => page.meta.status === PLANNED && !page.meta.capability).map(page => page.route)
    expect(unplaced, 'give each a `capability:` (website/shared/docs-capabilities.ts)').toEqual([])
  })

  it('point no key at code that does not exist yet, when planned', () => {
    // Try live, API and Source lead into what is built; a planned page has none of it.
    const keyed = pages.filter(page => page.meta.status === PLANNED && (page.meta.playground || page.meta.api || page.meta.source))
    expect(keyed.map(page => page.route)).toEqual([])
  })

  it('arrive in the first release of the line these docs describe', () => {
    expect(PLANNED_RELEASE).toBe(DOCS_VERSION.line.replace(/x$/, '0'))
  })
})

describe('the Feature map', () => {
  const map = read(FEATURE_MAP_FILE)
  const sections = [...map.matchAll(/^## (.+)$/gm)].map(([, title]) => title!)
  const legend = map.slice(map.indexOf('## Statuses')).split('\n\n')[1]!.split('\n').slice(2).map(line => line.split('|')[1]!.trim())

  it('is the page the chips link to, with the anchor they name', () => {
    expect(contentRoute(FEATURE_MAP_FILE)).toBe(FEATURE_MAP)
    expect(FEATURE_MAP_STATUSES).toBe(`${FEATURE_MAP}#statuses`)
    expect(map).toMatch(/^## Statuses$/m)
  })

  it('is in step with every page\'s frontmatter (pnpm docs:lookups)', () => {
    expect(currentText(FEATURE_MAP_FILE)).toBe(expectedText(FEATURE_MAP_FILE))
  })

  it('names every page\'s section from the list it may take', () => {
    const wrong = pages.filter(page => page.meta.capability !== undefined && !DOCS_CAPABILITY_IDS.includes(page.meta.capability)).map(page => `${page.route}: ${page.meta.capability}`)
    expect(wrong).toEqual([])
  })

  it('has a section for each of the release\'s twelve capabilities, then what spans them', () => {
    expect(APP_CAPABILITY_IDS).toHaveLength(12)
    expect([...CAPABILITY_NAMES].sort()).toEqual([...APP_CAPABILITY_IDS].sort())
    expect(sections.filter(title => title !== 'Statuses')).toEqual(DOCS_CAPABILITIES.map(capability => capability.title))
  })

  it('explains every status a page on it has, in its legend', () => {
    const shown = new Set(pages.filter(page => page.meta.capability).map(page => STATUS_LABELS[(page.meta.status ?? 'stable') as keyof typeof STATUS_LABELS]))
    for (const status of shown) expect(legend, status).toContain(status)
    expect(legend).toEqual(['Available', 'Experimental', 'Changing', 'Planned'])
  })

  it('reads a page\'s status with the unit a marker names', () => {
    expect(statusCell({})).toBe('Available')
    expect(statusCell({ status: 'experimental' })).toBe('Experimental')
    expect(statusCell({ status: PLANNED, plannedBy: 'ACCESS' })).toBe('Planned (ACCESS)')
    expect(statusCell({ status: CHANGING, changedBy: 'RENAME' })).toBe('Changing (RENAME)')
  })
})

describe('a marked page, as the site builds it', () => {
  const text = (node: unknown): string => typeof node === 'string' ? node : Array.isArray(node) ? node.slice(2).map(text).join('') : ''
  const parsed = (status: string, fields: Record<string, string> = {}) => ({ status, ...fields, navigation: { icon: 'i-lucide-bell' }, body: { type: 'minimark', value: [['p', {}, 'Text.']] as unknown[] } })

  it('opens with its callout once, and badges its entry', () => {
    const page: Record<string, unknown> = parsed(PLANNED)
    enrichPage(page, undefined)
    enrichPage(page, undefined)
    expect((page.body as { value: unknown[] }).value).toEqual([PLANNED_CALLOUT, ['p', {}, 'Text.']])
    expect(page.navigation).toEqual({ icon: 'i-lucide-bell', badge: PLANNED_BADGE })

    const changing: Record<string, unknown> = parsed(CHANGING, { changedBy: 'RENAME' })
    enrichPage(changing, undefined)
    enrichPage(changing, undefined)
    expect((changing.body as { value: unknown[] }).value).toEqual([changingCallout('RENAME'), ['p', {}, 'Text.']])
    expect(changing.navigation).toEqual({ icon: 'i-lucide-bell', badge: CHANGING_BADGE })
  })

  it('says what the code lacks, in the words the site\'s search indexes, and links the Feature map', () => {
    expect(text(PLANNED_CALLOUT)).toBe(`Planned. ${PLANNED_NOTE} The Feature map shows what is built.`)
    expect(PLANNED_NOTE).toContain(`Arrives in ${PLANNED_RELEASE}`)
    expect(text(changingCallout('ENV'))).toBe(`Changing. Describes the ${PLANNED_RELEASE} API. The code still has the previous one until ENV lands. The Feature map shows what each unit changes.`)
    expect(changingNote('ENV')).toContain('until ENV lands')
    for (const callout of [PLANNED_CALLOUT, changingCallout('ENV')]) {
      expect(callout[0]).toBe('callout')
      expect(JSON.stringify(callout)).toContain(`{"href":"${FEATURE_MAP}"}`)
    }
  })

  it('leaves every other page without a callout', () => {
    for (const status of ['stable', 'experimental', 'deprecated']) {
      const page: Record<string, unknown> = parsed(status)
      enrichPage(page, undefined)
      expect((page.body as { value: unknown[] }).value, status).toEqual([['p', {}, 'Text.']])
    }
    const experimental: Record<string, unknown> = parsed('experimental')
    enrichPage(experimental, undefined)
    expect((experimental.navigation as { badge: unknown }).badge).toEqual(EXPERIMENTAL_BADGE)
  })

  it('prints its status in the Markdown twin, above the callout', () => {
    for (const [status, callout] of [[PLANNED, PLANNED_CALLOUT], [CHANGING, changingCallout('NOSIM')]] as const) {
      const page: Record<string, unknown> = parsed(status, status === CHANGING ? { changedBy: 'NOSIM' } : {})
      enrichPage(page, undefined)
      openTwin(page.body, { path: '/docs/build/email/notifications', kind: 'how-to', status })
      const value = (page.body as { value: unknown[] }).value
      expect(text(value[0])).toMatch(new RegExp(`· Kind: how-to · Status: ${status}$`))
      // Under the header line, the pointers and the npm note.
      expect(value[3]).toEqual(callout)
    }
  })

  it('says so first in its llms.txt description', () => {
    const page = { stem: 'docs/01.start/9.marked', title: 'Marked', description: 'Does a thing.', kind: 'how-to' }
    const [section] = llmsSections([{ ...page, route: '/docs/start/planned', status: PLANNED }, { ...page, route: '/docs/start/changing', status: CHANGING, changedBy: 'SIMPLIFY' }], 'https://nuxt-backend.dev')
    expect(section!.links.map(link => link.description)).toEqual([plannedDescription('Does a thing.'), changingDescription('Does a thing.', 'SIMPLIFY')])
    expect(plannedDescription('Does a thing.')).toBe(`Planned for ${PLANNED_RELEASE}, not built yet. Does a thing.`)
    expect(changingDescription('Does a thing.', 'SIMPLIFY')).toBe(`Changing in ${PLANNED_RELEASE}: describes the new API, and the code keeps the previous one until SIMPLIFY lands. Does a thing.`)
  })

  it('wears its chip, linking to the Feature map\'s statuses', async () => {
    const chips = component('website/components/docs/DocsPageChips.vue', { '#shared/planned': planned })
    const plannedChip = await renderComponent(chips, { kind: 'how-to', status: PLANNED }, parts())
    expect(plannedChip).toContain(`href="${FEATURE_MAP_STATUSES}"`)
    expect(plannedChip).toMatch(/class="led led-off"/)
    expect(plannedChip).toContain('Planned')
    const changingChip = await renderComponent(chips, { kind: 'how-to', status: CHANGING }, parts())
    expect(changingChip).toContain(`href="${FEATURE_MAP_STATUSES}"`)
    expect(changingChip).toMatch(/class="led led-warn led-square"/)
    expect(changingChip).toContain('Changing')
    const plain = await renderComponent(chips, { kind: 'how-to' }, parts())
    expect(plain).not.toContain('Planned')
    expect(plain).not.toContain('Changing')
  })

  it('reads in the sidebar by its light, once for a group whose every page carries it', () => {
    const page = (path: string, badge?: object) => ({ title: path, path, ...(badge ? { badge } : {}) })
    const [group, mixed, changing] = hoistBadges([
      { title: 'Notifications', path: '/docs/build/email/notifications', children: [page('/docs/build/email/notifications', PLANNED_BADGE), page('/docs/email/notifications/push', PLANNED_BADGE)] },
      { title: 'AI', path: '/docs/build/ai', children: [page('/docs/build/ai', EXPERIMENTAL_BADGE), page('/docs/build/ai/chat', PLANNED_BADGE)] },
      { title: 'Workspaces', path: '/docs/build/auth/workspaces', children: [page('/docs/build/auth/workspaces', CHANGING_BADGE), page('/docs/build/auth/workspaces/members', CHANGING_BADGE)] },
    ])
    expect(group!.badge).toEqual(PLANNED_BADGE)
    expect(group!.children!.some(child => child.badge)).toBe(false)
    expect(mixed!.badge).toBeUndefined()
    expect(mixed!.children!.map(child => child.badge)).toEqual([EXPERIMENTAL_BADGE, PLANNED_BADGE])
    expect(changing!.badge).toEqual(CHANGING_BADGE)
    expect([badgeTone(PLANNED_BADGE), badgeShape(PLANNED_BADGE)]).toEqual(['off', 'round'])
    expect([badgeTone(EXPERIMENTAL_BADGE), badgeShape(EXPERIMENTAL_BADGE)]).toEqual(['warn', 'round'])
    expect([badgeTone(CHANGING_BADGE), badgeShape(CHANGING_BADGE)]).toEqual(['warn', 'square'])
  })
})

describe('the convention', () => {
  it('is in CONTRIBUTING.md, with the fields, the map and this file', () => {
    const contributing = read('CONTRIBUTING.md')
    for (const phrase of ['status: planned', 'plannedBy', 'status: changing', 'changedBy', 'capability:', 'website/shared/docs-capabilities.ts', 'test/docs/planned-pages.test.ts', 'pnpm docs:lookups', FEATURE_MAP]) expect(contributing, phrase).toContain(phrase)
  })
})
