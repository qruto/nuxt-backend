import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Nuxt } from '@nuxt/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { backendTypeFallbackContents, hasGeneratedApi, registerBackendAliases } from '../../src/aliases'

// The `#backend/*` imports an app writes: where each one points in the
// project on disk, for both Vite and Nitro, and when the placeholder types
// give way to the generated ones. Each case is a real project directory.

let rootDir: string
beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'backend-aliases-'))
})
afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

/** The part of Nuxt's options the aliases are written into. */
function nuxtAt(dir: string, nitro?: { alias?: Record<string, string> }): Nuxt {
  return { options: { rootDir: dir, alias: { '~': dir }, ...(nitro ? { nitro } : {}) } } as unknown as Nuxt
}

function emitCodegen(functionsDir: string, file: 'api.d.ts' | 'api.js') {
  mkdirSync(join(rootDir, functionsDir, '_generated'), { recursive: true })
  writeFileSync(join(rootDir, functionsDir, '_generated', file), '')
}

describe('hasGeneratedApi', () => {
  it('is false until convex dev emits the api module, as types or as code', () => {
    expect(hasGeneratedApi(rootDir)).toBe(false)
    emitCodegen('backend', 'api.js')
    expect(hasGeneratedApi(rootDir)).toBe(true)
    rmSync(join(rootDir, 'backend'), { recursive: true })
    emitCodegen('backend', 'api.d.ts')
    expect(hasGeneratedApi(rootDir)).toBe(true)
  })

  it('looks in the functions directory convex.json names', () => {
    writeFileSync(join(rootDir, 'convex.json'), JSON.stringify({ functions: 'server/convex' }))
    emitCodegen('backend', 'api.d.ts')
    expect(hasGeneratedApi(rootDir)).toBe(false)
    emitCodegen('server/convex', 'api.d.ts')
    expect(hasGeneratedApi(rootDir)).toBe(true)
  })
})

describe('registerBackendAliases', () => {
  it('points every #backend import at the project\'s functions directory, for Vite and Nitro alike', () => {
    const nuxt = nuxtAt(rootDir)
    registerBackendAliases(nuxt)
    const generated = join(rootDir, 'backend', '_generated')
    const expected = {
      '#backend/api': join(generated, 'api'),
      '#backend/server': join(generated, 'server'),
      '#backend/dataModel': join(generated, 'dataModel'),
      '#backend/_generated': generated,
      '#backend': join(rootDir, 'backend'),
    }
    expect(nuxt.options.alias).toEqual({ '~': rootDir, ...expected })
    expect(nuxt.options.nitro.alias).toEqual(expected)
    // First match wins: the bare `#backend` prefix comes after every entry it would swallow.
    const names = Object.keys(nuxt.options.nitro.alias!)
    expect(names.at(-1)).toBe('#backend')
  })

  it('keeps the aliases an app or another module gave Nitro', () => {
    const nuxt = nuxtAt(rootDir, { alias: { '#shared-utils': '/app/shared' } })
    registerBackendAliases(nuxt)
    expect(nuxt.options.nitro.alias).toMatchObject({ '#shared-utils': '/app/shared', '#backend': join(rootDir, 'backend') })
  })

  it('adds the package\'s runtime, part types and accessibility helpers for ejected files, ahead of #backend', () => {
    const runtimeDir = join(rootDir, 'node_modules/nuxt-backend/dist/runtime')
    const nuxt = nuxtAt(rootDir)
    registerBackendAliases(nuxt, runtimeDir)
    expect(nuxt.options.alias).toMatchObject({
      '#backend/runtime': join(runtimeDir, 'vue'),
      '#backend/parts': join(runtimeDir, 'vue/parts'),
      '#backend/a11y': join(runtimeDir, 'vue/a11y'),
    })
    const names = Object.keys(nuxt.options.nitro.alias!)
    expect(names.indexOf('#backend/runtime')).toBeLessThan(names.indexOf('#backend'))
  })

  it('follows an existing convex/ directory when there is no backend/', () => {
    mkdirSync(join(rootDir, 'convex'))
    const nuxt = nuxtAt(rootDir)
    registerBackendAliases(nuxt)
    expect(nuxt.options.alias['#backend/api']).toBe(join(rootDir, 'convex', '_generated', 'api'))
  })
})

describe('the #backend type fallback', () => {
  it('declares every #backend module loosely before codegen, naming where it will come from', () => {
    const placeholder = backendTypeFallbackContents(false, 'server/convex')
    expect(placeholder.split('\n')[0]).toBe('// Placeholder until `npx convex dev` generates server/convex/_generated.')
    for (const module of ['#backend/api', '#backend/server', '#backend/dataModel']) expect(placeholder).toContain(`declare module '${module}'`)
  })

  it('declares nothing once codegen exists, so the generated types resolve', () => {
    expect(backendTypeFallbackContents(true, 'backend')).toBe('export {}\n')
  })
})
