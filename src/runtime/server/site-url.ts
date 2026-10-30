import { useRuntimeConfig } from 'nuxt/server'

/**
 * The Convex site URL (the HTTP actions origin) the base module publishes in
 * public runtime config, or `null` when the build knows none.
 */
export function readSiteUrl(): string | null {
  const config = useRuntimeConfig() as { public?: { convex?: { siteUrl?: string } } }
  return config.public?.convex?.siteUrl || null
}
