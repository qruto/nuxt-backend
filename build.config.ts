import { defineBuildConfig } from 'unbuild'
import { execSync } from 'node:child_process'

export default defineBuildConfig({
  // Unbuild warns about unresolved convex-component imports; safe to ignore
  // since those files ship as source .ts for the Convex runtime.
  failOnWarn: false,
  hooks: {
    'build:done'() {
      // Generate .d.ts declarations for the convex-component sub-path
      // exports (backend-component, auth-config, auth).
      // The source .ts files are consumed by the Convex runtime directly,
      // so only type declarations need to be emitted.
      execSync('tsc -p src/convex-component/tsconfig.declarations.json', { stdio: 'inherit' })
    },
  },
})
