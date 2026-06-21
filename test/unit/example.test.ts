import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BACKEND_FILE_TEMPLATES, LOCAL_BACKEND_FILE_TEMPLATES, getBackendFileTemplates } from '../../src/templates'

const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url))
const websiteBackendTsconfigPath = fileURLToPath(new URL('../../website/backend/tsconfig.json', import.meta.url))
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
  exports: Record<string, unknown>
}
const websiteBackendTsconfig = readFileSync(websiteBackendTsconfigPath, 'utf-8')

describe('package exports', () => {
  it('exposes the packaged Convex component only through the extensionless Convex config subpath', () => {
    expect(packageJson.exports).toHaveProperty('./convex')
    expect(packageJson.exports).toHaveProperty('./convex/component/_generated/component')
    expect(packageJson.exports).not.toHaveProperty('./convex/component/_generated/component.js')
    expect(packageJson.exports).toHaveProperty('./convex/component/convex.config')
    expect(packageJson.exports).not.toHaveProperty('./convex/component/convex.config.js')
    expect(packageJson.exports).toHaveProperty('./convex/component/schema')
    expect(packageJson.exports).not.toHaveProperty('./convex/component/schema.js')
    expect(packageJson.exports).toHaveProperty('./convex/auth.config')
    expect(packageJson.exports).toHaveProperty('./convex/billing')
    expect(packageJson.exports).toHaveProperty('./convex/email')
    expect(packageJson.exports).toHaveProperty('./convex/test')
    expect(packageJson.exports).not.toHaveProperty('./client')
    expect(packageJson.exports).not.toHaveProperty('./auth-config')
    expect(packageJson.exports).not.toHaveProperty('./auth')
    expect(packageJson.exports).not.toHaveProperty('./react')
  })

  it('ships built convex runtime entrypoints from dist instead of src', () => {
    expect(packageJson.exports['./convex']).toEqual({
      types: './dist/convex/client/index.d.ts',
      default: './dist/convex/client/index.js',
    })
    expect(packageJson.exports['./convex/component/convex.config']).toEqual({
      types: './dist/convex/component/convex.config.d.ts',
      default: './dist/convex/component/convex.config.js',
    })
    expect(packageJson.exports['./convex/component/schema']).toEqual({
      types: './dist/convex/component/schema.d.ts',
      default: './dist/convex/component/schema.js',
    })
    expect(packageJson.exports['./convex/auth.config']).toEqual({
      types: './dist/convex/auth.config.d.ts',
      default: './dist/convex/auth.config.js',
    })
  })
})

describe('scaffold templates', () => {
  it('scaffolds Convex root files from the clean package entrypoints', () => {
    expect(BACKEND_FILE_TEMPLATES['convex.config.ts']).toContain(
      `import backend from 'nuxt-backend/convex/component/convex.config'`,
    )
    // The default scaffold is one `defineBackendApp({ ... })` call, which mounts
    // every component and forwards the email env to the nested Resend component.
    expect(BACKEND_FILE_TEMPLATES['convex.config.ts']).toContain(
      `import { defineBackendApp } from 'nuxt-backend/convex/app'`,
    )
    expect(BACKEND_FILE_TEMPLATES['convex.config.ts']).toContain(
      `export default defineBackendApp({ backend`,
    )
    expect(BACKEND_FILE_TEMPLATES['http.ts']).toContain(
      `authComponent.registerRoutes(http, createAuth)`,
    )
    expect(BACKEND_FILE_TEMPLATES['auth.config.ts']).toBe(
      `export { default } from 'nuxt-backend/convex/auth.config'\n`,
    )
    expect(BACKEND_FILE_TEMPLATES['auth.ts']).toContain(
      `import { setupAuth } from 'nuxt-backend/convex'`,
    )
    expect(BACKEND_FILE_TEMPLATES['auth.ts']).toContain('createAuthOptions')
    expect(BACKEND_FILE_TEMPLATES['auth.ts']).toContain('options')
  })

  it('provides local hybrid Better Auth component templates', () => {
    expect(LOCAL_BACKEND_FILE_TEMPLATES['convex.config.ts']).toContain(
      `import backend from './components/backend/convex.config'`,
    )
    expect(LOCAL_BACKEND_FILE_TEMPLATES['auth.ts']).toContain(
      `import schema from './components/backend/schema'`,
    )
    expect(LOCAL_BACKEND_FILE_TEMPLATES['components/backend/adapter.ts']).toContain(
      `createApi(schema, createAuthOptions)`,
    )
    expect(LOCAL_BACKEND_FILE_TEMPLATES['components/backend/generated-schema.ts']).toBe(
      `export { tables } from 'nuxt-backend/convex/component/schema'\n`,
    )
  })

  it('selects local templates through the installation scaffold option', () => {
    expect(getBackendFileTemplates()).toBe(BACKEND_FILE_TEMPLATES)
    expect(getBackendFileTemplates({ installation: 'default' })).toBe(BACKEND_FILE_TEMPLATES)
    expect(getBackendFileTemplates({ installation: 'local' })).toBe(LOCAL_BACKEND_FILE_TEMPLATES)
  })
})

describe('website app', () => {
  it('does not enable React JSX in backend functions', () => {
    expect(websiteBackendTsconfig).not.toContain('"jsx"')
    expect(websiteBackendTsconfig).toContain('"moduleResolution": "Bundler"')
  })
})
