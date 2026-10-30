// The one pure fact the Node side (src/deployment.ts) and the server runtime
// (src/runtime/server/backend-url.ts) share about a deployment's two URLs.
// It imports nothing, so a server bundle can take it.

/**
 * `https://<slug>.convex.cloud` → `https://<slug>.convex.site`: the HTTP
 * routes' origin is the deployment's own with `.site` for `.cloud`, a
 * deployment in another region (`<slug>.<region>.convex.cloud`) included.
 * `null` for any other URL, a custom domain or a self-hosted backend among
 * them.
 */
export function siteFromCloudUrl(url: string): string | null {
  const match = url.match(/^(https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.convex)\.cloud\/?$/)
  return match ? `${match[1]}.site` : null
}
