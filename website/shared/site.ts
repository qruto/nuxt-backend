/**
 * What the site says it is, once. nuxt.config.ts reads it for the site
 * config and llms.txt; app.config.ts, the web manifest and the homepage's
 * frontmatter repeat it, and test/docs/homepage.test.ts keeps them equal.
 */
export const SITE = {
  name: 'Nuxt backend',
  /** Where the site is served; a deploy may set NUXT_SITE_URL instead (nuxt.config.ts). */
  url: 'https://nuxt-backend.dev',
  /** The homepage's heading: the hero says it in two lines. */
  title: 'The backend, machined for Nuxt.',
  /**
   * The homepage's title in search results and tabs, where Docus appends
   * ` · Nuxt backend`: what the package does and what it runs on, without
   * repeating the name the template adds.
   */
  seoTitle: 'Auth, billing, email and AI for Nuxt apps on Convex',
  /** The hero's paragraph under the title, which the homepage's Markdown for agents opens with too. */
  lead: 'Sign-in with codes and passkeys, workspaces, plans and credits, email and notifications, AI jobs, files and an admin console. One Nuxt module and one Convex component give a client app its whole backend, behind one API.',
  /**
   * The closing plate's send-off, a line at a time (components/home/ClosingCta.vue),
   * which the homepage's Markdown for agents closes with too. A word joiner
   * keeps `nuxt-backend` whole where a phone wraps the title.
   */
  closing: ['Install the module.', 'Run nuxt-\u2060backend dev. Ship.'],
  description: 'The all-in-one backend for client apps on Nuxt and Convex — sign-in with codes and passkeys, workspaces, plans and credits, email and notifications, AI jobs, files and an admin console, from one package.',
} as const
