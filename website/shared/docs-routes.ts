/**
 * The docs' route table: where every page lives, and where every page the
 * site ever published went.
 *
 * - `content.config.ts` builds the `docs` collection from DOCS_SOURCES.
 * - `nuxt.config.ts` turns DOCS_REDIRECTS into redirects for the HTML route
 *   and both Markdown twins (`<from>.md`, `/raw<from>.md`), adds the
 *   aliases and short links, and builds the llms.txt sections from DOCS_TABS.
 * - The TypeDoc post-processor (scripts/typedoc-postprocess.mjs) writes the
 *   reference at REFERENCE_DIR and links it at REFERENCE_ROUTE.
 * - test/docs/docs-structure.test.ts holds it to its promises: every route
 *   the site served in 0.1 answers, every target exists, no redirect leads to
 *   another, and the pending list only shrinks.
 *
 * No imports, so plain Node (the post-processor) can load it as well as Nuxt.
 */

/** Where the generated API reference is served, until the docs move under /docs. */
export const REFERENCE_ROUTE = '/api-reference/reference'

/** The folder TypeDoc writes it to, under website/content: already its final place. */
export const REFERENCE_DIR = 'docs/10.reference/10.api'

/**
 * The `docs` collection's sources, relative to website/content. A file's
 * route is the source prefix plus its path below the include's fixed part,
 * with the numeric `N.` ordering prefixes dropped.
 */
export const DOCS_SOURCES: Array<{ include: string, exclude?: string[], prefix: string }> = [
  // The generated reference stays at its route until its tab moves (D2b).
  { include: `${REFERENCE_DIR}/**`, prefix: REFERENCE_ROUTE },
  // The tabs that have moved under /docs.
  { include: 'docs/**', exclude: ['docs/10.reference/**'], prefix: '/docs' },
  // The 0.1 tree, until the rest of the tabs move (D2b).
  { include: '**', exclude: ['index.md', 'docs/**'], prefix: '/' },
]

