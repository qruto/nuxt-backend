/**
 * What the site says it is, once. nuxt.config.ts reads it for the site
 * config and llms.txt; app.config.ts, the web manifest and the homepage's
 * frontmatter repeat it, and test/docs/homepage.test.ts keeps them equal.
 */
export const SITE = {
  name: 'Nuxt backend',
  /** The homepage's heading: the hero says it in two lines. */
  title: 'The backend, machined for Nuxt.',
  /**
   * The homepage's title in search results and tabs, where Docus appends
   * ` · Nuxt backend`: what the package does and what it runs on, without
   * repeating the name the template adds.
   */
  seoTitle: 'Auth, billing, email and agents for Nuxt on Convex',
  description: 'The all-in-one SaaS backend for Nuxt on Convex — authentication, billing, credits, transactional email, webhooks and an agent (MCP) surface from a single package.',
} as const
