import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** A path as Vite takes an alias target: forward slashes on every platform. */
const slashed = (path: string) => path.split('\\').join('/')

/**
 * The base module's real files: its client entry (from its `exports` map)
 * and the session composable behind its Better Auth entry. Real paths, so
 * the files load once, as the base module's own plugins load them.
 */
function baseModuleFiles(): { client: string, useBetterAuth: string } {
  const manifest = realpathSync(createRequire(import.meta.url).resolve('nuxt-convex-module/package.json'))
  const root = dirname(manifest)
  const { exports } = JSON.parse(readFileSync(manifest, 'utf8')) as { exports: Record<string, { import: string }> }
  return {
    client: slashed(join(root, exports['./client']!.import)),
    useBetterAuth: slashed(join(root, dirname(exports['./better-auth/client']!.import), 'use-better-auth.js')),
  }
}

/**
 * Vite aliases that put {@link createBackendMock} under the package's
 * composables and components and the base module's own. Three imports are
 * swapped:
 *
 * - `#convex/auth-client`, the Better Auth client the session layer is built
 *   on (`useAuth`, `useBetterAuth`, the page guard), for one that
 *   answers from the mock;
 * - `nuxt-convex-module/client` and `nuxt-convex-module/vue`, for the base
 *   module's own entry with every export kept, whose composables also
 *   provide the mock where a plain `mount()` needs it.
 *
 * Two private names reach the base module's real files for those stand-ins.
 * With the aliases in a Vitest project, a test needs no `vi.mock`.
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
  const base = baseModuleFiles()
  return {
    '#convex/auth-client': sibling('auth-client'),
    'nuxt-convex-module/client': sibling('client'),
    'nuxt-convex-module/vue': sibling('client'),
    '#backend-test-utils/base-client': base.client,
    '#backend-test-utils/base-use-better-auth': base.useBetterAuth,
  }
}
