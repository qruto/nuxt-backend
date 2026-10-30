import type { FindingEntries } from './types'

/** The project's own files: codegen, the paths file the module generates, the dev script, the mounts and routes, the functions the composables bind to, the files that guide coding agents, the app's names the package's share, and the packages the last `analyze` run found bundled twice. */
export const SCAFFOLD_FINDINGS = {
  'convex-codegen': { title: 'Convex codegen' },
  // The paths file the module writes from nuxt.config, against nuxt.config.
  'paths-file': { title: 'Paths file', fixable: true },
  // The brand file the module writes from app.config, against app.config.
  'brand-file': { title: 'Brand file', fixable: true },
  'dev-script': { title: 'Dev script', fixable: true },
  'convex-config': { title: 'Mounts and routes', fixable: true },
  'function-contract': { title: 'Function contract', fixable: true },
  'agent-files': { title: 'Agent files' },
  // Informational: a same-named component is how an app swaps a part.
  'name-collisions': { title: 'Name collisions' },
  // From the last `analyze` run, which doctor never makes itself; none until there is one.
  'bundle-duplicates': { title: 'Duplicate packages in the Convex bundle' },
} as const satisfies FindingEntries
