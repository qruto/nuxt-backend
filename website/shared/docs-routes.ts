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
  { include: '**', exclude: ['index.md', 'docs/**'], prefix: '/' },
  { include: `${REFERENCE_DIR}/**`, prefix: REFERENCE_ROUTE },
]

/** The top-level sections, in order: llms.txt has one section per tab. */
export const DOCS_TABS: Array<{ title: string, path: string, exclude?: string }> = [
  { title: 'Getting Started', path: '/getting-started' },
  { title: 'Guide', path: '/guide' },
  { title: 'Platform', path: '/platform' },
  { title: 'Agents', path: '/agents' },
  { title: 'Developer Experience', path: '/tooling' },
  { title: 'Production', path: '/production' },
  // The generated reference is too long for the index; llms-full.txt has it.
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
  // The pre-`platform/` docs tree, and pages renamed since.
  { from: '/backend-components/overview', to: '/platform/overview' },
  { from: '/backend-components/email', to: '/platform/email/sending' },
  { from: '/backend-components/billing', to: '/platform/billing/subscriptions' },
  { from: '/backend-components/webhooks', to: '/platform/webhooks' },
  { from: '/backend-components/rate-limiting', to: '/platform/rate-limiting' },
  { from: '/backend-components/workflows', to: '/platform/workflows' },
  { from: '/backend-components/migrations', to: '/platform/migrations' },
  { from: '/backend-components/aggregates', to: '/platform/aggregates' },
  { from: '/backend-components/search', to: '/platform/search' },
  { from: '/backend-components', to: '/platform/overview' },
  { from: '/backend/auth-setup', to: '/platform/auth/setup' },
  { from: '/backend/customizing-auth', to: '/platform/auth/customizing' },
  { from: '/backend/local-installation', to: '/tooling/local-installation' },
  { from: '/backend/testing', to: '/tooling/testing' },
  { from: '/backend', to: '/platform/auth/setup' },
  { from: '/api-reference/theming', to: '/guide/customization' },
  { from: '/getting-started/examples-and-templates', to: '/getting-started/templates' },

  // Section roots answer with their first page until each tab gets a landing.
  { from: '/getting-started', to: '/getting-started/introduction', pending: 'D3 (tab landings)' },
  { from: '/guide', to: '/guide/authentication', pending: 'D3 (tab landings)' },
  { from: '/platform', to: '/platform/overview', pending: 'D3 (tab landings)' },
  { from: '/platform/auth', to: '/platform/auth/setup', pending: 'D3 (tab landings)' },
  { from: '/platform/billing', to: '/platform/billing/subscriptions', pending: 'D3 (tab landings)' },
  { from: '/platform/ai', to: '/platform/ai/metered-actions', pending: 'D3 (tab landings)' },
  { from: '/platform/email', to: '/platform/email/sending', pending: 'D3 (tab landings)' },
  { from: '/agents', to: '/agents/mcp-server', pending: 'D3 (tab landings)' },
  { from: '/tooling', to: '/tooling/cli', pending: 'D3 (tab landings)' },
  { from: '/production', to: '/production/deployment', pending: 'D3 (tab landings)' },
  { from: '/api-reference', to: '/api-reference/composables', pending: 'D3 (tab landings)' },

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
  '/install': '/getting-started/installation',
  '/quickstart': '/getting-started/quickstart',
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
