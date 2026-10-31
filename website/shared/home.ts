/**
 * What the homepage lists, once: the twelve app layers (the modules grid),
 * the services under them (the hero's strip) and what being one package
 * means (the all-in-one section). The page renders these and the homepage's
 * Markdown for agents says them (shared/agent-markdown.ts), so the two
 * never drift. test/docs/homepage.test.ts holds the layers to the docs'
 * own list (shared/docs-capabilities.ts) and every link to a page that exists.
 */

/** One app layer on the modules grid. */
export interface HomeModule {
  /** The layer's id, as `layer:` and `doctor --only` name it. */
  layer: string
  title: string
  /** What an app gets from it, a few nouns long. */
  gives: string
  /** `available` lights green; `planned` amber, for a layer whose pages are mostly planned. */
  status: 'available' | 'experimental' | 'planned'
  docs: string
}

export const HOME_MODULES: readonly HomeModule[] = [
  { layer: 'auth', title: 'Auth', gives: 'Sign-in codes and passkeys, workspaces, launch phases and invites', status: 'available', docs: '/docs/build/auth' },
  { layer: 'data', title: 'Data', gives: 'Realtime queries, search, checked uploads and share links', status: 'available', docs: '/docs/build/data' },
  { layer: 'jobs', title: 'Jobs', gives: 'Workflows, schedules, queues and retention', status: 'available', docs: '/docs/build/data/jobs' },
  { layer: 'billing', title: 'Billing', gives: 'Plans, credits, promotions, gifts and referrals', status: 'available', docs: '/docs/build/billing' },
  { layer: 'email', title: 'Email', gives: 'Branded templates, topics and one-click unsubscribe', status: 'available', docs: '/docs/build/email' },
  { layer: 'notifications', title: 'Notifications', gives: 'An in-app inbox and web push, each kind opted into', status: 'planned', docs: '/docs/build/email/notifications' },
  { layer: 'ai', title: 'AI', gives: 'Metered model calls, generation jobs and chat', status: 'experimental', docs: '/docs/build/ai' },
  { layer: 'protection', title: 'Protection', gives: 'Bot checks, rate limits and content safety', status: 'available', docs: '/docs/build/auth/sign-in/bots' },
  { layer: 'monitoring', title: 'Monitoring', gives: 'Errors, cron monitors and a health endpoint', status: 'available', docs: '/docs/ship/operate/monitoring' },
  { layer: 'flags', title: 'Flags', gives: 'Rollouts, kill switches and a maintenance banner', status: 'available', docs: '/docs/ship/operate/flags' },
  { layer: 'analytics', title: 'Analytics', gives: 'Revenue, usage and the growth funnel in the admin console', status: 'planned', docs: '/docs/build/growth/measure/revenue' },
  { layer: 'hosting', title: 'Hosting', gives: 'Vercel first, any Nuxt host, one-command production', status: 'available', docs: '/docs/ship' },
]

/** A service the package runs on: what it gives, in its own words. */
export interface HomeService {
  name: string
  gives: string
}

export const HOME_SERVICES: readonly HomeService[] = [
  { name: 'Convex', gives: 'database, functions, files, scheduler, AI Gateway' },
  { name: 'Better Auth', gives: 'sessions, codes, passkeys, workspaces' },
  { name: 'Polar', gives: 'checkout, subscriptions, meters, portal' },
  { name: 'Resend', gives: 'sending, delivery events, topics' },
  { name: 'Vercel', gives: 'hosting, bot checks, firewall' },
  { name: 'Sentry', gives: 'errors, cron monitors, uptime' },
]

/** One trait of the all-in-one package. */
export interface HomeTrait {
  title: string
  body: string
  link: { to: string, label: string }
}

export const HOME_TRAITS: readonly HomeTrait[] = [
  {
    title: 'One API over every service',
    body: 'Your code calls useCredits() and email.send(), never a provider\'s SDK. Brand names stay in the docs.',
    link: { to: '/docs/start/concepts/principles', label: 'Principles' },
  },
  {
    title: 'Layers switch on by themselves',
    body: 'Set a layer\'s key and it turns on; leave it out and it stays off. There is no switch to flip.',
    link: { to: '/docs/start/concepts/capabilities', label: 'App layers' },
  },
  {
    title: 'Pages and components included',
    body: 'Sign-in, account, pricing, workspaces and the admin console ship ready, in your theme, every string a label.',
    link: { to: '/docs/build/ui', label: 'Pages and components' },
  },
  {
    title: 'Real sandboxes from the first run',
    body: 'Development runs on Polar\'s sandbox and Resend\'s test mode, with sent mail in a dev inbox.',
    link: { to: '/docs/develop/sandboxes', label: 'Develop with real sandboxes' },
  },
  {
    title: 'Typed errors end to end',
    body: 'Every refusal carries a code, from the Convex function to your page, so you switch on it instead of parsing text.',
    link: { to: '/docs/build/data/read-write/errors', label: 'Errors' },
  },
  {
    title: 'Ready for coding agents',
    body: 'Task skills, AGENTS.md and one developer MCP server that knows your project and the services under it.',
    link: { to: '/docs/develop/agents', label: 'Build with agents' },
  },
]
