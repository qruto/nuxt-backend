import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BACKEND_FILE_TEMPLATES } from '../../src/templates'

const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url))
const websiteBackendTsconfigPath = fileURLToPath(new URL('../../website/backend/tsconfig.json', import.meta.url))
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
  exports: Record<string, unknown>
}
const websiteBackendTsconfig = readFileSync(websiteBackendTsconfigPath, 'utf-8')

describe('package exports', () => {
  it('exposes the all-in-one backend component through neutral subpaths', () => {
    expect(packageJson.exports).toHaveProperty('./auth')
    expect(packageJson.exports).toHaveProperty('./convex.config')
    // The component template (and every @convex-dev component) exports the
    // required component entries both extensionless and `.js`-suffixed — the
    // suffixed form is the historically documented Convex import style and
    // what NodeNext-resolution consumers write. Both must resolve identically.
    expect(packageJson.exports['./convex.config.js'])
      .toEqual(packageJson.exports['./convex.config'])
    expect(packageJson.exports).toHaveProperty('./_generated/component')
    expect(packageJson.exports['./_generated/component.js'])
      .toEqual(packageJson.exports['./_generated/component'])
    // The component's schema and function modules are not entry points: the
    // app mounts the packaged component and reaches it as `components.backend`.
    for (const key of Object.keys(packageJson.exports)) {
      expect(key, `component internals exported as ${key}`).not.toMatch(/^\.\/component\//)
    }
    expect(packageJson.exports).toHaveProperty('./auth.config')
    expect(packageJson.exports).toHaveProperty('./billing')
    expect(packageJson.exports).toHaveProperty('./email')
    expect(packageJson.exports).toHaveProperty('./test')
    // The brand-named `./convex/*` subpaths are gone — the public surface is
    // service-neutral. `./convex.config` is not one of them: it is the
    // platform's own entry-point name, the one every Convex component exports.
    for (const key of Object.keys(packageJson.exports)) {
      expect(key, `brand-named export subpath ${key}`).not.toMatch(/^\.\/convex\//)
    }
    expect(packageJson.exports).not.toHaveProperty('./client')
    expect(packageJson.exports).not.toHaveProperty('./auth-config')
    expect(packageJson.exports).not.toHaveProperty('./react')
  })

  it('ships built convex runtime entrypoints from dist instead of src', () => {
    expect(packageJson.exports['./auth']).toEqual({
      types: './dist/convex/client/index.d.ts',
      default: './dist/convex/client/index.js',
    })
    expect(packageJson.exports['./convex.config']).toEqual({
      types: './dist/convex/components/backend/convex.config.d.ts',
      default: './dist/convex/components/backend/convex.config.js',
    })
    expect(packageJson.exports['./auth.config']).toEqual({
      types: './dist/convex/auth.config.d.ts',
      default: './dist/convex/auth.config.js',
    })
  })
})

describe('scaffold templates', () => {
  it('scaffolds Convex root files from the clean package entrypoints', () => {
    // The default scaffold is the explicit app definition: every component
    // imported and mounted in the root file, one `app.use` each. A helper
    // that reaches the `convex.config` imports through an intermediate
    // module — or a loop of `use` calls — crashes the push on current Convex
    // backends (start_push 500), so the scaffold must stay unrolled.
    const config = BACKEND_FILE_TEMPLATES['convex.config.ts']!
    expect(config).toContain(`import { defineApp } from 'convex/server'`)
    expect(config).toContain(`import { backendEnv } from 'nuxt-backend/app'`)
    expect(config).toContain(`import backend from 'nuxt-backend/convex.config'`)
    expect(config).toContain(`const app = defineApp({ env: backendEnv })`)
    expect(config).toContain(`EMAIL_WEBHOOK_SECRET: app.env.EMAIL_WEBHOOK_SECRET`)
    for (const name of ['aggregate', 'migrations', 'persistentTextStreaming', 'polar', 'rateLimiter', 'workflow']) {
      expect(config).toContain(`import ${name} from '@convex-dev/`)
      expect(config).toContain(`app.use(${name})`)
    }
    expect(config).toContain(`export default app`)
    expect(config).not.toContain('defineBackendApp')
    expect(config).not.toMatch(/for \(|\.forEach\(/)
    expect(BACKEND_FILE_TEMPLATES['http.ts']).toContain(
      `registerBackendRoutes(http, {`,
    )
    expect(BACKEND_FILE_TEMPLATES['auth.config.ts']).toBe(
      `export { default } from 'nuxt-backend/auth.config'\n`,
    )
    expect(BACKEND_FILE_TEMPLATES['auth.ts']).toContain(
      `import { setupAuth } from 'nuxt-backend/auth'`,
    )
    // setupAuth is the one factory: the scaffold exports createAuth, never a
    // second way to build the options, and passes its wiring at the top level.
    expect(BACKEND_FILE_TEMPLATES['auth.ts']).toContain('createAuth,')
    expect(BACKEND_FILE_TEMPLATES['auth.ts']).not.toContain('createAuthOptions')
    expect(BACKEND_FILE_TEMPLATES['auth.ts']).not.toContain('integrations')
  })
})

describe('website app', () => {
  it('mounts its backend with the exact default scaffold', () => {
    // The docs site's backend is the reference consumer: its convex.config.ts
    // is the default template verbatim, so the template is proven against the
    // live dev deployment by the `convex dev` watcher.
    const target = fileURLToPath(new URL('../../website/backend/convex.config.ts', import.meta.url))
    expect(readFileSync(target, 'utf-8')).toBe(BACKEND_FILE_TEMPLATES['convex.config.ts'])
  })

  it('does not enable React JSX in backend functions', () => {
    expect(websiteBackendTsconfig).not.toContain('"jsx"')
    expect(websiteBackendTsconfig).toContain('"moduleResolution": "Bundler"')
  })
})
