import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BACKEND_FILE_TEMPLATES } from '../../src/templates'

const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url))
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
  exports: Record<string, unknown>
}

describe('package exports', () => {
  it('exposes the packaged Convex component without React-only or config-style aliases', () => {
    expect(packageJson.exports).toHaveProperty('./convex-component')
    expect(packageJson.exports).toHaveProperty('./auth-config')
    expect(packageJson.exports).toHaveProperty('./auth')
    expect(packageJson.exports).not.toHaveProperty('./react')
    expect(packageJson.exports).not.toHaveProperty('./convex.config')
  })
})

describe('scaffold templates', () => {
  it('scaffolds Convex root files from the clean package entrypoints', () => {
    expect(BACKEND_FILE_TEMPLATES['convex.config.ts']).toBe(
      `export { default } from 'nuxt-backend/convex-component'\n`,
    )
    expect(BACKEND_FILE_TEMPLATES['auth.config.ts']).toBe(
      `export { default } from 'nuxt-backend/auth-config'\n`,
    )
  })
})
