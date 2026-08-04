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
  it('exposes the all-in-one backend component through Convex config subpaths', () => {
    expect(packageJson.exports).toHaveProperty('./convex')
    expect(packageJson.exports).toHaveProperty('./convex/components/backend/convex.config')
    // The component template (and every @convex-dev component) exports the
    // required component entries both extensionless and `.js`-suffixed — the
    // suffixed form is the historically documented Convex import style and
    // what NodeNext-resolution consumers write. Both must resolve identically.
    expect(packageJson.exports['./convex/components/backend/convex.config.js'])
      .toEqual(packageJson.exports['./convex/components/backend/convex.config'])
    expect(packageJson.exports).toHaveProperty('./convex/components/backend/_generated/component')
    expect(packageJson.exports['./convex/components/backend/_generated/component.js'])
      .toEqual(packageJson.exports['./convex/components/backend/_generated/component'])
    expect(packageJson.exports).toHaveProperty('./convex/components/backend/schema')
    // Only the required component entries get the `.js` alias — the function
    // modules and schema stay extensionless-only, like the template.
    expect(packageJson.exports).not.toHaveProperty('./convex/components/backend/schema.js')
    // Local-install re-export templates need the function modules.
    for (const name of ['email', 'billing', 'gifts']) {
      expect(packageJson.exports).toHaveProperty(`./convex/components/backend/${name}`)
    }
    // The pre-merge split-component subpaths are gone.
    for (const name of ['auth', 'email', 'billing']) {
      expect(packageJson.exports).not.toHaveProperty(`./convex/components/${name}/convex.config`)
    }
    expect(packageJson.exports).not.toHaveProperty('./convex/component/convex.config')
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
    expect(packageJson.exports['./convex/components/backend/convex.config']).toEqual({
      types: './dist/convex/components/backend/convex.config.d.ts',
      default: './dist/convex/components/backend/convex.config.js',
    })
    expect(packageJson.exports['./convex/components/backend/schema']).toEqual({
      types: './dist/convex/components/backend/schema.d.ts',
      default: './dist/convex/components/backend/schema.js',
    })
    expect(packageJson.exports['./convex/auth.config']).toEqual({
      types: './dist/convex/auth.config.d.ts',
      default: './dist/convex/auth.config.js',
    })
  })
})

describe('scaffold templates', () => {
  it('scaffolds Convex root files from the clean package entrypoints', () => {
    // The default scaffold is a zero-import `defineBackendApp()` call — the
    // package itself imports and mounts every bundled component.
    expect(BACKEND_FILE_TEMPLATES['convex.config.ts']).toContain(
      `import { defineBackendApp } from 'nuxt-backend/convex/app'`,
    )
    expect(BACKEND_FILE_TEMPLATES['convex.config.ts']).toContain(
      `export default defineBackendApp()`,
    )
    expect(BACKEND_FILE_TEMPLATES['convex.config.ts']).not.toContain(`convex.config'`)
    expect(BACKEND_FILE_TEMPLATES['http.ts']).toContain(
      `registerBackendRoutes(http, {`,
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

  it('provides whole-component local-install templates', () => {
    expect(LOCAL_BACKEND_FILE_TEMPLATES['convex.config.ts']).toContain(
      `import backend from './components/backend/convex.config'`,
    )
    expect(LOCAL_BACKEND_FILE_TEMPLATES['convex.config.ts']).toContain(
      `export default defineBackendApp({ components: { backend } })`,
    )
    expect(LOCAL_BACKEND_FILE_TEMPLATES['auth.ts']).toContain(
      `import { authSchema } from './components/backend/schema'`,
    )
    expect(LOCAL_BACKEND_FILE_TEMPLATES['components/backend/adapter.ts']).toContain(
      `createApi(authSchema, createAuthOptions)`,
    )
    expect(LOCAL_BACKEND_FILE_TEMPLATES['components/backend/generated-schema.ts']).toBe(
      `export { tables, billingTables, vEntitlementBenefit, vEntitlementMeter, vGift } from 'nuxt-backend/convex/components/backend/schema'\n`,
    )
    // The local component nests the email provider child and re-exports the
    // packaged function modules.
    expect(LOCAL_BACKEND_FILE_TEMPLATES['components/backend/convex.config.ts']).toContain(
      `component.use(resend)`,
    )
    for (const name of ['email', 'billing', 'gifts']) {
      expect(LOCAL_BACKEND_FILE_TEMPLATES[`components/backend/${name}.ts`]).toContain(
        `from 'nuxt-backend/convex/components/backend/${name}'`,
      )
    }
  })

  it('selects local templates through the installation scaffold option', () => {
    expect(getBackendFileTemplates()).toBe(BACKEND_FILE_TEMPLATES)
    expect(getBackendFileTemplates({ installation: 'default' })).toBe(BACKEND_FILE_TEMPLATES)
    expect(getBackendFileTemplates({ installation: 'local' })).toBe(LOCAL_BACKEND_FILE_TEMPLATES)
  })
})

describe('examples', () => {
  it('examples/minimal convex files are byte-identical to the scaffold templates', () => {
    // The minimal example's promise is "everything here is generated" — any
    // template change must be regenerated into it, and this catches drift.
    for (const [file, content] of Object.entries(BACKEND_FILE_TEMPLATES)) {
      const target = fileURLToPath(new URL(`../../examples/minimal/convex/${file}`, import.meta.url))
      expect(readFileSync(target, 'utf-8'), `examples/minimal/convex/${file} drifted from the template`).toBe(content)
    }
  })
})

describe('website app', () => {
  it('does not enable React JSX in backend functions', () => {
    expect(websiteBackendTsconfig).not.toContain('"jsx"')
    expect(websiteBackendTsconfig).toContain('"moduleResolution": "Bundler"')
  })
})
