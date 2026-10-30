/**
 * The docs' route table: where every page lives, and where every page the
 * site ever published went.
 *
 * - `content.config.ts` builds the `docs` collection from DOCS_SOURCES.
 * - `nuxt.config.ts` turns DOCS_REDIRECTS into route rules for the HTML
 *   route, adds the aliases and short links, and
 *   server/middleware/docs-twin-redirects.ts redirects both Markdown twins
 *   (`<from>.md`, `/raw<from>.md`); shared/agent-surfaces.ts builds the llms.txt
 *   sections from DOCS_TABS.
 * - `plugins/docs-fragments.client.ts` sends the old anchors in
 *   DOCS_FRAGMENT_MOVES (shared/docs-fragment-moves.ts, a module of its own
 *   so the browser loads it only for a URL with a fragment) to the page
 *   their section moved to.
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

/** The six tabs, in order: the header shows them, and llms.txt has one section each (Build one per group, BUILD_GROUPS). */
export const DOCS_TABS: Array<{ title: string, path: string }> = [
  { title: 'Start', path: '/docs/start' },
  { title: 'Services', path: '/docs/services' },
  { title: 'Develop', path: '/docs/develop' },
  { title: 'Build', path: '/docs/build' },
  { title: 'Ship', path: '/docs/ship' },
  // The generated API reference under it is left out of llms.txt's links and
  // so out of llms-full.txt (shared/agent-surfaces.ts); /sitemap.md lists it.
  { title: 'Reference', path: '/docs/reference' },
]

