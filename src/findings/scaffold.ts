import type { FindingEntries } from './types'

/** The project's own files: codegen, the dev script, and the functions the composables bind to. */
export const SCAFFOLD_FINDINGS = {
  'convex-codegen': { title: 'Convex codegen' },
  'dev-script': { title: 'Dev script', fixable: true },
  'function-contract': { title: 'Function contract', fixable: true },
} as const satisfies FindingEntries