/** The top-level sections, in order: llms.txt has one section per tab. */
export const DOCS_TABS: Array<{ title: string, path: string, exclude?: string }> = [
  { title: 'Start', path: '/docs/start' },
  { title: 'Auth', path: '/docs/auth' },
  { title: 'Billing', path: '/docs/billing' },
  { title: 'Email', path: '/docs/email' },
  { title: 'AI', path: '/docs/ai' },
  { title: 'Agents', path: '/docs/agents' },
  { title: 'Getting Started', path: '/getting-started' },
  { title: 'Guide', path: '/guide' },
  { title: 'Platform', path: '/platform' },
  { title: 'Developer Experience', path: '/tooling' },
  { title: 'Production', path: '/production' },
  { title: 'API Reference', path: '/api-reference', exclude: REFERENCE_ROUTE },
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

/** What a reference page was called before it was named by its import path. */
const reference = (from: string, to: string): DocsRedirect =>
  ({ from: `${REFERENCE_ROUTE}/${from}`, to: `${REFERENCE_ROUTE}/${to}` })

export const DOCS_REDIRECTS: DocsRedirect[] = [
  // The 0.1 pages that moved under /docs, the legacy moves, the 0.1 section roots.
  { from: '/agents/built-in-tools', to: '/docs/agents/mcp/built-in-tools' },
  { from: '/agents/connect-a-client', to: '/docs/agents/mcp/connect-a-client' },
  { from: '/agents/custom-tools', to: '/docs/agents/mcp/custom-tools' },
  { from: '/agents/mcp-server', to: '/docs/agents/mcp' },
  { from: '/agents/oauth-and-consent', to: '/docs/agents/mcp/oauth-and-consent' },
  { from: '/agents/skills-and-agent-files', to: '/docs/agents/coding' },
  { from: '/getting-started/architecture', to: '/docs/start/concepts/how-it-works' },
  { from: '/getting-started/installation', to: '/docs/start/installation' },
  { from: '/getting-started/introduction', to: '/docs/start' },
  { from: '/getting-started/quickstart', to: '/docs/start/quickstart' },
  { from: '/getting-started/templates', to: '/docs/start/templates' },
  { from: '/guide/authentication', to: '/docs/auth/sign-in' },
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
  { from: '/platform/overview', to: '/docs/start/concepts/how-it-works' },
  { from: '/platform/workspaces', to: '/docs/auth/workspaces' },
  { from: '/tooling/devtools', to: '/docs/start/develop/devtools' },
  { from: '/backend-components/overview', to: '/docs/start/concepts/how-it-works' },
  { from: '/backend-components/email', to: '/docs/email/sending' },
  { from: '/backend-components/billing', to: '/docs/billing/subscriptions' },
  { from: '/backend-components/webhooks', to: '/platform/webhooks' },
  { from: '/backend-components/rate-limiting', to: '/platform/rate-limiting' },
  { from: '/backend-components/workflows', to: '/platform/workflows' },
  { from: '/backend-components/migrations', to: '/platform/migrations' },
  { from: '/backend-components/aggregates', to: '/platform/aggregates' },
  { from: '/backend-components/search', to: '/platform/search' },
  { from: '/backend-components', to: '/docs/start/concepts/how-it-works' },
  { from: '/backend/auth-setup', to: '/docs/auth/setup' },
  { from: '/backend/customizing-auth', to: '/docs/auth/setup#auth-route-and-options' },
  { from: '/backend/local-installation', to: '/tooling/local-installation' },
  { from: '/backend/testing', to: '/tooling/testing' },
  { from: '/backend', to: '/docs/auth/setup' },
  { from: '/api-reference/theming', to: '/guide/customization' },
  { from: '/getting-started/examples-and-templates', to: '/docs/start/templates' },
  { from: '/getting-started', to: '/docs/start' },
  { from: '/guide', to: '/docs/auth/sign-in', pending: 'D3 (landings)' },
  { from: '/platform', to: '/docs/start/concepts/how-it-works' },
  { from: '/platform/auth', to: '/docs/auth/setup', pending: 'D3 (landings)' },
  { from: '/platform/billing', to: '/docs/billing/subscriptions', pending: 'D3 (landings)' },
  { from: '/platform/ai', to: '/docs/ai/metered-actions', pending: 'D3 (landings)' },
  { from: '/platform/email', to: '/docs/email/sending', pending: 'D3 (landings)' },
  { from: '/agents', to: '/docs/agents/mcp', pending: 'D3 (landings)' },
  { from: '/tooling', to: '/tooling/cli', pending: 'D3 (landings)' },
  { from: '/production', to: '/production/deployment', pending: 'D3 (landings)' },
  { from: '/api-reference', to: '/api-reference/composables', pending: 'D3 (landings)' },

  // Folder routes under /docs, until each gets its landing.
  { from: '/docs', to: '/docs/start' },
  { from: '/docs/agents', to: '/docs/agents/mcp', pending: 'D3 (landings)' },
  { from: '/docs/ai', to: '/docs/ai/metered-actions', pending: 'D3 (landings)' },
  { from: '/docs/auth', to: '/docs/auth/setup', pending: 'D3 (landings)' },
  { from: '/docs/auth/access', to: '/docs/auth/access/roles', pending: 'D3 (landings)' },
  { from: '/docs/billing', to: '/docs/billing/catalog', pending: 'D3 (landings)' },
  { from: '/docs/email', to: '/docs/email/sending', pending: 'D3 (landings)' },
  { from: '/docs/start/concepts', to: '/docs/start/concepts/how-it-works', pending: 'D3 (landings)' },
  { from: '/docs/start/develop', to: '/docs/start/develop/devtools', pending: 'D3 (landings)' },

  // The reference, renamed from source paths to import paths.
  reference('convex/app', 'app'),
  reference('convex/auth.config', 'auth-config'),
  reference('convex/client', 'auth'),
  reference('convex/components/backend/ai', 'component-ai'),
  reference('convex/components/backend/billing', 'component-billing'),
  reference('convex/components/backend/convex.config', 'convex-config'),
  reference('convex/components/backend/email', 'component-email'),
  reference('convex/components/backend/gifts', 'component-gifts'),
  reference('convex/components/backend/schema', 'component-schema'),
  reference('convex/components/backend/webhooks', 'component-webhooks'),
  reference('convex/integrations/aggregate', 'aggregate'),
  reference('convex/integrations/ai', 'ai'),
  reference('convex/integrations/authorization', 'authorization'),
  reference('convex/integrations/billing', 'billing'),
  reference('convex/integrations/email', 'email'),
  reference('convex/integrations/functions', 'functions'),
  reference('convex/integrations/http', 'http'),
  reference('convex/integrations/migrations', 'migrations'),
  reference('convex/integrations/rate-limit', 'rate-limit'),
  reference('convex/integrations/search', 'search'),
  reference('convex/integrations/workflows', 'workflows'),
  reference('runtime/server/mcp', 'mcp'),
  reference('runtime/vue/composables/use-aggregate', 'use-aggregate'),
  reference('runtime/vue/composables/use-ai-stream', 'use-ai-stream'),
  reference('runtime/vue/composables/use-auth', 'use-auth'),
  reference('runtime/vue/composables/use-backend-config', 'use-backend-config'),
  reference('runtime/vue/composables/use-billing', 'use-billing'),
  reference('runtime/vue/composables/use-credits', 'use-credits'),
  reference('runtime/vue/composables/use-email-status', 'use-email-status'),
  reference('runtime/vue/composables/use-features', 'use-features'),
  reference('runtime/vue/composables/use-gifts', 'use-gifts'),
  reference('runtime/vue/composables/use-login-flow', 'use-login-flow'),
  reference('runtime/vue/composables/use-orders', 'use-orders'),
  reference('runtime/vue/composables/use-organization', 'use-organization'),
  reference('runtime/vue/composables/use-passkeys', 'use-passkeys'),
  reference('runtime/vue/composables/use-sandbox-inbox', 'use-sandbox-inbox'),
  reference('runtime/vue/composables/use-search', 'use-search'),
  reference('runtime/vue/composables/use-sessions', 'use-sessions'),
  reference('runtime/vue/composables/use-usage', 'use-usage'),
  reference('runtime/vue/composables/use-workflow', 'use-workflow'),
]

/** Guessable short URLs, always temporary: a page they name can move. */
export const DOCS_ALIASES: Record<string, string> = {
  '/install': '/docs/start/installation',
  '/quickstart': '/docs/start/quickstart',
  '/cli': '/tooling/cli',
  '/doctor': '/tooling/cli#doctor',
  '/reference': REFERENCE_ROUTE,
}

/**
 * Links the CLI, DevTools and thrown errors print: `/d/<finding-id>` and
 * `/e/<error-code>`. Every id lands on the same interim anchor until its page
 * has one anchor per id.
 */
export const DOCS_SHORT_LINKS: Array<{ from: string, to: string, pending: string }> = [
  { from: '/d/**', to: '/tooling/cli#findings', pending: 'D6 (a Diagnostics page, one anchor per finding)' },
  { from: '/e/**', to: '/production/troubleshooting', pending: 'D6 (an Errors page, one anchor per code)' },
]

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
