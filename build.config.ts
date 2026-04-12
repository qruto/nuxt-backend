import { defineBuildConfig } from 'unbuild'
import { execSync } from 'node:child_process'

export default defineBuildConfig({
  failOnWarn: false,
  hooks: {
    'build:done'() {
      execSync('tsc -p src/convex-component/tsconfig.declarations.json', { stdio: 'inherit' })
    },
  },
})