/** Build's groups, in the sidebar's order: llms.txt gives each a section of its own. */
export const BUILD_GROUPS: Array<{ title: string, path: string }> = [
  { title: 'Auth & accounts', path: '/docs/build/auth' },
  { title: 'Billing', path: '/docs/build/billing' },
  { title: 'Email & notifications', path: '/docs/build/email' },
  { title: 'AI', path: '/docs/build/ai' },
  { title: 'Data & files', path: '/docs/build/data' },
  { title: 'Growth', path: '/docs/build/growth' },
  { title: 'UI', path: '/docs/build/ui' },
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
  'convex/integrations/ai': 'ai',
  'convex/integrations/billing': 'billing',
  'convex/integrations/email': 'email',
  'convex/integrations/functions': 'functions',
  'convex/integrations/http': 'http',
  'convex/integrations/rate-limit': 'rate-limit',
  'convex/integrations/search': 'search',
  'convex/integrations/workflows': 'workflows',
  'runtime/vue/composables/use-ai-stream': 'use-ai-stream',
  'runtime/vue/composables/use-auth': 'use-auth',
  'runtime/vue/composables/use-backend-config': 'use-backend-config',
  'runtime/vue/composables/use-billing': 'use-billing',
  'runtime/vue/composables/use-campaign': 'use-campaign',
  'runtime/vue/composables/use-credits': 'use-credits',
  'runtime/vue/composables/use-email-change': 'use-email-change',
  'runtime/vue/composables/use-email-status': 'use-email-status',
  'runtime/vue/composables/use-features': 'use-features',
  'runtime/vue/composables/use-gifts': 'use-gifts',
  'runtime/vue/composables/use-login-flow': 'use-login-flow',
  'runtime/vue/composables/use-orders': 'use-orders',
  'runtime/vue/composables/use-organization': 'use-workspace',
  'runtime/vue/composables/use-passkeys': 'use-passkeys',
  'runtime/vue/composables/use-pricing': 'use-pricing',
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

/**
 * Reference pages of helpers 0.2.0 removed: the wrapper subpaths, whose
 * Convex components an app now imports directly, and `nuxt-backend/authorization`,
 * folded into `createFunctions`. Both old routes land on the page that covers
 * the job now.
 */
const REMOVED_REFERENCE_SLUGS: Record<string, [slug: string, to: string]> = {
  'convex/integrations/aggregate': ['aggregate', '/docs/build/data/read-write/aggregates'],
  'convex/integrations/authorization': ['authorization', '/docs/reference/api/functions'],
  'convex/integrations/cache': ['cache', '/docs/build/data/jobs/action-cache'],
  'convex/integrations/counter': ['counter', '/docs/build/data/read-write/aggregates#counts-with-many-writers'],
  'convex/integrations/crons': ['crons', '/docs/build/data/jobs/scheduled'],
  'convex/integrations/migrations': ['migrations', '/docs/build/data/jobs/migrations'],
  'convex/integrations/workpool': ['workpool', '/docs/build/data/jobs/workpool'],
  'runtime/vue/composables/use-aggregate': ['use-aggregate', '/docs/build/data/read-write/aggregates'],
}

const COMPONENT_PAGE = '/docs/reference/backend/component'

const OLD_REFERENCE = '/api-reference/reference'

export const DOCS_REDIRECTS: DocsRedirect[] = [
  // Every 0.1 page, the legacy moves before it, and the 0.1 section roots.
  // 0.2.0 defers the MCP endpoint for users' agents (DEFER): its 0.1 pages land on the page that says so.
  { from: `${OLD_REFERENCE}/runtime/server/mcp`, to: '/docs/develop/agents/mcp' },
  { from: `${OLD_REFERENCE}/mcp`, to: '/docs/develop/agents/mcp' },
  { from: '/agents/built-in-tools', to: '/docs/develop/agents/mcp' },
  { from: '/agents/connect-a-client', to: '/docs/develop/agents/mcp' },
  { from: '/agents/custom-tools', to: '/docs/develop/agents/mcp' },
  { from: '/agents/mcp-server', to: '/docs/develop/agents/mcp' },
  { from: '/agents/oauth-and-consent', to: '/docs/develop/agents/mcp' },
  { from: '/agents/skills-and-agent-files', to: '/docs/develop/agents' },
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
  { from: '/guide/authentication', to: '/docs/build/auth/sign-in' },
  { from: '/guide/customization', to: '/docs/build/ui/customize' },
  { from: '/guide/default-pages', to: '/docs/build/ui/pages' },
  { from: '/guide/file-storage', to: '/docs/build/data/files' },
  { from: '/guide/import-aliases', to: '/docs/reference/nuxt/import-aliases' },
  { from: '/guide/queries-and-mutations', to: '/docs/build/data/read-write' },
  { from: '/guide/server-and-ssr', to: '/docs/build/data/read-write/server-rendering' },
  { from: '/platform/aggregates', to: '/docs/build/data/read-write/aggregates' },
  { from: '/platform/ai/metered-actions', to: '/docs/build/ai/metered-actions' },
  { from: '/platform/ai/streaming', to: '/docs/build/ai/streaming' },
  { from: '/platform/auth/customizing', to: '/docs/build/auth/setup#auth-route-and-options' },
  { from: '/platform/auth/setup', to: '/docs/build/auth/setup' },
  { from: '/platform/authorization', to: '/docs/build/auth/access/roles' },
  { from: '/platform/billing/catalog-as-code', to: '/docs/build/billing/catalog' },
  { from: '/platform/billing/credits-and-top-ups', to: '/docs/build/billing/credits' },
  { from: '/platform/billing/feature-gating', to: '/docs/build/billing/subscriptions/feature-gating' },
  { from: '/platform/billing/gifts', to: '/docs/build/growth/offers/gifts' },
  { from: '/platform/billing/subscriptions', to: '/docs/build/billing/subscriptions' },
  { from: '/platform/email/delivery-tracking', to: '/docs/build/email/delivery' },
  { from: '/platform/email/sending', to: '/docs/build/email/sending' },
  { from: '/platform/email/templates', to: '/docs/build/email/templates' },
  { from: '/platform/migrations', to: '/docs/build/data/jobs/migrations' },
  { from: '/platform/overview', to: '/docs/start/concepts/how-it-works' },
  { from: '/platform/rate-limiting', to: '/docs/ship/security/rate-limits' },
  { from: '/platform/search', to: '/docs/build/data/read-write/search' },
  { from: '/platform/webhooks', to: '/docs/ship/security/webhooks' },
  { from: '/platform/workflows', to: '/docs/build/data/jobs/workflows' },
  { from: '/platform/workspaces', to: '/docs/build/auth/workspaces' },
  { from: '/production/checklist', to: '/docs/ship/checklist' },
  { from: '/production/deployment', to: '/docs/ship/deploy' },
  { from: '/production/security', to: '/docs/ship/security' },
  { from: '/production/troubleshooting', to: '/docs/ship/operate/troubleshooting' },
  { from: '/tooling/cli', to: '/docs/reference/cli' },
  { from: '/tooling/devtools', to: '/docs/develop/devtools' },
  { from: '/tooling/linting', to: '/docs/develop/testing/linting' },
  { from: '/tooling/local-installation', to: '/docs/ship/releases/upgrade#local-installation-is-gone' },
  { from: '/tooling/testing', to: '/docs/develop/testing' },
  { from: '/backend-components/overview', to: '/docs/start/concepts/how-it-works' },
  { from: '/backend-components/email', to: '/docs/build/email/sending' },
  { from: '/backend-components/billing', to: '/docs/build/billing/subscriptions' },
  { from: '/backend-components/webhooks', to: '/docs/ship/security/webhooks' },
  { from: '/backend-components/rate-limiting', to: '/docs/ship/security/rate-limits' },
  { from: '/backend-components/workflows', to: '/docs/build/data/jobs/workflows' },
  { from: '/backend-components/migrations', to: '/docs/build/data/jobs/migrations' },
  { from: '/backend-components/aggregates', to: '/docs/build/data/read-write/aggregates' },
  { from: '/backend-components/search', to: '/docs/build/data/read-write/search' },
  { from: '/backend-components', to: '/docs/start/concepts/how-it-works' },
  { from: '/backend/auth-setup', to: '/docs/build/auth/setup' },
  { from: '/backend/customizing-auth', to: '/docs/build/auth/setup#auth-route-and-options' },
  { from: '/backend/local-installation', to: '/docs/ship/releases/upgrade#local-installation-is-gone' },
  { from: '/backend/testing', to: '/docs/develop/testing' },
  { from: '/backend', to: '/docs/build/auth/setup' },
  { from: '/api-reference/theming', to: '/docs/build/ui/customize/tokens' },
  { from: '/getting-started/examples-and-templates', to: '/docs/start/templates' },
  { from: '/agents', to: '/docs/develop/agents' },
  { from: '/api-reference', to: '/docs/reference' },
  { from: '/getting-started', to: '/docs/start' },
  { from: '/guide', to: '/docs/build/data' },
  { from: '/platform', to: '/docs/start/concepts/how-it-works' },
  { from: '/platform/ai', to: '/docs/build/ai' },
  { from: '/platform/auth', to: '/docs/build/auth' },
  { from: '/platform/billing', to: '/docs/build/billing' },
  { from: '/platform/email', to: '/docs/build/email' },
  { from: '/production', to: '/docs/ship' },
  { from: '/tooling', to: '/docs/develop/dev-loop' },

  // Folder routes under /docs, until each gets its landing.
  { from: '/docs', to: '/docs/start' },
  { from: '/docs/ship/migrate', to: '/docs/ship/releases/upgrade' },
  // The Concepts group opens on its first page: the IA gives it no landing.
  { from: '/docs/start/concepts', to: '/docs/start/concepts/how-it-works' },
  // Billing's Recipes group opens on its first recipe, as Concepts does.
  { from: '/docs/billing/recipes', to: '/docs/build/billing/setup#bill-each-person' },
  // AI's Recipes group opens on its recipe: the IA indexes recipes in Start, not per tab.
  { from: '/docs/ai/recipes', to: '/docs/build/ai/metered-actions#a-complete-feature' },

  // Pages that moved within /docs.
  // Billing: gifts joined the Growth group, beside plan passes and referrals.
  { from: '/docs/billing/credits/gifts', to: '/docs/build/growth/offers/gifts' },
  // Start: 0.2.0 develops on the providers' own sandboxes; the simulators are gone (NOSIM).
  { from: '/docs/start/develop/simulated-providers', to: '/docs/develop/sandboxes' },
  // Data: presence is a collaboration feature, out of 0.2.0; the Roadmap says what to use instead.
  { from: '/docs/data/presence', to: '/docs/start/roadmap#service-app-features' },
  // Auth: a client app opens in launch phases, and its terms are one of the consents (ACCESS, CONSENT).
  { from: '/docs/auth/sign-in/sign-up-policy', to: '/docs/build/growth/launch' },
  { from: '/docs/auth/sign-in/terms', to: '/docs/build/auth/accounts/consents' },
  { from: '/docs/auth/admin/admit-people', to: '/docs/build/growth/launch/invites' },
  // Auth: workspace depth waits for the service-app release (DEFER).
  { from: '/docs/auth/workspaces/invite-links', to: '/docs/start/roadmap#service-app-features' },
  { from: '/docs/auth/workspaces/custom-roles', to: '/docs/start/roadmap#service-app-features' },
  { from: '/docs/auth/workspaces/ownership', to: '/docs/start/roadmap#service-app-features' },
  { from: '/docs/auth/workspaces/configure', to: '/docs/start/roadmap#service-app-features' },
  // Agents: the MCP endpoint for users' agents waits for the next release (DEFER); one page says why.
  { from: '/docs/agents/mcp/built-in-tools', to: '/docs/develop/agents/mcp' },
  { from: '/docs/agents/mcp/custom-tools', to: '/docs/develop/agents/mcp' },
  { from: '/docs/agents/mcp/oauth-and-consent', to: '/docs/develop/agents/mcp' },
  { from: '/docs/agents/mcp/connected-agents', to: '/docs/develop/agents/mcp' },
  { from: '/docs/agents/mcp/widgets', to: '/docs/develop/agents/mcp' },
  { from: '/docs/agents/mcp/connect-a-client', to: '/docs/develop/agents/mcp' },
  // AI: chat is one page; tool approval left 0.2.0 with the agent tools, and the app-paid chat is a section.
  { from: '/docs/ai/chat/tool-approval', to: '/docs/build/ai/chat' },
  { from: '/docs/ai/chat/app-assistant', to: '/docs/build/ai/chat#chat-the-app-pays-for' },

  // Docs v3: six tabs (Start, Services, Develop, Build, Ship, Reference). Every page that moved, in one hop.
  { from: '/docs/start/concepts/app-layers', to: '/docs/start/concepts/capabilities' },
  { from: '/docs/start/develop', to: '/docs/develop/dev-loop' },
  { from: '/docs/start/develop/sandboxes', to: '/docs/develop/sandboxes' },
  { from: '/docs/email/sandbox-inbox', to: '/docs/develop/dev-inbox' },
  { from: '/docs/start/develop/devtools', to: '/docs/develop/devtools' },
  { from: '/docs/start/develop/doctor', to: '/docs/develop/doctor' },
  { from: '/docs/start/develop/analyze', to: '/docs/develop/analyze' },
  { from: '/docs/ship/test', to: '/docs/develop/testing' },
  { from: '/docs/ship/test/linting', to: '/docs/develop/testing/linting' },
  { from: '/docs/agents/coding', to: '/docs/develop/agents' },
  { from: '/docs/agents/coding/agent-files', to: '/docs/develop/agents/agent-files' },
  { from: '/docs/agents/coding/developer-mcp', to: '/docs/develop/agents/developer-mcp' },
  { from: '/docs/agents/coding/docs-mcp', to: '/docs/develop/agents/docs-mcp' },
  { from: '/docs/agents/coding/docs-for-agents', to: '/docs/develop/agents/docs-for-agents' },
  { from: '/docs/agents/coding/plugin', to: '/docs/develop/agents/plugin' },
  { from: '/docs/agents/mcp', to: '/docs/develop/agents/mcp' },
  { from: '/docs/auth', to: '/docs/build/auth' },
  { from: '/docs/auth/setup', to: '/docs/build/auth/setup' },
  { from: '/docs/auth/sign-in', to: '/docs/build/auth/sign-in' },
  { from: '/docs/auth/sign-in/custom-page', to: '/docs/build/auth/sign-in/custom-page' },
  { from: '/docs/auth/sign-in/hooks', to: '/docs/build/auth/sign-in/hooks' },
  { from: '/docs/auth/sign-in/bot-protection', to: '/docs/build/auth/sign-in/bots' },
  { from: '/docs/auth/access', to: '/docs/build/auth/access' },
  { from: '/docs/auth/access/pages', to: '/docs/build/auth/access/pages' },
  { from: '/docs/auth/access/functions', to: '/docs/build/auth/access/functions' },
  { from: '/docs/auth/access/roles', to: '/docs/build/auth/access/roles' },
  { from: '/docs/auth/access/step-up', to: '/docs/build/auth/access/step-up' },
  { from: '/docs/auth/accounts', to: '/docs/build/auth/accounts' },
  { from: '/docs/auth/accounts/profile', to: '/docs/build/auth/accounts/profile' },
  { from: '/docs/auth/accounts/security', to: '/docs/build/auth/accounts/security' },
  { from: '/docs/auth/accounts/data', to: '/docs/build/auth/accounts/data' },
  { from: '/docs/auth/accounts/consents', to: '/docs/build/auth/accounts/consents' },
  { from: '/docs/auth/accounts/alerts', to: '/docs/build/auth/accounts/alerts' },
  { from: '/docs/auth/workspaces', to: '/docs/build/auth/workspaces' },
  { from: '/docs/auth/workspaces/invitations', to: '/docs/build/auth/workspaces/invitations' },
  { from: '/docs/auth/workspaces/members', to: '/docs/build/auth/workspaces/members' },
  { from: '/docs/auth/admin', to: '/docs/build/auth/admin' },
  { from: '/docs/auth/admin/impersonation', to: '/docs/build/auth/admin/impersonation' },
  { from: '/docs/auth/admin/audit-log', to: '/docs/build/auth/admin/audit-log' },
  { from: '/docs/auth/admin/custom-tabs', to: '/docs/build/auth/admin/custom-tabs' },
  { from: '/docs/billing', to: '/docs/build/billing' },
  { from: '/docs/billing/pricing-models', to: '/docs/build/billing/pricing-models' },
  { from: '/docs/billing/setup', to: '/docs/build/billing/setup' },
  { from: '/docs/billing/catalog', to: '/docs/build/billing/catalog' },
  { from: '/docs/billing/pricing-page', to: '/docs/build/billing/pricing-page' },
  { from: '/docs/billing/subscriptions', to: '/docs/build/billing/subscriptions' },
  { from: '/docs/billing/subscriptions/checkout', to: '/docs/build/billing/subscriptions/checkout' },
  { from: '/docs/billing/feature-gating', to: '/docs/build/billing/subscriptions/feature-gating' },
  { from: '/docs/billing/subscriptions/quotas', to: '/docs/build/billing/subscriptions/quotas' },
  { from: '/docs/billing/subscriptions/orders', to: '/docs/build/billing/subscriptions/orders' },
  { from: '/docs/billing/recipes/overage', to: '/docs/build/billing/subscriptions/overage' },
  { from: '/docs/billing/credits', to: '/docs/build/billing/credits' },
  { from: '/docs/billing/credits/spending', to: '/docs/build/billing/credits/spending' },
  { from: '/docs/billing/events', to: '/docs/build/billing/events' },
  { from: '/docs/billing/events/customer-emails', to: '/docs/build/billing/events/customer-emails' },
  { from: '/docs/email', to: '/docs/build/email' },
  { from: '/docs/email/sending', to: '/docs/build/email/sending' },
  { from: '/docs/email/templates', to: '/docs/build/email/templates' },
  { from: '/docs/email/branding', to: '/docs/build/email/templates/theme' },
  { from: '/docs/email/templates/languages', to: '/docs/build/email/templates/languages' },
  { from: '/docs/email/delivery-tracking', to: '/docs/build/email/delivery' },
  { from: '/docs/email/deliverability', to: '/docs/build/email/delivery/deliverability' },
  { from: '/docs/email/suppressions', to: '/docs/build/email/delivery/suppressions' },
  { from: '/docs/email/engagement/preferences', to: '/docs/build/email/preferences' },
  { from: '/docs/email/engagement/receiving', to: '/docs/build/email/inbound' },
  { from: '/docs/email/engagement/forms', to: '/docs/build/email/inbound/contact-form' },
  { from: '/docs/email/notifications', to: '/docs/build/email/notifications' },
  { from: '/docs/email/notifications/custom-events', to: '/docs/build/email/notifications/custom-events' },
  { from: '/docs/email/notifications/web-push', to: '/docs/build/email/notifications/web-push' },
  { from: '/docs/email/notifications/installable', to: '/docs/build/email/notifications/installable' },
  { from: '/docs/ai', to: '/docs/build/ai' },
  { from: '/docs/ai/models', to: '/docs/build/ai/models' },
  { from: '/docs/ai/metered-actions', to: '/docs/build/ai/metered-actions' },
  { from: '/docs/ai/streaming', to: '/docs/build/ai/streaming' },
  { from: '/docs/ai/jobs', to: '/docs/build/ai/jobs' },
  { from: '/docs/ai/jobs/priority', to: '/docs/build/ai/jobs/priority' },
  { from: '/docs/ai/jobs/model-limits', to: '/docs/build/ai/jobs/model-limits' },
  { from: '/docs/ai/jobs/credits', to: '/docs/build/ai/jobs/credits' },
  { from: '/docs/ai/jobs/operate', to: '/docs/build/ai/jobs/operate' },
  { from: '/docs/ai/jobs/long-generation', to: '/docs/build/ai/jobs/long-generation' },
  { from: '/docs/ai/chat', to: '/docs/build/ai/chat' },
  { from: '/docs/ai/knowledge-search', to: '/docs/build/ai/chat/knowledge-search' },
  { from: '/docs/ai/content-safety', to: '/docs/build/ai/content-safety' },
  { from: '/docs/data', to: '/docs/build/data' },
  { from: '/docs/data/your-data', to: '/docs/build/data/your-data' },
  { from: '/docs/data/queries-and-mutations', to: '/docs/build/data/read-write' },
  { from: '/docs/data/workspace-scoped', to: '/docs/build/data/read-write/workspace-scoped' },
  { from: '/docs/data/server-rendering', to: '/docs/build/data/read-write/server-rendering' },
  { from: '/docs/data/errors', to: '/docs/build/data/read-write/errors' },
  { from: '/docs/data/search', to: '/docs/build/data/read-write/search' },
  { from: '/docs/data/aggregates', to: '/docs/build/data/read-write/aggregates' },
  { from: '/docs/data/files', to: '/docs/build/data/files' },
  { from: '/docs/data/files/checked-uploads', to: '/docs/build/data/files/checked-uploads' },
  { from: '/docs/data/files/images', to: '/docs/build/data/files/images' },
  { from: '/docs/data/files/share-links', to: '/docs/build/data/files/share-links' },
  { from: '/docs/data/files/cleanup', to: '/docs/build/data/files/cleanup' },
  { from: '/docs/data/retention', to: '/docs/build/data/retention' },
  { from: '/docs/data/jobs', to: '/docs/build/data/jobs' },
  { from: '/docs/data/jobs/workflows', to: '/docs/build/data/jobs/workflows' },
  { from: '/docs/data/jobs/scheduled', to: '/docs/build/data/jobs/scheduled' },
  { from: '/docs/data/jobs/workpool', to: '/docs/build/data/jobs/workpool' },
  { from: '/docs/data/jobs/action-cache', to: '/docs/build/data/jobs/action-cache' },
  { from: '/docs/data/jobs/migrations', to: '/docs/build/data/jobs/migrations' },
  { from: '/docs/auth/sign-in/launch-phases', to: '/docs/build/growth/launch' },
  { from: '/docs/auth/admin/waitlist', to: '/docs/build/growth/launch/waitlist' },
  { from: '/docs/auth/admin/invites', to: '/docs/build/growth/launch/invites' },
  { from: '/docs/billing/growth/promotions', to: '/docs/build/growth/offers' },
  { from: '/docs/billing/subscriptions/discounts', to: '/docs/build/growth/offers/discounts' },
  { from: '/docs/billing/growth/campaign-links', to: '/docs/build/growth/offers/campaign-links' },
  { from: '/docs/billing/growth/plan-passes', to: '/docs/build/growth/offers/plan-passes' },
  { from: '/docs/billing/growth/referrals', to: '/docs/build/growth/offers/referrals' },
  { from: '/docs/billing/growth/gifts', to: '/docs/build/growth/offers/gifts' },
  { from: '/docs/email/engagement', to: '/docs/build/growth/engage' },
  { from: '/docs/auth/accounts/onboarding', to: '/docs/build/growth/engage/activation' },
  { from: '/docs/email/engagement/sequences', to: '/docs/build/growth/engage/lifecycle-emails' },
  { from: '/docs/email/engagement/automations', to: '/docs/build/growth/engage/automations' },
  { from: '/docs/email/engagement/announcements', to: '/docs/build/growth/engage/announcements' },
  { from: '/docs/auth/admin/growth', to: '/docs/build/growth/measure' },
  { from: '/docs/auth/admin/analytics', to: '/docs/build/growth/measure/revenue' },
  { from: '/docs/ui', to: '/docs/build/ui' },
  { from: '/docs/ui/pages', to: '/docs/build/ui/pages' },
  { from: '/docs/ui/app-shell', to: '/docs/build/ui/app-shell' },
  { from: '/docs/ui/gate', to: '/docs/build/ui/gate' },
  { from: '/docs/ui/notices', to: '/docs/build/ui/notices' },
  { from: '/docs/ui/accessibility', to: '/docs/build/ui/accessibility' },
  { from: '/docs/ui/customize', to: '/docs/build/ui/customize' },
  { from: '/docs/ui/customize/theming', to: '/docs/build/ui/customize/tokens' },
  { from: '/docs/ui/customize/labels', to: '/docs/build/ui/customize/labels' },
  { from: '/docs/ui/customize/translation', to: '/docs/build/ui/customize/translation' },
  { from: '/docs/ui/customize/slots', to: '/docs/build/ui/customize/slots' },
  { from: '/docs/ship/production', to: '/docs/ship/checklist' },
  { from: '/docs/ship/production/security', to: '/docs/ship/security' },
  { from: '/docs/ship/production/rate-limits', to: '/docs/ship/security/rate-limits' },
  { from: '/docs/ship/production/webhooks', to: '/docs/ship/security/webhooks' },
  { from: '/docs/ship/production/secrets', to: '/docs/ship/security/secrets' },
  { from: '/docs/ship/production/surface', to: '/docs/ship/security/surface' },
  { from: '/docs/ship/production/privacy', to: '/docs/ship/compliance/privacy' },
  { from: '/docs/ship/production/replay', to: '/docs/ship/operate/replay' },
  { from: '/docs/ship/migrate/upgrade', to: '/docs/ship/releases/upgrade' },
  { from: '/docs/reference/layers', to: '/docs/reference/capabilities' },
  // Docs v3: pages merged into another, landing on the section that holds them.
  { from: '/docs/billing/permissions', to: '/docs/build/billing/setup#who-may-buy-for-a-workspace' },
  { from: '/docs/billing/recipes/bill-users', to: '/docs/build/billing/setup#bill-each-person' },
  { from: '/docs/billing/growth/manage-gifts', to: '/docs/build/growth/offers/gifts#manage-gifts' },
  { from: '/docs/email/engagement/marketing', to: '/docs/build/growth/engage/announcements' },
  { from: '/docs/ai/recipes/credit-metered-feature', to: '/docs/build/ai/metered-actions#a-complete-feature' },
  { from: '/docs/ai/costs', to: '/docs/build/ai/models#budgets-and-costs' },
  { from: '/docs/ui/customize/replace-pages', to: '/docs/build/ui/customize/parts' },
  { from: '/docs/ui/customize/nuxt-ui', to: '/docs/build/ui/customize/headless' },
  { from: '/docs/ship/deploy/providers', to: '/docs/services' },
  { from: '/docs/ship/operate/provider-settings', to: '/docs/services#recommended-settings' },
  { from: '/docs/agents', to: '/docs/develop/agents' },
  { from: '/docs/billing/growth', to: '/docs/build/growth/offers' },

  // Docs v3 writer lanes: each lane adds its redirects between its own two lines only.
  // lane 1: start
  // end lane 1
  // lane 2: services and ship
  // end lane 2
  // lane 3: develop and reference
  // end lane 3
  // lane 4: auth
  // end lane 4
  // lane 5: billing and growth
  // end lane 5
  // lane 6: email and ai
  // end lane 6
  // lane 7: data and ui
  // end lane 7
  // lane 8: compliance
  // end lane 8

  // The generated reference.
  { from: OLD_REFERENCE, to: REFERENCE_ROUTE },
  ...Object.entries(REFERENCE_SLUGS).flatMap(([source, slug]) => [
    { from: `${OLD_REFERENCE}/${source}`, to: `${REFERENCE_ROUTE}/${slug}` },
    ...(source === slug ? [] : [{ from: `${OLD_REFERENCE}/${slug}`, to: `${REFERENCE_ROUTE}/${slug}` }]),
  ]),
  ...Object.entries(REMOVED_REFERENCE_SLUGS).flatMap(([source, [slug, to]]) => [
    { from: `${OLD_REFERENCE}/${source}`, to },
    { from: `${OLD_REFERENCE}/${slug}`, to },
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
  '/features': '/docs/start/feature-map',
  '/docs/features': '/docs/start/feature-map',
  '/cli': '/docs/reference/cli',
  '/doctor': '/docs/reference/cli#doctor',
  '/reference': REFERENCE_ROUTE,
  '/docs/workspaces': '/docs/build/auth/workspaces',
  '/docs/credits': '/docs/build/billing/credits',
  '/docs/pricing': '/docs/build/billing/pricing-page',
  '/docs/files': '/docs/build/data/files',
  '/docs/mcp': '/docs/develop/agents/mcp',
  '/docs/notifications': '/docs/build/email/notifications',
  '/docs/composables': '/docs/reference/nuxt/composables',
  '/docs/cli': '/docs/reference/cli',
  '/docs/devtools': '/docs/develop/devtools',
  '/docs/testing': '/docs/develop/testing',
  '/docs/deploy': '/docs/ship/deploy',
  '/docs/api': REFERENCE_ROUTE,
  '/docs/upgrade': '/docs/ship/releases/upgrade',
  '/docs/changelog': '/docs/ship/releases/changelog',
  '/changelog': '/docs/ship/releases/changelog',
  '/docs/stability': '/docs/ship/releases/stability',
  '/docs/tutorial': '/docs/start/tutorial',
  '/docs/compliance': '/docs/ship/compliance',
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
  'reauthentication_required',
  'no_workspace',
  'rate_limited',
  'insufficient_credits',
  'feature_required',
  'quota_exceeded',
  'invalid_input',
  'not_ready',
  'unavailable',
] as const

// generated:generated-sections (pnpm docs:lookups, from scripts/docs-lookups/sections.mjs)
/**
 * The search sections the docs lookups generate from the code, which search
 * ranks below the sections written by hand (shared/search-ranking.ts),
 * written here by `pnpm docs:lookups`.
 */
export const GENERATED_SECTIONS: readonly string[] = [
  '/docs/build/auth/access/step-up#which-actions-ask',
  '/docs/develop/agents/docs-mcp#tools',
  '/docs/develop/agents/skills#the-skills',
  '/docs/reference/backend#in-the-code-today',
  '/docs/reference/backend/component#functions',
  '/docs/reference/backend/component#tables',
  '/docs/reference/backend/errors#feature_required',
  '/docs/reference/backend/errors#forbidden',
  '/docs/reference/backend/errors#insufficient_credits',
  '/docs/reference/backend/errors#invalid_input',
  '/docs/reference/backend/errors#no_workspace',
  '/docs/reference/backend/errors#not_ready',
  '/docs/reference/backend/errors#quota_exceeded',
  '/docs/reference/backend/errors#rate_limited',
  '/docs/reference/backend/errors#reauthentication_required',
  '/docs/reference/backend/errors#unauthenticated',
  '/docs/reference/backend/errors#unavailable',
  '/docs/reference/backend/events#backend-events',
  '/docs/reference/backend/events#billing-events',
  '/docs/reference/backend/events#email-events',
  '/docs/reference/backend/hooks#setupai-creditsoncreditsexhausted',
  '/docs/reference/backend/hooks#setupai-creditsoncreditslow',
  '/docs/reference/backend/hooks#setupaudit-onevent',
  '/docs/reference/backend/hooks#setupauth-cansignin',
  '/docs/reference/backend/hooks#setupauth-onusercreated',
  '/docs/reference/backend/hooks#setupauth-onuserdeleted',
  '/docs/reference/backend/hooks#setupbilling-cangift',
  '/docs/reference/backend/hooks#setupbilling-checkoutdiscount',
  '/docs/reference/backend/hooks#setupbilling-events',
  '/docs/reference/backend/hooks#setupbilling-onunknownevent',
  '/docs/reference/backend/hooks#setupbilling-requireadmin',
  '/docs/reference/backend/hooks#setupbilling-resolveentity',
  '/docs/reference/backend/hooks#setupemail-events',
  '/docs/reference/backend/hooks#setupemail-inboundonreply',
  '/docs/reference/backend/hooks#setupemail-inboundonworkspacemail',
  '/docs/reference/backend/hooks#setupemail-onunknownevent',
  '/docs/reference/backend/http-routes#in-the-nuxt-app',
  '/docs/reference/backend/http-routes#on-the-deployment',
  '/docs/reference/backend/limits#rate-limits',
  '/docs/reference/backend/limits#windows-and-lifetimes',
  '/docs/reference/capabilities#ai',
  '/docs/reference/capabilities#analytics',
  '/docs/reference/capabilities#auth',
  '/docs/reference/capabilities#billing',
  '/docs/reference/capabilities#data',
  '/docs/reference/capabilities#email',
  '/docs/reference/capabilities#every-capability',
  '/docs/reference/capabilities#flags',
  '/docs/reference/capabilities#hosting',
  '/docs/reference/capabilities#jobs',
  '/docs/reference/capabilities#monitoring',
  '/docs/reference/capabilities#notifications',
  '/docs/reference/capabilities#protection',
  '/docs/reference/capabilities#states',
  '/docs/reference/cheat-sheet#cli',
  '/docs/reference/cheat-sheet#composables',
  '/docs/reference/cheat-sheet#environment-variables',
  '/docs/reference/cheat-sheet#error-codes',
  '/docs/reference/cheat-sheet#setup-helpers',
  '/docs/reference/cli/diagnostics#admin-bootstrap',
  '/docs/reference/cli/diagnostics#agent-docs',
  '/docs/reference/cli/diagnostics#agent-files',
  '/docs/reference/cli/diagnostics#ai',
  '/docs/reference/cli/diagnostics#ai-components',
  '/docs/reference/cli/diagnostics#ai-spend-limit',
  '/docs/reference/cli/diagnostics#ai-stream-route',
  '/docs/reference/cli/diagnostics#analytics',
  '/docs/reference/cli/diagnostics#analytics-activation',
  '/docs/reference/cli/diagnostics#analytics-metrics',
  '/docs/reference/cli/diagnostics#auth',
  '/docs/reference/cli/diagnostics#auth-secret',
  '/docs/reference/cli/diagnostics#backend-site-url',
  '/docs/reference/cli/diagnostics#billing',
  '/docs/reference/cli/diagnostics#billing-access',
  '/docs/reference/cli/diagnostics#billing-benefit-grace',
  '/docs/reference/cli/diagnostics#billing-catalog-production',
  '/docs/reference/cli/diagnostics#billing-customer-emails',
  '/docs/reference/cli/diagnostics#billing-feature-benefits',
  '/docs/reference/cli/diagnostics#billing-gift-twins',
  '/docs/reference/cli/diagnostics#billing-meter-usage',
  '/docs/reference/cli/diagnostics#billing-multiple-subscriptions',
  '/docs/reference/cli/diagnostics#billing-organization',
  '/docs/reference/cli/diagnostics#billing-pass-products',
  '/docs/reference/cli/diagnostics#billing-portal',
  '/docs/reference/cli/diagnostics#billing-promotion-limits',
  '/docs/reference/cli/diagnostics#billing-promotion-portal',
  '/docs/reference/cli/diagnostics#billing-proration',
  '/docs/reference/cli/diagnostics#billing-provider-sdk',
  '/docs/reference/cli/diagnostics#billing-team-customers',
  '/docs/reference/cli/diagnostics#billing-trial-abuse',
  '/docs/reference/cli/diagnostics#billing-webhook-enabled',
  '/docs/reference/cli/diagnostics#billing-webhook-events',
  '/docs/reference/cli/diagnostics#billing-webhook-route',
  '/docs/reference/cli/diagnostics#billing-webhook-secret',
  '/docs/reference/cli/diagnostics#bot-protection',
  '/docs/reference/cli/diagnostics#brand-file',
  '/docs/reference/cli/diagnostics#bundle-duplicates',
  '/docs/reference/cli/diagnostics#consent-urls',
  '/docs/reference/cli/diagnostics#contact-bot-check',
  '/docs/reference/cli/diagnostics#convex-codegen',
  '/docs/reference/cli/diagnostics#convex-config',
  '/docs/reference/cli/diagnostics#data',
  '/docs/reference/cli/diagnostics#deployment-ai-gateway-api-key',
  '/docs/reference/cli/diagnostics#deployment-auth-secret',
  '/docs/reference/cli/diagnostics#deployment-backend-environment',
  '/docs/reference/cli/diagnostics#deployment-billing-access-token',
  '/docs/reference/cli/diagnostics#deployment-billing-webhook-secret',
  '/docs/reference/cli/diagnostics#deployment-email-api-key',
  '/docs/reference/cli/diagnostics#deployment-email-dev-inbox',
  '/docs/reference/cli/diagnostics#deployment-email-from',
  '/docs/reference/cli/diagnostics#deployment-email-webhook-secret',
  '/docs/reference/cli/diagnostics#deployment-env',
  '/docs/reference/cli/diagnostics#deployment-monitoring-dsn',
  '/docs/reference/cli/diagnostics#deployment-protection-challenge-secret-key',
  '/docs/reference/cli/diagnostics#deployment-protection-proof-secret',
  '/docs/reference/cli/diagnostics#deployment-provenance-certificate',
  '/docs/reference/cli/diagnostics#deployment-provenance-private-key',
  '/docs/reference/cli/diagnostics#deployment-push-private-key',
  '/docs/reference/cli/diagnostics#deployment-push-public-key',
  '/docs/reference/cli/diagnostics#deployment-removed-env',
  '/docs/reference/cli/diagnostics#deployment-site-url',
  '/docs/reference/cli/diagnostics#dev-script',
  '/docs/reference/cli/diagnostics#email',
  '/docs/reference/cli/diagnostics#email-flows',
  '/docs/reference/cli/diagnostics#email-key-permission',
  '/docs/reference/cli/diagnostics#email-marketing-from',
  '/docs/reference/cli/diagnostics#email-postal-address',
  '/docs/reference/cli/diagnostics#email-quota',
  '/docs/reference/cli/diagnostics#email-region',
  '/docs/reference/cli/diagnostics#email-reputation',
  '/docs/reference/cli/diagnostics#email-sender-domain',
  '/docs/reference/cli/diagnostics#email-topics',
  '/docs/reference/cli/diagnostics#email-transport',
  '/docs/reference/cli/diagnostics#email-webhook-enabled',
  '/docs/reference/cli/diagnostics#email-webhook-events',
  '/docs/reference/cli/diagnostics#email-webhook-route',
  '/docs/reference/cli/diagnostics#email-webhook-secret',
  '/docs/reference/cli/diagnostics#env-defaults',
  '/docs/reference/cli/diagnostics#function-contract',
  '/docs/reference/cli/diagnostics#hosting',
  '/docs/reference/cli/diagnostics#installable',
  '/docs/reference/cli/diagnostics#monitoring',
  '/docs/reference/cli/diagnostics#monitoring-app',
  '/docs/reference/cli/diagnostics#monitoring-backend-exceptions',
  '/docs/reference/cli/diagnostics#monitoring-health',
  '/docs/reference/cli/diagnostics#monitoring-source-maps',
  '/docs/reference/cli/diagnostics#monitoring-usage-alerts',
  '/docs/reference/cli/diagnostics#name-collisions',
  '/docs/reference/cli/diagnostics#notifications',
  '/docs/reference/cli/diagnostics#page-paths',
  '/docs/reference/cli/diagnostics#paths-file',
  '/docs/reference/cli/diagnostics#protection',
  '/docs/reference/cli/diagnostics#protection-challenge-keys',
  '/docs/reference/cli/diagnostics#protection-guest-jobs',
  '/docs/reference/cli/diagnostics#protection-proof',
  '/docs/reference/cli/diagnostics#site-auth-proxy',
  '/docs/reference/cli/diagnostics#site-backend-url',
  '/docs/reference/cli/diagnostics#site-csp',
  '/docs/reference/cli/diagnostics#site-gated-page',
  '/docs/reference/cli/diagnostics#site-https',
  '/docs/reference/cli/diagnostics#site-url',
  '/docs/reference/cli/diagnostics#site-url-origin',
  '/docs/reference/cli/diagnostics#the-report',
  '/docs/reference/cli/diagnostics#waitlist-bot-check',
  '/docs/reference/components#by-family',
  '/docs/reference/components#the-packages-components',
  '/docs/reference/components/account#accountdata',
  '/docs/reference/components/account#activationchecklist',
  '/docs/reference/components/account#authform',
  '/docs/reference/components/account#consentprompt',
  '/docs/reference/components/account#howdidyouhear',
  '/docs/reference/components/account#onboardingflow',
  '/docs/reference/components/account#profilesettings',
  '/docs/reference/components/account#reauthenticatedialog',
  '/docs/reference/components/account#securitysettings',
  '/docs/reference/components/account#waitlistform',
  '/docs/reference/components/billing#billingcheckoutlink',
  '/docs/reference/components/billing#billinghistory',
  '/docs/reference/components/billing#billingportallink',
  '/docs/reference/components/billing#cancelflow',
  '/docs/reference/components/billing#pricingtable',
  '/docs/reference/components/billing#referralcard',
  '/docs/reference/components/billing#upgradeprompt',
  '/docs/reference/components/billing#usagehistory',
  '/docs/reference/components/billing#withdrawalbutton',
  '/docs/reference/components/shell#accessdenied',
  '/docs/reference/components/shell#ailabel',
  '/docs/reference/components/shell#appshell',
  '/docs/reference/components/shell#backendnotices-1',
  '/docs/reference/components/shell#connectionstatus',
  '/docs/reference/components/shell#contactform',
  '/docs/reference/components/shell#gate-1',
  '/docs/reference/components/shell#notificationinbox',
  '/docs/reference/components/shell#uploadfield',
  '/docs/reference/components/theme-tokens#families',
  '/docs/reference/components/theme-tokens#shared-tokens',
  '/docs/reference/components/workspaces#acceptinvitation',
  '/docs/reference/components/workspaces#adminusers',
  '/docs/reference/components/workspaces#adminworkspaces',
  '/docs/reference/components/workspaces#auditlog',
  '/docs/reference/components/workspaces#workspacesettings',
  '/docs/reference/configuration/app-config#keys',
  '/docs/reference/configuration/catalogs#billingcatalog',
  '/docs/reference/configuration/catalogs#catalogcreditgrant',
  '/docs/reference/configuration/catalogs#catalogcustomfield',
  '/docs/reference/configuration/catalogs#catalogfeature',
  '/docs/reference/configuration/catalogs#catalogmeter',
  '/docs/reference/configuration/catalogs#catalogpack',
  '/docs/reference/configuration/catalogs#catalogplan',
  '/docs/reference/configuration/catalogs#catalogquota',
  '/docs/reference/configuration/catalogs#catalogtrial',
  '/docs/reference/configuration/catalogs#catalogusageprice',
  '/docs/reference/configuration/catalogs#the-generated-map',
  '/docs/reference/configuration/environment-variables#app-variables',
  '/docs/reference/configuration/environment-variables#the-registry',
  '/docs/reference/configuration/labels#access',
  '/docs/reference/configuration/labels#account',
  '/docs/reference/configuration/labels#activation',
  '/docs/reference/configuration/labels#admin',
  '/docs/reference/configuration/labels#ai',
  '/docs/reference/configuration/labels#announcement',
  '/docs/reference/configuration/labels#audit',
  '/docs/reference/configuration/labels#auth',
  '/docs/reference/configuration/labels#cancelflow',
  '/docs/reference/configuration/labels#connection',
  '/docs/reference/configuration/labels#consent',
  '/docs/reference/configuration/labels#contact',
  '/docs/reference/configuration/labels#credits',
  '/docs/reference/configuration/labels#deletion',
  '/docs/reference/configuration/labels#email',
  '/docs/reference/configuration/labels#errors',
  '/docs/reference/configuration/labels#feedback',
  '/docs/reference/configuration/labels#gift',
  '/docs/reference/configuration/labels#history',
  '/docs/reference/configuration/labels#impersonation',
  '/docs/reference/configuration/labels#invitation',
  '/docs/reference/configuration/labels#legal',
  '/docs/reference/configuration/labels#maintenance',
  '/docs/reference/configuration/labels#notifications',
  '/docs/reference/configuration/labels#onboarding',
  '/docs/reference/configuration/labels#pastdue',
  '/docs/reference/configuration/labels#preferences',
  '/docs/reference/configuration/labels#pricing',
  '/docs/reference/configuration/labels#profile',
  '/docs/reference/configuration/labels#quota',
  '/docs/reference/configuration/labels#reauthenticate',
  '/docs/reference/configuration/labels#referral',
  '/docs/reference/configuration/labels#report',
  '/docs/reference/configuration/labels#security',
  '/docs/reference/configuration/labels#settings',
  '/docs/reference/configuration/labels#shell',
  '/docs/reference/configuration/labels#source',
  '/docs/reference/configuration/labels#upgrade',
  '/docs/reference/configuration/labels#upload',
  '/docs/reference/configuration/labels#usage',
  '/docs/reference/configuration/labels#waitlist',
  '/docs/reference/configuration/labels#withdrawal',
  '/docs/reference/configuration/project-files#every-file',
  '/docs/reference/entrypoints#exports-map',
  '/docs/reference/entrypoints#import-tree',
  '/docs/reference/nuxt/composables#at-a-glance',
  '/docs/reference/nuxt/conventions#which-composables-follow-them',
  '/docs/ship/compliance/privacy#cookies-and-browser-storage',
  '/docs/ship/compliance/privacy#the-data-map',
  '/docs/ship/compliance/privacy#what-holds-nothing-of-a-person',
  '/docs/ship/compliance/privacy#what-the-backend-keeps-of-a-person',
  '/docs/ship/compliance/privacy#who-processes-it',
  '/docs/start/feature-map#ai',
  '/docs/start/feature-map#analytics',
  '/docs/start/feature-map#auth',
  '/docs/start/feature-map#billing',
  '/docs/start/feature-map#data',
  '/docs/start/feature-map#developer-tools',
  '/docs/start/feature-map#email',
  '/docs/start/feature-map#flags',
  '/docs/start/feature-map#hosting',
  '/docs/start/feature-map#jobs',
  '/docs/start/feature-map#monitoring',
  '/docs/start/feature-map#notifications',
  '/docs/start/feature-map#protection',
  '/docs/start/feature-map#ui',
]
// /generated:generated-sections

/** Where the `doctor` findings are documented, one anchor per id. */
const DIAGNOSTICS_PAGE = '/docs/reference/cli/diagnostics'

// generated:finding-ids (pnpm docs:lookups, from src/findings/index.ts)
/**
 * The ids of the findings registry (src/findings/), in report order,
 * written here by `pnpm docs:lookups` because this file imports nothing.
 */
export const FINDING_IDS = [
  'auth-secret',
  'site-url',
  'deployment-auth-secret',
  'deployment-site-url',
  'site-url-origin',
  'site-gated-page',
  'site-auth-proxy',
  'consent-urls',
  'admin-bootstrap',
  'page-paths',
  'backend-site-url',
  'deployment-env',
  'deployment-backend-environment',
  'deployment-removed-env',
  'env-defaults',
  'convex-codegen',
  'paths-file',
  'brand-file',
  'dev-script',
  'convex-config',
  'function-contract',
  'agent-files',
  'name-collisions',
  'bundle-duplicates',
  'billing-access',
  'billing-webhook-secret',
  'deployment-billing-access-token',
  'deployment-billing-webhook-secret',
  'billing-webhook-route',
  'billing-webhook-enabled',
  'billing-webhook-events',
  'billing-meter-usage',
  'billing-organization',
  'billing-multiple-subscriptions',
  'billing-proration',
  'billing-benefit-grace',
  'billing-trial-abuse',
  'billing-portal',
  'billing-customer-emails',
  'billing-team-customers',
  'billing-gift-twins',
  'billing-pass-products',
  'billing-feature-benefits',
  'billing-promotion-limits',
  'billing-promotion-portal',
  'billing-provider-sdk',
  'billing-catalog-production',
  'email-transport',
  'email-webhook-secret',
  'deployment-email-api-key',
  'deployment-email-from',
  'deployment-email-webhook-secret',
  'email-webhook-route',
  'deployment-email-dev-inbox',
  'email-sender-domain',
  'email-reputation',
  'email-quota',
  'email-key-permission',
  'email-topics',
  'email-flows',
  'email-webhook-events',
  'email-webhook-enabled',
  'email-postal-address',
  'email-marketing-from',
  'email-region',
  'deployment-push-public-key',
  'deployment-push-private-key',
  'installable',
  'ai-stream-route',
  'ai-components',
  'ai-spend-limit',
  'deployment-ai-gateway-api-key',
  'deployment-provenance-private-key',
  'deployment-provenance-certificate',
  'bot-protection',
  'protection-proof',
  'protection-challenge-keys',
  'waitlist-bot-check',
  'contact-bot-check',
  'protection-guest-jobs',
  'deployment-protection-proof-secret',
  'deployment-protection-challenge-secret-key',
  'deployment-monitoring-dsn',
  'monitoring-app',
  'monitoring-source-maps',
  'monitoring-backend-exceptions',
  'monitoring-health',
  'monitoring-usage-alerts',
  'analytics-metrics',
  'analytics-activation',
  'site-https',
  'site-csp',
  'site-backend-url',
  'agent-docs',
] as const
// /generated:finding-ids

/**
 * Links the CLI, DevTools and thrown errors print: `/d/<finding-id>` and
 * `/e/<error-code>`. Each lands on its own entry; an unknown one on the
 * page that lists them.
 */
export const DOCS_SHORT_LINKS: Array<{ from: string, to: string, pending?: string }> = [
  ...FINDING_IDS.map(id => ({ from: `/d/${id}`, to: `${DIAGNOSTICS_PAGE}#${id}` })),
  { from: '/d/**', to: DIAGNOSTICS_PAGE },
  ...ERROR_CODES.map(code => ({ from: `/e/${code}`, to: `${ERRORS_PAGE}#${code}` })),
  { from: '/e/**', to: ERRORS_PAGE },
]

type RedirectRule = { redirect: { to: string, statusCode: 301 | 302 } }

/** A route's Markdown twins: what an agent fetches instead of the HTML. */
const twins = (route: string): [string, string] => [`${route}.md`, `/raw${route}.md`]

/** Where a redirect sends a request, and with which status. */
export interface DocsRedirectTarget { to: string, statusCode: 301 | 302 }

/** Every redirect, alias and short link, for the HTML route and both twins (a twin drops the anchor, which means nothing in raw Markdown). */
function docsRedirects(): { pages: Record<string, DocsRedirectTarget>, twins: Record<string, DocsRedirectTarget> } {
  const pages: Record<string, DocsRedirectTarget> = {}
  const twinTargets: Record<string, DocsRedirectTarget> = {}
  const add = (from: string, to: string, statusCode: 301 | 302) => {
    pages[from] = { to, statusCode }
    const page = to.split('#')[0]!
    const [md, raw] = twins(from)
    const [mdTo, rawTo] = twins(page)
    twinTargets[md] = { to: mdTo, statusCode }
    twinTargets[raw] = { to: rawTo, statusCode }
  }
  for (const { from, to, pending } of DOCS_REDIRECTS) add(from, to, pending ? 302 : 301)
  for (const [from, to] of Object.entries(DOCS_ALIASES)) add(from, to, 302)
  for (const { from, to } of DOCS_SHORT_LINKS) pages[from] = { to, statusCode: 302 }
  return { pages, twins: twinTargets }
}

/**
 * Nitro route rules for every redirect, alias and short link of an HTML
 * route, each pointing straight at its target. Nuxt hands every route rule
 * to the browser as well, which needs only these: it never navigates to a
 * Markdown twin.
 */
export function docsRedirectRules(): Record<string, RedirectRule> {
  return Object.fromEntries(Object.entries(docsRedirects().pages).map(([from, redirect]) => [from, { redirect }]))
}

/**
 * Both Markdown twins' redirects (`<from>.md`, `/raw<from>.md`), each
 * straight to the target's twin: what an agent fetches, answered on the
 * server alone (server/middleware/docs-twin-redirects.ts), so the table
 * stays out of every page's JavaScript.
 */
export function docsTwinRedirects(): Record<string, DocsRedirectTarget> {
  return docsRedirects().twins
}
