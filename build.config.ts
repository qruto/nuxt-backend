import { defineBuildConfig } from 'unbuild'
import { execSync } from 'node:child_process'

export default defineBuildConfig({
  // Unbuild warns about unresolved convex-component imports; safe to ignore
  // since those files ship as source .ts for the Convex runtime.
  failOnWarn: false,
  hooks: {
    'build:done'() {
      // Generate .d.ts declarations for the convex-component subpath exports.
      // Source .ts files ship as-is for the Convex runtime; only declarations are emitted.
      execSync('tsc --project ./tsconfig.build.json', { stdio: 'inherit' })
    },
  },
})
