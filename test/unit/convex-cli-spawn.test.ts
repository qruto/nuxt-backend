import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `spawnConvex`: the interactive Convex CLI runs (`convex dev`, the login and
// project prompts) with the terminal attached. A fake `convex` inside a
// throwaway project is spawned for real, with the current Node and no shell,
// and reports how it ran into a file, since its stdout is the terminal's.

// As in convex-cli.test.ts: `createRequire` stays real, except for the one
// case no fixture can produce while this repo has `convex` installed.
const resolver = vi.hoisted(() => ({ absent: false }))
vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:module')>()
  return {
    ...actual,
    createRequire: (base: string | URL) => {
      if (!resolver.absent) return actual.createRequire(base)
      return {
        resolve: () => {
          throw new Error('Cannot find module')
        },
      }
    },
  }
})

/**
 * The fake CLI: `report <file>` writes its argv, working directory and one
 * env value there; `exit <code>` exits with it; `signal <name>` is ended by
 * that signal, as a Ctrl-C or a `kill` ends a real one.
 */
const FAKE_CLI = `
const fs = require('node:fs')
const [command, value] = process.argv.slice(2)
if (command === 'report') fs.writeFileSync(value, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), marker: process.env.SPAWN_MARKER ?? null }))
else if (command === 'exit') process.exitCode = Number(value)
else if (command === 'signal') process.kill(process.pid, value)
`

let rootDir: string
beforeEach(() => {
  rootDir = realpathSync(mkdtempSync(join(tmpdir(), 'nuxt-backend-convex-spawn-')))
  resolver.absent = false
  const pkg = join(rootDir, 'node_modules/convex')
  mkdirSync(join(pkg, 'bin'), { recursive: true })
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'convex', version: '0.0.0-test', bin: { convex: 'bin/main.js' } }))
  writeFileSync(join(pkg, 'bin/main.js'), FAKE_CLI)
})
afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

describe('spawnConvex', () => {
  it('runs the project\'s convex in the project, argv verbatim, and resolves with its exit code', async () => {
    const { spawnConvex } = await import('../../src/convex-cli')
    const out = join(rootDir, 'seen.json')
    expect(await spawnConvex(rootDir, ['report', out, '--prod', 'a "quoted" $HOME; arg'])).toBe(0)
    expect(JSON.parse(readFileSync(out, 'utf8'))).toMatchObject({ args: ['report', out, '--prod', 'a "quoted" $HOME; arg'], cwd: rootDir })
    expect(await spawnConvex(rootDir, ['exit', '3'])).toBe(3)
  })

  it('hands the child the env it is given, and the process env otherwise', async () => {
    const { spawnConvex } = await import('../../src/convex-cli')
    const out = join(rootDir, 'seen.json')
    vi.stubEnv('SPAWN_MARKER', 'from-the-shell')
    try {
      await spawnConvex(rootDir, ['report', out])
      expect(JSON.parse(readFileSync(out, 'utf8')).marker).toBe('from-the-shell')
      await spawnConvex(rootDir, ['report', out], { env: { ...process.env, SPAWN_MARKER: 'given' } })
      expect(JSON.parse(readFileSync(out, 'utf8')).marker).toBe('given')
    }
    finally {
      vi.unstubAllEnvs()
    }
  })

  // A shell reports a run its Ctrl-C ended as 130; any other signal is a failure.
  it.skipIf(process.platform === 'win32')('reads a child a SIGINT ended as 130, and one another signal ended as 1', async () => {
    const { spawnConvex } = await import('../../src/convex-cli')
    expect(await spawnConvex(rootDir, ['signal', 'SIGINT'])).toBe(130)
    expect(await spawnConvex(rootDir, ['signal', 'SIGTERM'])).toBe(1)
  })

  it('stops passing stop signals on once the child is gone, whether it ran or never started', async () => {
    const { spawnConvex } = await import('../../src/convex-cli')
    const before = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]
    await spawnConvex(rootDir, ['exit', '0'])
    await expect(spawnConvex(join(rootDir, 'gone'), ['dev'])).rejects.toMatchObject({ code: 'ENOENT' })
    expect([process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]).toEqual(before)
  })

  it('rejects up front, without spawning, when convex is not installed', async () => {
    const { spawnConvex } = await import('../../src/convex-cli')
    resolver.absent = true
    await expect(spawnConvex(rootDir, ['dev'])).rejects.toThrow('The `convex` package is not installed')
  })
})
