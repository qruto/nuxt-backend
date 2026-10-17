/**
 * The docs' route table: where every page lives, and where every page the
 * site ever published went.
 *
 * - `content.config.ts` builds the `docs` collection from DOCS_SOURCES.
 * - `nuxt.config.ts` turns DOCS_REDIRECTS into redirects for the HTML route
 *   and both Markdown twins (`<from>.md`, `/raw<from>.md`), adds the
 *   aliases and short links, and builds the llms.txt sections from DOCS_TABS.
 * - `plugins/docs-fragments.client.ts` sends the old anchors in
 *   DOCS_FRAGMENT_MOVES to the page their section moved to.
 * - The TypeDoc post-processor (scripts/typedoc-postprocess.mjs) writes the
 *   reference at REFERENCE_DIR and links it at REFERENCE_ROUTE.
 * - test/docs/docs-structure.test.ts holds it to its promises: every route
 *   the site served in 0.1 answers, every target exists, no redirect leads to
 *   another, every folder route answers, and the pending list only shrinks.
 *
 * No imports, so plain Node (the post-processor) can load it as well as Nuxt.
 */

/** Where the generated API reference is served. */
export const REFERENCE_ROUTE = '/docs/reference/api'

/** The folder TypeDoc writes it to, under website/content. */
export const REFERENCE_DIR = 'docs/10.reference/10.api'

/**
 * The `docs` collection's sources, relative to website/content. A file's
 * route is the source prefix plus its path below the include's fixed part,
 * with the numeric `N.` ordering prefixes dropped. (The homepage,
 * content/index.md, is Docus's `landing` collection.)
 */
export const DOCS_SOURCES: Array<{ include: string, exclude?: string[], prefix: string }> = [
  { include: 'docs/**', prefix: '/docs' },
]

/** The ten tabs, in order: the header shows them, and llms.txt has one section each. */
export const DOCS_TABS: Array<{ title: string, path: string, exclude?: string }> = [
  { title: 'Start', path: '/docs/start' },
  { title: 'Auth', path: '/docs/auth' },
  { title: 'Billing', path: '/docs/billing' },
  { title: 'Email', path: '/docs/email' },
  { title: 'AI', path: '/docs/ai' },
  { title: 'Agents', path: '/docs/agents' },
  { title: 'Data', path: '/docs/data' },
  { title: 'UI', path: '/docs/ui' },
  { title: 'Ship', path: '/docs/ship' },
  // The generated API reference is too long for the index; llms-full.txt has it.
  { title: 'Reference', path: '/docs/reference', exclude: REFERENCE_ROUTE },
]

export interface DocsRedirect {
  from: string
  /** The page it lands on, with an optional `#anchor`. */
  to: string
  /**
   * The final home arrives in a later pull request, named here. Until then
   * `to` is interim and the redirect temporary (302), so nothing caches it.
   */
  pending?: string
}

/**
 * The reference pages by their 0.1 source path, and the import-path slug
 * each is published under. Both routes it was served at before /docs (the
 * 0.1 nested one, and the flat one by import path) redirect.
 */
const REFERENCE_SLUGS: Record<string, string> = {
  'convex/app': 'app',
  'convex/auth.config': 'auth-config',
  'convex/client': 'auth',
  'convex/components/backend/convex.config': 'convex-config',
  'convex/integrations/aggregate': 'aggregate',
  'convex/integrations/ai': 'ai',
  'convex/integrations/authorization': 'authorization',
  'convex/integrations/billing': 'billing',
  'convex/integrations/email': 'email',
  'convex/integrations/functions': 'functions',
  'convex/integrations/http': 'http',
  'convex/integrations/migrations': 'migrations',
  'convex/integrations/rate-limit': 'rate-limit',
  'convex/integrations/search': 'search',
  'convex/integrations/workflows': 'workflows',
  'runtime/server/mcp': 'mcp',
  'runtime/vue/composables/use-aggregate': 'use-aggregate',
  'runtime/vue/composables/use-ai-stream': 'use-ai-stream',
  'runtime/vue/composables/use-auth': 'use-auth',
  'runtime/vue/composables/use-backend-config': 'use-backend-config',
  'runtime/vue/composables/use-billing': 'use-billing',
  'runtime/vue/composables/use-credits': 'use-credits',
  'runtime/vue/composables/use-email-change': 'use-email-change',
  'runtime/vue/composables/use-email-status': 'use-email-status',
  'runtime/vue/composables/use-features': 'use-features',
  'runtime/vue/composables/use-gifts': 'use-gifts',
  'runtime/vue/composables/use-login-flow': 'use-login-flow',
  'runtime/vue/composables/use-orders': 'use-orders',
  'runtime/vue/composables/use-organization': 'use-organization',
  'runtime/vue/composables/use-passkeys': 'use-passkeys',
  'runtime/vue/composables/use-sandbox-inbox': 'use-sandbox-inbox',
  'runtime/vue/composables/use-search': 'use-search',
  'runtime/vue/composables/use-sessions': 'use-sessions',
  'runtime/vue/composables/use-usage': 'use-usage',
  'runtime/vue/composables/use-workflow': 'use-workflow',
  'eslint': 'eslint',
  'module': 'module',
}

