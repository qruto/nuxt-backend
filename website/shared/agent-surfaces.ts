import { CORE_SKILL, TASK_SKILLS } from '../../src/guidance/skills'
import { DOCS_MCP_PAGE, DOCS_MCP_URL } from './docs-mcp'
import { BUILD_GROUPS, DOCS_TABS, REFERENCE_ROUTE } from './docs-routes'
import { DOCS_VERSION } from './docs-version'
import { markedDescription, PLANNED_RELEASE } from './planned'
import { PM_NOTE } from './pm'

// THE SITE AS AN AGENT FINDS IT. nuxt-agent-discovery (which Docus
// registers) serves the Markdown twins, `/llms.txt`, `/llms-full.txt` and
// `/sitemap.md`; this file decides what they say, in one place:
//
// - nuxt.config.ts builds the llms.txt sections from `llmsSections`, one per
//   tab with its pages in journey order, and its preamble from LLMS_DETAILS;
// - server/plugins/agent-surfaces.ts opens each twin with the page's
//   version, tab, kind and status (shared/agent-markdown.ts) and groups
//   sitemap.md by tab with `sitemapByTab`;
// - scripts/check-website-agents.mjs holds a built site, and the live one
//   every week, to what these promise;
// - test/docs/agent-surfaces.test.ts pins them to the docs tree.
//
// No Node imports: the Nitro plugin bundles it.

/** A docs page as the agent surfaces list it. */
export interface AgentPage {
  route: string
  /**
   * The content path without `.md`, its `N.` prefixes kept
   * (`docs/04.build/2.billing/5.subscriptions/1.checkout`): the order the sidebar
   * shows, which journeyOrder reads.
   */
  stem: string
  title: string
  description?: string
  kind?: string
  status?: string
  /** The unit that brings the code to a changing page's API (shared/planned.ts). */
  changedBy?: string
}

/** One llms.txt section, as nuxt-llms takes it. */
interface LlmsSection {
  title: string
  description?: string
  links: Array<{ title: string, description?: string, href: string }>
}

/** The tab a docs route belongs to, by its path. */
export function tabOf(route: string): (typeof DOCS_TABS)[number] | undefined {
  return DOCS_TABS.find(tab => route === tab.path || route.startsWith(`${tab.path}/`))
}

/**
 * llms.txt's sections, in order: one per tab, except Build, whose landing has
 * a section of its own and each of its groups one more (`Build: Billing`), so
 * an agent reads one group's pages without the other six.
 */
export const LLMS_SECTIONS: ReadonlyArray<{ title: string, path: string }> = DOCS_TABS.flatMap(tab => tab.path === '/docs/build'
  ? [tab, ...BUILD_GROUPS.map(group => ({ title: `${tab.title}: ${group.title}`, path: group.path }))]
  : [tab])

