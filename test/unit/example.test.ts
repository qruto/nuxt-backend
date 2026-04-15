import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BACKEND_FILE_TEMPLATES } from '../../src/templates'

const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url))
const playgroundAppPath = fileURLToPath(new URL('../../playground/app.vue', import.meta.url))
const playgroundBackendTsconfigPath = fileURLToPath(new URL('../../playground/backend/tsconfig.json', import.meta.url))
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
  exports: Record<string, unknown>
}
const playgroundApp = readFileSync(playgroundAppPath, 'utf-8')
const playgroundBackendTsconfig = readFileSync(playgroundBackendTsconfigPath, 'utf-8')

describe('package exports', () => {
  it('exposes the packaged Convex component without React-only or config-style aliases', () => {
    expect(packageJson.exports).toHaveProperty('./convex-component')
    expect(packageJson.exports).toHaveProperty('./auth-config')
    expect(packageJson.exports).toHaveProperty('./auth')
    expect(packageJson.exports).not.toHaveProperty('./react')
  })
})

describe('scaffold templates', () => {
  it('scaffolds Convex root files from the clean package entrypoints', () => {
    expect(BACKEND_FILE_TEMPLATES['convex.config.ts']).toContain(
      `import backend from 'nuxt-backend/convex-component'`,
    )
    expect(BACKEND_FILE_TEMPLATES['convex.config.ts']).toContain(
      `app.use(backend`,
    )
    expect(BACKEND_FILE_TEMPLATES['auth.config.ts']).toBe(
      `export { default } from 'nuxt-backend/auth-config'\n`,
    )
  })
})

describe('playground templates', () => {
  it('keeps the Nuxt playground minimal and Vue-only', () => {
    expect(playgroundApp).toContain('Nuxt backend playground!')
    expect(playgroundApp).not.toContain('useSession')
    expect(playgroundApp).not.toContain('useAuthClient')
  })

  it('does not enable React JSX in backend functions', () => {
    expect(playgroundBackendTsconfig).not.toContain('"jsx"')
    expect(playgroundBackendTsconfig).toContain('"moduleResolution": "Bundler"')
  })
})