/**
 * Reference pages that are gone: the component's schema and function modules,
 * public only while the local installation re-exported them. Both of their
 * old routes land on the page that lists the component's functions.
 */
const RETIRED_REFERENCE_SLUGS: Record<string, string> = {
  'convex/components/backend/ai': 'component-ai',
  'convex/components/backend/billing': 'component-billing',
  'convex/components/backend/email': 'component-email',
  'convex/components/backend/gifts': 'component-gifts',
  'convex/components/backend/schema': 'component-schema',
  'convex/components/backend/webhooks': 'component-webhooks',
}

const COMPONENT_PAGE = '/docs/reference/backend/component'

const OLD_REFERENCE = '/api-reference/reference'

export const DOCS_REDIRECTS: DocsRedirect[] = [
  // Every 0.1 page, the legacy moves before it, and the 0.1 section roots.
  { from: '/agents/built-in-tools', to: '/docs/agents/mcp/built-in-tools' },
  { from: '/agents/connect-a-client', to: '/docs/agents/mcp/connect-a-client' },
  { from: '/agents/custom-tools', to: '/docs/agents/mcp/custom-tools' },
  { from: '/agents/mcp-server', to: '/docs/agents/mcp' },
  { from: '/agents/oauth-and-consent', to: '/docs/agents/mcp/oauth-and-consent' },
  { from: '/agents/skills-and-agent-files', to: '/docs/agents/coding' },
  { from: '/api-reference/client', to: '/docs/reference/nuxt/client' },
  { from: '/api-reference/composables', to: '/docs/reference/nuxt/composables' },
  { from: '/api-reference/entrypoints', to: '/docs/reference/entrypoints' },
  { from: '/api-reference/module-options', to: '/docs/reference/configuration/module-options' },
  { from: '/api-reference/server-utilities', to: '/docs/reference/nuxt/server-utilities' },
  { from: '/getting-started/architecture', to: '/docs/start/concepts/how-it-works' },
  { from: '/getting-started/configuration', to: '/docs/reference/configuration' },
  { from: '/getting-started/ecosystem', to: '/docs/reference/ecosystem' },
  { from: '/getting-started/installation', to: '/docs/start/installation' },
  { from: '/getting-started/introduction', to: '/docs/start' },
  { from: '/getting-started/quickstart', to: '/docs/start/quickstart' },
  { from: '/getting-started/templates', to: '/docs/start/templates' },
  { from: '/guide/authentication', to: '/docs/auth/sign-in' },
  { from: '/guide/customization', to: '/docs/ui/customize' },
  { from: '/guide/default-pages', to: '/docs/ui/pages' },
  { from: '/guide/file-storage', to: '/docs/data/files' },
  { from: '/guide/import-aliases', to: '/docs/reference/nuxt/import-aliases' },
  { from: '/guide/queries-and-mutations', to: '/docs/data/queries-and-mutations' },
  { from: '/guide/server-and-ssr', to: '/docs/data/server-rendering' },
  { from: '/platform/aggregates', to: '/docs/data/aggregates' },
  { from: '/platform/ai/metered-actions', to: '/docs/ai/metered-actions' },
  { from: '/platform/ai/streaming', to: '/docs/ai/streaming' },
  { from: '/platform/auth/customizing', to: '/docs/auth/setup#auth-route-and-options' },
  { from: '/platform/auth/setup', to: '/docs/auth/setup' },
  { from: '/platform/authorization', to: '/docs/auth/access/roles' },
  { from: '/platform/billing/catalog-as-code', to: '/docs/billing/catalog' },
  { from: '/platform/billing/credits-and-top-ups', to: '/docs/billing/credits' },
  { from: '/platform/billing/feature-gating', to: '/docs/billing/feature-gating' },
  { from: '/platform/billing/gifts', to: '/docs/billing/credits/gifts' },
  { from: '/platform/billing/subscriptions', to: '/docs/billing/subscriptions' },
  { from: '/platform/email/delivery-tracking', to: '/docs/email/delivery-tracking' },
  { from: '/platform/email/sending', to: '/docs/email/sending' },
  { from: '/platform/email/templates', to: '/docs/email/templates' },
  { from: '/platform/migrations', to: '/docs/data/jobs/migrations' },
  { from: '/platform/overview', to: '/docs/start/concepts/how-it-works' },
  { from: '/platform/rate-limiting', to: '/docs/ship/production/rate-limits' },
  { from: '/platform/search', to: '/docs/data/search' },
  { from: '/platform/webhooks', to: '/docs/ship/production/webhooks' },
  { from: '/platform/workflows', to: '/docs/data/jobs/workflows' },
  { from: '/platform/workspaces', to: '/docs/auth/workspaces' },
  { from: '/production/checklist', to: '/docs/ship/production' },
  { from: '/production/deployment', to: '/docs/ship/deploy' },
  { from: '/production/security', to: '/docs/ship/production/security' },
  { from: '/production/troubleshooting', to: '/docs/ship/operate/troubleshooting' },
  { from: '/tooling/cli', to: '/docs/reference/cli' },
  { from: '/tooling/devtools', to: '/docs/start/develop/devtools' },
  { from: '/tooling/linting', to: '/docs/ship/test/linting' },
  { from: '/tooling/local-installation', to: '/docs/ship/migrate/upgrade#local-installation-is-gone' },
  { from: '/tooling/testing', to: '/docs/ship/test' },
  { from: '/backend-components/overview', to: '/docs/start/concepts/how-it-works' },
  { from: '/backend-components/email', to: '/docs/email/sending' },
  { from: '/backend-components/billing', to: '/docs/billing/subscriptions' },
  { from: '/backend-components/webhooks', to: '/docs/ship/production/webhooks' },
  { from: '/backend-components/rate-limiting', to: '/docs/ship/production/rate-limits' },
  { from: '/backend-components/workflows', to: '/docs/data/jobs/workflows' },
  { from: '/backend-components/migrations', to: '/docs/data/jobs/migrations' },
  { from: '/backend-components/aggregates', to: '/docs/data/aggregates' },
  { from: '/backend-components/search', to: '/docs/data/search' },
  { from: '/backend-components', to: '/docs/start/concepts/how-it-works' },
  { from: '/backend/auth-setup', to: '/docs/auth/setup' },
  { from: '/backend/customizing-auth', to: '/docs/auth/setup#auth-route-and-options' },
  { from: '/backend/local-installation', to: '/docs/ship/migrate/upgrade#local-installation-is-gone' },
  { from: '/backend/testing', to: '/docs/ship/test' },
  { from: '/backend', to: '/docs/auth/setup' },
  { from: '/api-reference/theming', to: '/docs/ui/customize/theming' },
  { from: '/getting-started/examples-and-templates', to: '/docs/start/templates' },
  { from: '/agents', to: '/docs/agents' },
  { from: '/api-reference', to: '/docs/reference' },
  { from: '/getting-started', to: '/docs/start' },
  { from: '/guide', to: '/docs/data' },
  { from: '/platform', to: '/docs/start/concepts/how-it-works' },
  { from: '/platform/ai', to: '/docs/ai' },
  { from: '/platform/auth', to: '/docs/auth' },
  { from: '/platform/billing', to: '/docs/billing' },
  { from: '/platform/email', to: '/docs/email' },
  { from: '/production', to: '/docs/ship' },
  { from: '/tooling', to: '/docs/start/develop/devtools', pending: 'a landing page of its own' },

  // Folder routes under /docs, until each gets its landing.
  { from: '/docs', to: '/docs/start' },
  { from: '/docs/data/jobs', to: '/docs/data/jobs/workflows', pending: 'a landing page of its own' },
  { from: '/docs/reference/backend', to: '/docs/reference/backend/component', pending: 'a landing page of its own' },
  { from: '/docs/reference/nuxt', to: '/docs/reference/nuxt/composables', pending: 'a landing page of its own' },
  { from: '/docs/ship/migrate', to: '/docs/ship/migrate/upgrade', pending: 'a landing page of its own' },
  { from: '/docs/ship/operate', to: '/docs/ship/operate/troubleshooting', pending: 'a landing page of its own' },
  { from: '/docs/ship/releases', to: '/docs/ship/releases/changelog', pending: 'a landing page of its own' },
  { from: '/docs/start/concepts', to: '/docs/start/concepts/how-it-works', pending: 'a landing page of its own' },
  { from: '/docs/start/develop', to: '/docs/start/develop/devtools', pending: 'a landing page of its own' },

  // The generated reference.
  { from: OLD_REFERENCE, to: REFERENCE_ROUTE },
  ...Object.entries(REFERENCE_SLUGS).flatMap(([source, slug]) => [
    { from: `${OLD_REFERENCE}/${source}`, to: `${REFERENCE_ROUTE}/${slug}` },
    ...(source === slug ? [] : [{ from: `${OLD_REFERENCE}/${slug}`, to: `${REFERENCE_ROUTE}/${slug}` }]),
  ]),
  ...Object.entries(RETIRED_REFERENCE_SLUGS).flatMap(([source, slug]) => [
    { from: `${OLD_REFERENCE}/${source}`, to: COMPONENT_PAGE },
    { from: `${OLD_REFERENCE}/${slug}`, to: COMPONENT_PAGE },
  ]),
]

