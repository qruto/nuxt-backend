import type { Resolver } from '@nuxt/kit'
import type { ModuleDependencyMeta } from '@nuxt/schema'

// The `backend` provider for @nuxt/image (runtime/image/provider.ts), and the
// deployment's file hosts in its allowed domains: what `<NuxtImg
// provider="backend">` needs to resize a file from storage. Given as an
// optional module dependency, so an app without @nuxt/image installs
// nothing, and its own image options win over these defaults.

/** The hosts a deployment serves files from: its client URL's (`.convex.cloud`, storage URLs) and its site URL's (`.convex.site`, signed URLs). */
export function fileHosts(urls: ReadonlyArray<string | null | undefined>): string[] {
  const hosts = new Set<string>()
  for (const url of urls) {
    if (!url) continue
    try {
      hosts.add(new URL(url).host)
    }
    catch {
      // Not a URL yet (a placeholder): no host to allow.
    }
  }
  return [...hosts]
}

/** The `@nuxt/image` dependency: optional, with the `backend` provider and the file hosts as defaults. */
export function imageDependency(resolver: Resolver, urls: ReadonlyArray<string | null | undefined>): Record<string, ModuleDependencyMeta> {
  return {
    '@nuxt/image': {
      optional: true,
      defaults: {
        providers: { backend: { provider: resolver.resolve('./runtime/image/provider') } },
        domains: fileHosts(urls),
      },
    },
  }
}
