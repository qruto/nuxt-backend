import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

// `ai` is an optional peer, yet every scaffold writes backend/ai.ts, which
// imports nuxt-backend/ai. The platform bundles an app's functions with
// esbuild, and esbuild fails the push on an import it cannot resolve unless
// the import handles its own failure: awaited directly inside a `try`, or
// given a `.catch()`. So an app without `ai` (the starter, an app made by the
// quickstart) pushes only while every import of it keeps that shape.
// Bundled here with the platform's own esbuild, from a copy of the sources
// outside the repository, where `ai` cannot resolve.

const root = fileURLToPath(new URL('../..', import.meta.url))
const platformRequire = createRequire(createRequire(join(root, 'package.json')).resolve('convex/package.json'))
/** The part of esbuild's API this test drives (it is the platform's dependency, not this repository's). */
type Bundle = (options: Record<string, unknown>) => Promise<{ errors: unknown[], outputFiles: Array<{ text: string }> }>
const { build } = platformRequire('esbuild') as { build: Bundle }

const copy = mkdtempSync(join(tmpdir(), 'nb-ai-peer-'))
cpSync(join(root, 'src/convex'), join(copy, 'convex'), { recursive: true })
afterAll(() => rmSync(copy, { recursive: true, force: true }))

/** Every package but the AI SDK stays external: the copy has no node_modules, so `ai` cannot resolve. */
const othersExternal = {
  name: 'others-external',
  setup(bundler: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => { external: boolean } | undefined) => void }) {
    bundler.onResolve({ filter: /^[^./]/ }, ({ path }) => (/^ai(?:\/|$)/.test(path) ? undefined : { external: true }))
  },
}

/** nuxt-backend/ai bundled as the platform bundles an app's functions, the SDK left unresolvable. */
const bundleAi = () => build({
  entryPoints: [join(copy, 'convex/integrations/ai.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  logLevel: 'silent',
  plugins: [othersExternal],
})

describe('nuxt-backend/ai without the AI SDK installed', () => {
  it('bundles, leaving the SDK to a runtime import that reports it missing', async () => {
    const result = await bundleAi()
    expect(result.errors).toEqual([])
    expect(result.outputFiles[0]!.text).toContain('import("ai")')
  })

  // No model of the package's own is bundled into a deployment: the mock
  // `nuxt-backend/test` installs lives with the test helpers, so a deployment
  // of an app with `ai` never packs the SDK's test entry, and one without it
  // has a single import of the SDK to leave to run time.
  it('packs nothing of the SDK for a mock model, its test entry least of all', async () => {
    const bundled = (await bundleAi()).outputFiles[0]!.text
    expect(bundled).not.toContain('ai/test')
    expect(bundled.match(/import\("ai[^"]*"\)/g)).toEqual(['import("ai")'])
  })
})