/** Guessable short URLs, always temporary: a page they name can move. */
export const DOCS_ALIASES: Record<string, string> = {
  '/install': '/docs/start/installation',
  '/quickstart': '/docs/start/quickstart',
  '/cli': '/docs/reference/cli',
  '/doctor': '/docs/reference/cli#doctor',
  '/reference': REFERENCE_ROUTE,
  '/docs/workspaces': '/docs/auth/workspaces',
  '/docs/credits': '/docs/billing/credits',
  '/docs/files': '/docs/data/files',
  '/docs/mcp': '/docs/agents/mcp',
  '/docs/composables': '/docs/reference/nuxt/composables',
  '/docs/cli': '/docs/reference/cli',
  '/docs/devtools': '/docs/start/develop/devtools',
  '/docs/testing': '/docs/ship/test',
  '/docs/deploy': '/docs/ship/deploy',
  '/docs/api': REFERENCE_ROUTE,
  '/docs/upgrade': '/docs/ship/migrate/upgrade',
  '/docs/changelog': '/docs/ship/releases/changelog',
  '/changelog': '/docs/ship/releases/changelog',
  '/docs/stability': '/docs/ship/releases/stability',
}

/** Where the error catalog is documented, one anchor per code. */
const ERRORS_PAGE = '/docs/reference/backend/errors'

