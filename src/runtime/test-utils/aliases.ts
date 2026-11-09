import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** A path as Vite takes an alias target: forward slashes on every platform. */
const slashed = (path: string) => path.split('\\').join('/')

/**
 * The base module's real client entry, from its `exports` map. The real
 * path, so the file loads once, as the base module's own plugins load it.
 */
function baseClientEntry(): string {
  const manifest = realpathSync(createRequire(import.meta.url).resolve('nuxt-convex-module/package.json'))
  const { exports } = JSON.parse(readFileSync(manifest, 'utf8')) as { exports: Record<string, { import: string }> }
  return slashed(join(dirname(manifest), exports['./client']!.import))
}

/**
 * Vite aliases that put {@link createBackendMock} under the package's
 * composables and components and the base module's own. Three imports are
 * swapped:
 *
 * - `#convex/auth-client`, the Better Auth client the session layer is built
 *   on (`useAuth`, `useBetterAuth`, the page guard), which the base module
 *   loads on first use, for one that answers from the mock;
 * - `nuxt-convex-module/client` and `nuxt-convex-module/vue`, for the base
 *   module's own entry with every export kept, whose composables also
 *   provide the mock where a plain `mount()` needs it.
 *
 * One private name reaches the base module's real entry for that stand-in;
 * the session state the base module keeps between tests is reset through its
 * public `nuxt-convex-module/testing`. With the aliases in a Vitest project,
 * a test needs no `vi.mock`.
 *
 * Use them in a project with `@nuxt/test-utils`' `nuxt` environment
 * (`defineVitestProject`, or `defineVitestConfig` for a single project): it
 * transforms the package and the base module, which is where the aliases
 * apply. Keep tests that need a live deployment in a project without them.
 *
 * @example
 * ```ts [vitest.config.ts]
 * import { defineConfig } from 'vitest/config'
 * import { defineVitestProject } from '@nuxt/test-utils/config'
 * import { backendTestAliases } from 'nuxt-backend/test-utils'
 *
 * export default defineConfig({
 *   test: {
 *     projects: [
 *       await defineVitestProject({
 *         resolve: { alias: backendTestAliases() },
 *         test: { name: 'app', include: ['test/app/*.test.ts'], environment: 'nuxt' },
 *       }),
 *     ],
 *   },
 * })
 * ```
 */
export function backendTestAliases(): Record<string, string> {
  const here = fileURLToPath(import.meta.url)
  // The built `.js` next to the built `.js`, the source `.ts` next to the source.
  const sibling = (name: string) => slashed(join(dirname(here), `${name}${extname(here)}`))
  return {
    '#convex/auth-client': sibling('auth-client'),
    'nuxt-convex-module/client': sibling('client'),
    'nuxt-convex-module/vue': sibling('client'),
    '#backend-test-utils/base-client': baseClientEntry(),
  }
}
