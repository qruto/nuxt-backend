// THE FEATURE MAP'S SECTIONS. A docs page joins the Feature map
// (/docs/start/feature-map) by naming its section in frontmatter, `capability:`,
// and `pnpm docs:lookups` writes the map from every page that does: one row
// per page, from its title, description, status and unit
// (scripts/docs-lookups/feature-map.mjs). Nobody edits the map's rows by
// hand, so the writers of different tabs never edit one shared list.
//
// The first twelve are the capabilities of the release these docs describe
// (/docs/start/concepts/capabilities). The last two are not capabilities: they
// hold what spans every capability, the pages and components, and the tools
// you build with. content.config.ts takes `capability` from this list only.
//
// No imports: content.config.ts and plain Node (the lookups) load it.

export interface DocsCapability {
  /** The frontmatter value: `capability: billing`. */
  id: string
  /** The section's heading on the Feature map. */
  title: string
  /** The sentence under the heading: what the section holds, what powers it, and its docs home. */
  intro: string
}

/** The Feature map's sections, in its order: the twelve capabilities, then what spans them. */
export const DOCS_CAPABILITIES: readonly DocsCapability[] = [
  { id: 'auth', title: 'Auth', intro: 'Accounts, sign-in, launch access and workspaces, on Better Auth running inside your deployment ([Auth](/docs/build/auth)).' },
  { id: 'data', title: 'Data', intro: 'The realtime database, files and retention, on Convex ([Data](/docs/build/data)).' },
  { id: 'jobs', title: 'Jobs', intro: 'Background work, on Convex and its official components ([Background work](/docs/build/data/jobs)).' },
  { id: 'billing', title: 'Billing', intro: 'Plans, credits and growth offers, with Polar as the merchant of record ([Billing](/docs/build/billing)).' },
  { id: 'email', title: 'Email', intro: 'Transactional and marketing email, on Resend ([Email](/docs/build/email)).' },
  { id: 'notifications', title: 'Notifications', intro: 'What the app tells people in the app and by push, each kind opted into. Its pages are in the [Email & notifications](/docs/build/email) group.' },
  { id: 'ai', title: 'AI', intro: 'Metered model calls, generation jobs and chat, through the Convex AI Gateway ([AI](/docs/build/ai)).' },
  { id: 'protection', title: 'Protection', intro: 'Bot checks, rate limits and content safety: Vercel BotID on Vercel, a Cloudflare Turnstile challenge elsewhere ([Bot protection](/docs/build/auth/sign-in/bots)).' },
  { id: 'monitoring', title: 'Monitoring', intro: 'Errors and uptime, on Sentry ([Monitor errors and uptime](/docs/ship/operate/monitoring)).' },
  { id: 'flags', title: 'Flags', intro: 'Feature flags read inside your own functions ([Roll out features and pause services](/docs/ship/operate/flags)).' },
  { id: 'analytics', title: 'Analytics', intro: 'How the app is doing, in the admin console, from data that stays in your deployment and at the billing provider ([Measure growth](/docs/build/growth/measure)).' },
  { id: 'hosting', title: 'Hosting', intro: 'Shipping the app and its backend: Vercel first, any host that runs Nuxt otherwise ([Ship](/docs/ship)).' },
  { id: 'ui', title: 'UI', intro: 'Not a capability: the pages and components of every capability, restyled rather than rebuilt ([Pages and components](/docs/build/ui)).' },
  { id: 'tools', title: 'Developer tools', intro: 'Not a capability: what you build with, from the first run to the upgrade ([Develop](/docs/develop)).' },
]

/** The values `capability:` takes. */
export const DOCS_CAPABILITY_IDS = DOCS_CAPABILITIES.map(capability => capability.id) as [string, ...string[]]

/** The capabilities of the release, in order: the sections that are capabilities. */
export const APP_CAPABILITY_IDS = DOCS_CAPABILITY_IDS.filter(id => id !== 'ui' && id !== 'tools')