/**
 * The error codes `BACKEND_ERRORS` (src/convex/errors.ts) holds, spelled out
 * here because this file imports nothing. test/unit/error-catalog.test.ts
 * keeps the two lists equal.
 */
export const ERROR_CODES = [
  'unauthenticated',
  'forbidden',
  'no_workspace',
  'rate_limited',
  'insufficient_credits',
  'invalid_input',
  'not_ready',
  'unavailable',
] as const

/**
 * Links the CLI, DevTools and thrown errors print: `/d/<finding-id>` and
 * `/e/<error-code>`. A finding lands on an interim anchor until its page has
 * one per id; an error code lands on its own entry, and an unknown one on the
 * catalog.
 */
export const DOCS_SHORT_LINKS: Array<{ from: string, to: string, pending?: string }> = [
  { from: '/d/**', to: '/docs/reference/cli#findings', pending: 'D6 (a Diagnostics page, one anchor per finding)' },
  ...ERROR_CODES.map(code => ({ from: `/e/${code}`, to: `${ERRORS_PAGE}#${code}` })),
  { from: '/e/**', to: ERRORS_PAGE },
]

/**
 * Old anchors whose section moved to another page, keyed by the page the old
 * route now redirects to: `<page>#<old anchor>` → `<new page>#<anchor>`.
 * A redirect keeps the fragment, so the moved page loads with the old anchor
 * and the client plugin finishes the trip.
 */
