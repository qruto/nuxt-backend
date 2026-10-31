import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildNuxtReport, runNuxtBuild, type RawBundleData } from '../../src/analyze/nuxt'

// `analyze`'s Nuxt build: `nuxt analyze --no-serve` run as the project's own
// Nuxt CLI, with a temporary layer that turns both visualizers to raw data.
// The project's `nuxt` here is a fake whose CLI is a real Node script: it
// reads the layer it was handed, writes the raw data where the layer says,
// and records how it ran. analyze.test.ts holds what a report makes of the
// data.

/**
 * The fake CLI: `analyze --no-serve --cwd <root> --extends <layer>`. It
 * records its argv and env into the project, then writes each visualizer's
 * data where the layer's config points, unless the project asks it to fail
 * or to write the client's alone.
 */
const FAKE_NUXT = `
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const args = process.argv.slice(2)
const root = args[args.indexOf('--cwd') + 1]
const layer = args[args.indexOf('--extends') + 1]
writeFileSync(join(root, 'nuxt-ran.json'), JSON.stringify({ args, cwd: process.cwd(), env: { CI: process.env.CI, NO_COLOR: process.env.NO_COLOR, NODE_ENV: process.env.NODE_ENV } }))
if (existsSync(join(root, 'fail-build'))) {
  process.stdout.write('Nuxt 4.6.2\\n\\u001B[31mERROR\\u001B[39m  Cannot resolve module\\n')
  process.stderr.write('  at app.vue:3\\n  at build\\n')
  process.exit(1)
}
const config = (await import(pathToFileURL(join(layer, 'nuxt.config.mjs')).href)).default
const data = id => ({ nodeParts: { p: { renderedLength: 1200, gzipLength: 300 } }, nodeMetas: { m: { id, moduleParts: { 'chunk.js': 'p' } } }, options: { gzip: true } })
writeFileSync(config.build.analyze.filename.replace('{name}', 'client'), JSON.stringify(data('/app/pages/index.vue')))
if (!existsSync(join(root, 'client-only'))) writeFileSync(config.nitro.analyze.filename.replace('{name}', 'nitro'), JSON.stringify(data('/app/server/api/hello.ts')))
`

let root: string
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'analyze-nuxt-build-')))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', private: true }))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Install the fake Nuxt in the project, its CLI under the bin name `bin` declares. */
function installNuxt(bin: string | Record<string, string> = { nuxi: 'bin/nuxi.mjs' }) {
  const pkg = join(root, 'node_modules/nuxt')
  mkdirSync(join(pkg, 'bin'), { recursive: true })
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'nuxt', version: '4.6.2', type: 'module', bin }))
  writeFileSync(join(pkg, 'bin/nuxi.mjs'), FAKE_NUXT)
}

const ran = () => JSON.parse(readFileSync(join(root, 'nuxt-ran.json'), 'utf8')) as { args: string[], cwd: string, env: Record<string, string> }

describe('the Nuxt half of analyze', () => {
  it('runs the project\'s own Nuxt CLI for a production analyze build, and reads both visualizers\' data back', async () => {
    installNuxt()
    const output = await runNuxtBuild(root)
    expect(output.client?.nodeMetas.m?.id).toBe('/app/pages/index.vue')
    expect(output.server?.nodeMetas.m?.id).toBe('/app/server/api/hello.ts')
    const { args, cwd, env } = ran()
    expect(args.slice(0, 4)).toEqual(['analyze', '--no-serve', '--cwd', root])
    expect(args[4]).toBe('--extends')
    expect(cwd).toBe(root)
    expect(env).toEqual({ CI: '1', NO_COLOR: '1', NODE_ENV: 'production' })
    // The layer and the build's output lived in a temporary directory, gone now; the app's own .output is never written.
    expect(existsSync(args[5]!)).toBe(false)
    expect(existsSync(join(root, '.output'))).toBe(false)
  })

  it('reads a server bundle the build wrote no data for as none', async () => {
    installNuxt({ nuxt: 'bin/nuxi.mjs' })
    writeFileSync(join(root, 'client-only'), '')
    const output = await runNuxtBuild(root)
    expect(output.client).not.toBeNull()
    expect(output.server).toBeNull()
  })

  it('fails with the end of Nuxt\'s own output, its colour codes gone, and leaves no temporary layer behind', async () => {
    installNuxt('bin/nuxi.mjs')
    writeFileSync(join(root, 'fail-build'), '')
    await expect(runNuxtBuild(root)).rejects.toThrow('the Nuxt build failed: Nuxt 4.6.2 | ERROR  Cannot resolve module | at app.vue:3 | at build')
    expect(existsSync(ran().args[5]!)).toBe(false)
  })

  it('says to install first, or to analyze the backend alone, in a project without Nuxt', async () => {
    await expect(runNuxtBuild(root)).rejects.toThrow('Nuxt is not installed in this project: run install first, or analyze with --only convex.')
  })
})

describe('a duplicated package in the bundle', () => {
  it('names the version each copy installed, read from its own manifest, and none for a copy it cannot read', () => {
    const copies = ['node_modules/ms', 'node_modules/debug/node_modules/ms']
    mkdirSync(join(root, copies[0]!), { recursive: true })
    writeFileSync(join(root, copies[0]!, 'package.json'), JSON.stringify({ name: 'ms', version: '2.1.3' }))
    const raw: RawBundleData = {
      nodeParts: { a: { renderedLength: 4000, gzipLength: 1000 }, b: { renderedLength: 3000, gzipLength: 800 } },
      nodeMetas: {
        one: { id: join(root, copies[0]!, 'index.js'), moduleParts: { 'chunk.js': 'a' } },
        two: { id: join(root, copies[1]!, 'index.js'), moduleParts: { 'chunk.js': 'b' } },
      },
    }
    const [insight] = buildNuxtReport('client', raw, { ownDirs: [] }).insights
    expect(insight).toMatchObject({ kind: 'duplicate-package', title: 'ms is bundled 2 times', savedBytes: 3000 })
    expect(insight!.detail).toContain('2.1.3 in node_modules/ms (')
    expect(insight!.detail).toContain(', node_modules/debug/node_modules/ms (')
    expect(insight!.detail).not.toContain('undefined')
  })
})