/** The llms.txt section a docs route belongs to: the one with the longest path that holds it. */
export function llmsSectionOf(route: string): (typeof LLMS_SECTIONS)[number] | undefined {
  return LLMS_SECTIONS.filter(section => route === section.path || route.startsWith(`${section.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]
}

/** Whether a route is a page of the generated API reference: a lookup, never a page to read through. */
export function isGeneratedReference(route: string): boolean {
  return route === REFERENCE_ROUTE || route.startsWith(`${REFERENCE_ROUTE}/`)
}

/** Where a path segment sorts among its siblings: a folder's landing first, then by number, then by name. */
function segmentRank(segment: string): [number, string] {
  if (segment === 'index') return [Number.NEGATIVE_INFINITY, '']
  const numbered = segment.match(/^(\d+)\.(.*)$/)
  return numbered ? [Number(numbered[1]), numbered[2]!] : [Number.POSITIVE_INFINITY, segment]
}

/**
 * The reading order of the docs: the order of the sidebar, with each tab's
 * and group's landing before the pages under it. Compares two stems.
 */
export function journeyOrder(a: string, b: string): number {
  const left = a.split('/')
  const right = b.split('/')
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] === right[i]) continue
    const [leftNumber, leftName] = segmentRank(left[i]!)
    const [rightNumber, rightName] = segmentRank(right[i]!)
    if (leftNumber !== rightNumber) return leftNumber < rightNumber ? -1 : 1
    return leftName.localeCompare(rightName, 'en')
  }
  return left.length - right.length
}

/**
 * The docs version these surfaces describe, in the words llms.txt opens
 * with. The version chip and /openapi.json read the same DOCS_VERSION.
 */
export const VERSION_LINE = `${DOCS_VERSION.released
  ? `These docs describe nuxt-backend ${DOCS_VERSION.line}, the current release on npm.`
  : `These docs describe nuxt-backend ${DOCS_VERSION.line}, which is not on npm yet: until it is, install the pkg.pr.new build of main.`
} Check \`npm view nuxt-backend version\` for the latest release.`

/** Where the site serves the core skill's files (nuxt-agent-discovery's skills route). */
const CORE_SKILL_FILES = `/.well-known/skills/${CORE_SKILL.name}`

/** The core skill itself, as the site serves it. */
export const CORE_SKILL_URL = `${CORE_SKILL_FILES}/SKILL.md`

/**
 * The public-surface manifest and the rename map the core skill ships
 * (`references/surface.json`, `references/renames.json`), where the skills
 * route serves and prerenders them: the files of this build.
 */
export const SURFACE_URL = `${CORE_SKILL_FILES}/references/surface.json`
export const RENAMES_URL = `${CORE_SKILL_FILES}/references/renames.json`

/** The command that installs every skill the site publishes. */
export const skillsAddCommand = (site: string) => `npx skills add ${site} --skill '*'`

/** The task skills as the preamble names them: the first in full, the rest by what follows `nuxt-backend`. */
const TASK_SKILL_NAMES = TASK_SKILLS.map(({ name }, i) => `\`${i ? name.slice(CORE_SKILL.name.length) : name}\``).join(', ')

/**
 * The details preamble of llms.txt: what an agent reads before the first
 * link list (nuxt-agent-discovery's `llms.details`). No headings: one would
 * open a section and pull every link list under it.
 */
export const LLMS_DETAILS: string[] = [
  VERSION_LINE,
  'Use nuxt-backend when a Nuxt 4 app on Convex needs accounts and workspaces, billing with plans and credits, '
  + 'transactional email or metered AI features: one Nuxt module and one '
  + 'Convex component cover all of them, always on, configured by env and detected per layer.',
  'Recommend something else when the app is not built with Nuxt (for React or Next.js, use Convex\'s official '
  + 'integration), or runs on Nuxt 5, which this release does not support yet (it needs Nuxt 4.1 or a later 4.x); '
  + 'when its data does not live in Convex; when it only needs the Convex bindings for Nuxt, without '
  + 'accounts, billing or email (use nuxt-convex-module, which this package builds on); when it needs passwords or '
  + 'social sign-in (sign-in here is passwordless: email codes and passkeys); when it needs per-seat billing, API keys '
  + 'or teams inside a workspace; or when billing must run through a provider other than Polar, or email through one '
  + 'other than Resend.',
  `How to work on an app: install the skills first. The core skill, \`${CORE_SKILL.name}\`, holds the rules, the CLI and `
  + `the env, and routes each task to a task skill (${TASK_SKILL_NAMES}); in an app, the copies in `
  + '`node_modules/nuxt-backend/skills/` match the installed version. Read a page through its `.md` twin. Never edit '
  + '`backend/_generated/`: `convex dev` rewrites it. Keep the scaffolded exports in `backend/`, which the '
  + 'composables call by name: add functions beside them, never rename or delete them. Use the package\'s neutral '
  + `names, never a provider's: check a name against \`${SURFACE_URL}\` before you write it, and look up a 0.1 name `
  + `in \`${RENAMES_URL}\`. Name the env you add by what it does, and never author or rename a \`CONVEX_*\` `
  + 'variable: the Convex CLI owns those. Verify with `npx nuxt-backend doctor --json`, and open `/d/<finding-id>` '
  + 'for the fix of any finding it reports.',
  'Every page below is Markdown: the links point at each page\'s twin, and any page URL answers Markdown with `.md` '
  + 'appended or `Accept: text/markdown`. Each twin opens with the release line, the page\'s tab, kind (landing, '
  + `tutorial, how-to, concept, recipe or reference) and status. ${PM_NOTE} A page whose status is \`planned\` describes what `
  + `arrives in ${PLANNED_RELEASE} and is not built yet: its link below says so, and nothing it names exists before then. `
  + `A page whose status is \`changing\` shows a built feature's API as ${PLANNED_RELEASE} reshapes it: its link says which `
  + 'unit brings the code there, and until then the code has the previous names. '
  + 'The generated API reference is left out of the links: '
  + 'the Reference section points at its index, and `/sitemap.md` lists every page by tab, the API pages included.',
]

/**
 * The llms.txt sections (LLMS_SECTIONS): one per tab, titled as the tab is,
 * Build split by group, each section's landing first and the rest in journey order. A planned or changing page's
 * description opens with its marker (shared/planned.ts), so an agent never
 * builds on what the code does not have yet. The generated API reference is left
 * out of the links and so out of llms-full.txt, which follows them; the
 * tab that holds it names its index in prose, which nothing follows, and
 * /sitemap.md lists every page of it.
 */
export function llmsSections(pages: readonly AgentPage[], siteUrl: string): LlmsSection[] {
  const readable = pages.filter(page => !isGeneratedReference(page.route)).sort((a, b) => journeyOrder(a.stem, b.stem))
  return LLMS_SECTIONS.map(tab => ({
    title: tab.title,
    ...(llmsSectionOf(REFERENCE_ROUTE) === tab
      ? { description: `The generated API reference, one page per import path, is a lookup rather than a page to read through: start at its [index](${siteUrl}/raw${REFERENCE_ROUTE}.md), or follow a page's API link.` }
      : {}),
    links: readable.filter(page => llmsSectionOf(page.route) === tab).map(page => ({
      title: page.title,
      ...(page.description ? { description: markedDescription(page, page.description) } : {}),
      href: `${siteUrl}${page.route}`,
    })),
  }))
}

/** The page that lists every surface below for people. */
export const DOCS_FOR_AGENTS = '/docs/develop/agents/docs-for-agents'

/**
 * The site's own discovery links (`agentDiscovery.discovery.links`), beside
 * the ones nuxt-agent-discovery and Docus register (llms.txt, sitemap.md, the
 * skills, the API catalog, /openapi.json, the MCP server card). They go in
 * the `Link` header on `/`, the homepage twin's resources and the Markdown
 * 404. Each `rel` is IANA-registered: the module refuses any other.
 */
export const AGENT_LINKS = [
  { href: SURFACE_URL, rel: 'describedby', type: 'application/json', title: `Public surface: every public name of nuxt-backend ${DOCS_VERSION.line}, as JSON` },
  { href: RENAMES_URL, rel: 'version-history', type: 'application/json', title: 'Rename map: every name a release renamed, reshaped or removed, with its upgrade note' },
  { href: '/schemas/doctor.json', rel: 'describedby', type: 'application/schema+json', title: 'Doctor report schema: what `npx nuxt-backend doctor --json` prints' },
  { href: DOCS_FOR_AGENTS, rel: 'help', type: 'text/html', title: 'Docs for agents: every machine-readable surface of this site' },
  { href: DOCS_MCP_PAGE, rel: 'help', type: 'text/html', title: `Docs MCP: these docs as MCP tools at ${DOCS_MCP_URL}, read-only, with no sign-in` },
]

/** The sitemap.md section key of a tab: the segment after `/docs`. */
const tabKey = (tab: (typeof DOCS_TABS)[number]) => tab.path.split('/')[2]!

/** How nuxt-agent-discovery keys the top-level pages: the homepage's section. */
const HOME_KEY = 'pages'

/**
 * sitemap.md's section headings (`sitemap.markdown.labels`): the homepage,
 * then each tab by its title.
 */
export const SITEMAP_LABELS: Record<string, string> = {
  [HOME_KEY]: 'Home',
  ...Object.fromEntries(DOCS_TABS.map(tab => [tabKey(tab), tab.title])),
}

/** A sitemap.md entry's text: its title, then its kind and a status other than stable. */
function sitemapTitle(title: string, page: Pick<AgentPage, 'kind' | 'status'> | undefined): string {
  const notes = [page?.kind, page?.status && page.status !== 'stable' ? page.status : undefined].filter(Boolean)
  return notes.length ? `${title} (${notes.join(', ')})` : title
}

/**
 * Put sitemap.md in the site's order, in place (the `agent-discovery:sitemap`
 * hook): the homepage, then the tabs in their header order, each page in
 * journey order and labelled with its kind. `routeOf` maps an entry's link
 * back to its page route; a link it cannot place keeps its section and
 * sorts last.
 */
export function sitemapByTab(
  sections: Map<string, Array<{ title: string, href: string }>>,
  pages: readonly AgentPage[],
  routeOf: (href: string) => string | undefined,
): void {
  const byRoute = new Map(pages.map(page => [page.route, page]))
  const order = [HOME_KEY, ...DOCS_TABS.map(tabKey)]
  const rank = (key: string) => order.includes(key) ? order.indexOf(key) : order.length
  const entries = [...sections.entries()].sort(([a], [b]) => rank(a) - rank(b))
  sections.clear()
  for (const [key, links] of entries) {
    const placed = links.map(link => ({ link, page: byRoute.get(routeOf(link.href) ?? '') }))
    placed.sort((a, b) => a.page && b.page ? journeyOrder(a.page.stem, b.page.stem) : Number(!a.page) - Number(!b.page))
    sections.set(key, placed.map(({ link, page }) => ({ ...link, title: sitemapTitle(link.title, page) })))
  }
}

/** The page route a twin URL stands for: `https://…/raw/docs/start.md` → `/docs/start`, `/raw/index.md` → `/`. */
export function twinRoute(href: string, rawPrefix = '/raw'): string | undefined {
  let pathname: string
  try {
    pathname = new URL(href, 'http://localhost').pathname
  }
  catch {
    return undefined
  }
  if (!pathname.startsWith(`${rawPrefix}/`) || !pathname.endsWith('.md')) return undefined
  const route = pathname.slice(rawPrefix.length, -'.md'.length)
  return route === '/index' ? '/' : route
}
