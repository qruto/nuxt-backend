import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `createRequire` is the only thing between `runConvex` and the spawn. It is
// left real (the fixture project below carries its own `convex`), except for
// the one case no fixture can produce while this repo has `convex` installed:
// neither the project nor this package has it.
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
 * A stand-in for the `convex` package inside a throwaway project. Its
 * `bin/main.js` is a real Node script, so `runConvex` is exercised end to end
 * — a genuine `process.execPath` spawn, no shell — without a deployment or
 * the network: it reports how it was invoked, exits non-zero on request, or
 * hangs until killed.
 */
const FAKE_CLI = `
const args = process.argv.slice(2)
if (args[0] === 'fail') {
  process.stderr.write('deployment says no\\n')
  process.exitCode = 2
}
else if (args[0] === 'hang') {
  setTimeout(() => {}, 30_000)
}
else {
  process.stdout.write(JSON.stringify({ args, cwd: process.cwd() }))
}
`

let rootDir: string

beforeEach(() => {
  // Real path: `require.resolve` and the child's `process.cwd()` both report it
  // (macOS keeps the temp dir behind a `/private` symlink).
  rootDir = realpathSync(mkdtempSync(join(tmpdir(), 'nuxt-backend-convex-cli-')))
  resolver.absent = false
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

/** Install the fake `convex` into the fixture project; returns its CLI entry. */
function installFakeConvex(): string {
  const pkg = join(rootDir, 'node_modules/convex')
  mkdirSync(join(pkg, 'bin'), { recursive: true })
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'convex', version: '0.0.0-test', bin: { convex: 'bin/main.js' } }))
  writeFileSync(join(pkg, 'bin/main.js'), FAKE_CLI)
  return join(pkg, 'bin/main.js')
}

describe('resolveConvexCli', () => {
  it('prefers the project\'s own convex over this package\'s copy', async () => {
    const { resolveConvexCli } = await import('../../src/convex-cli')
    const cli = installFakeConvex()
    expect(resolveConvexCli(rootDir)).toBe(cli)
  })

  it('falls back to this package\'s convex when the project has none', async () => {
    const { resolveConvexCli } = await import('../../src/convex-cli')
    // `convex/bin/main.js` is outside the package's `exports` map, so the
    // expected path is derived the way the resolver derives it.
    const manifest = createRequire(import.meta.url).resolve('convex/package.json')
    expect(resolveConvexCli(rootDir)).toBe(join(dirname(manifest), 'bin', 'main.js'))
  })

  it('is undefined when neither the project nor this package has it', async () => {
    const { resolveConvexCli } = await import('../../src/convex-cli')
    resolver.absent = true
    expect(resolveConvexCli(rootDir)).toBeUndefined()
  })
})

describe('runConvex', () => {
  it('runs the resolved CLI with the current Node, argv verbatim, in the project', async () => {
    const { runConvex } = await import('../../src/convex-cli')
    installFakeConvex()
    // Everything a shell would mangle: quotes, an expansion, a chained command.
    const args = ['env', 'set', 'EMAIL_API_KEY', 're_"quoted" $HOME; echo owned && exit 1']

    const { stdout, stderr } = await runConvex(rootDir, args)

    expect(JSON.parse(stdout)).toEqual({ args, cwd: rootDir })
    expect(stderr).toBe('')
  })

  it('rejects when the CLI exits non-zero, carrying its stderr', async () => {
    const { runConvex } = await import('../../src/convex-cli')
    installFakeConvex()
    await expect(runConvex(rootDir, ['fail'])).rejects.toMatchObject({ code: 2, stderr: 'deployment says no\n' })
  })

  it('kills a hung CLI once the timeout passes', async () => {
    const { runConvex } = await import('../../src/convex-cli')
    installFakeConvex()
    await expect(runConvex(rootDir, ['hang'], { timeout: 250 })).rejects.toMatchObject({ killed: true })
  })

  it('rejects up front, without spawning, when convex is not installed', async () => {
    const { runConvex } = await import('../../src/convex-cli')
    resolver.absent = true
    await expect(runConvex(rootDir, ['env', 'list'])).rejects.toThrow('The `convex` package is not installed')
  })
})