export const DOCS_FRAGMENT_MOVES: Record<string, string> = {
  // AI: limits and budgets have a page of their own.
  '/docs/ai/metered-actions#rate-limits': '/docs/ai/costs#limit-calls',
  // Auth › Access: the function builders have a page of their own.
  '/docs/auth/access/roles#pre-authorized-function-builders': '/docs/auth/access/functions',
  // Email: one task per page.
  '/docs/email/sending#sandbox-inbox': '/docs/email/sandbox-inbox',
  '/docs/email/sending#sequences-and-workflows': '/docs/email/engagement/sequences',
  '/docs/email/sending#marketing': '/docs/email/engagement/marketing',
  '/docs/data/jobs/workflows#welcome-email-flow': '/docs/email/engagement/sequences#start-it-on-sign-up',
  // Billing: one task per page.
  '/docs/billing/subscriptions#checkout-portal-plan-changes': '/docs/billing/subscriptions/checkout',
  '/docs/billing/subscriptions#order-history-and-invoices': '/docs/billing/subscriptions/orders',
  '/docs/billing/credits#spending-on-the-server': '/docs/billing/credits/spending',
  '/docs/billing/credits#reserve-run-settle': '/docs/billing/credits/spending#reserve-run-settle',
  '/docs/billing/credits#sum-meters-vs-count-meters': '/docs/billing/credits/spending#sum-meters-vs-count-meters',
  // UI › Customize became one page per rung.
  '/docs/ui/customize#_1-css-tokens': '/docs/ui/customize/theming',
  '/docs/ui/customize#the---bk--tokens': '/docs/ui/customize/theming#the---bk--tokens',
  '/docs/ui/customize#data--families': '/docs/ui/customize/theming#data--families',
  '/docs/ui/customize#packaging': '/docs/ui/customize/theming#packaging',
  '/docs/ui/customize#_2-appconfig-content': '/docs/ui/customize/labels',
  '/docs/ui/customize#_3-slots': '/docs/ui/customize/slots',
  '/docs/ui/customize#props-and-emits': '/docs/ui/customize/slots#props-and-emits',
  '/docs/ui/customize#_4-route-shadowing': '/docs/ui/customize/replace-pages',
  '/docs/ui/customize#_5-composables': '/docs/ui/customize/replace-pages#build-from-composables',
  // Configuration became an orientation page: its sections have pages of their own.
  '/docs/reference/configuration#module-options': '/docs/reference/configuration/module-options#options',
  '/docs/reference/configuration#runtime-config': '/docs/reference/configuration/module-options#runtime-config',
  '/docs/reference/configuration#environment-variables': '/docs/reference/configuration/environment-variables',
  '/docs/reference/configuration#app-variables': '/docs/reference/configuration/environment-variables#app-variables',
  '/docs/reference/configuration#convex-deployment-variables': '/docs/reference/configuration/environment-variables#convex-deployment-variables',
  '/docs/reference/configuration#setting-them': '/docs/reference/configuration/environment-variables#setting-them',
  '/docs/reference/configuration#changing-the-auth-route': '/docs/auth/setup#auth-route-and-options',
}

type RedirectRule = { redirect: { to: string, statusCode: 301 | 302 } }

/** A route's Markdown twins: what an agent fetches instead of the HTML. */
const twins = (route: string): [string, string] => [`${route}.md`, `/raw${route}.md`]

/**
 * Nitro route rules for every redirect, alias and short link: the HTML route
 * and both twins, each pointing straight at its target (a twin drops the
 * anchor, which means nothing in raw Markdown).
 */
export function docsRedirectRules(): Record<string, RedirectRule> {
  const rules: Record<string, RedirectRule> = {}
  const add = (from: string, to: string, statusCode: 301 | 302) => {
    rules[from] = { redirect: { to, statusCode } }
    const page = to.split('#')[0]!
    const [md, raw] = twins(from)
    const [mdTo, rawTo] = twins(page)
    rules[md] = { redirect: { to: mdTo, statusCode } }
    rules[raw] = { redirect: { to: rawTo, statusCode } }
  }
  for (const { from, to, pending } of DOCS_REDIRECTS) add(from, to, pending ? 302 : 301)
  for (const [from, to] of Object.entries(DOCS_ALIASES)) add(from, to, 302)
  for (const { from, to } of DOCS_SHORT_LINKS) rules[from] = { redirect: { to, statusCode: 302 } }
  return rules
}
