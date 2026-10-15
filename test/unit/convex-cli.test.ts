import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
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
 * the network: it reports how it was invoked and what reached its stdin,
 * exits non-zero on request (echoing its stdin into stderr, as no real CLI
 * should), hangs until killed, or, like `convex dev`, cleans up on SIGINT.
 */
const FAKE_CLI = `
const args = process.argv.slice(2)
const readStdin = (then) => {
  let stdin = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', chunk => { stdin += chunk })
  process.stdin.on('end', () => then(stdin))
}
if (args[0] === 'fail') {
  process.stderr.write('a header line\\nfirst line\\nsecond line\\n\\n\\u001B[31m✖\\u001B[39m deployment says no\\n')
  process.exitCode = 2
}
else if (args[0] === 'echo-stdin') {
  readStdin(stdin => process.stdout.write(JSON.stringify({ args, stdin })))
}
else if (args[0] === 'echo-stdin-and-fail') {
  readStdin((stdin) => {
    process.stderr.write('rejected value ' + stdin)
    process.exitCode = 1
  })
}
else if (args[0] === 'hang') {
  setTimeout(() => {}, 30_000)
}
else if (args[0] === 'until-sigint') {
  process.on('SIGINT', () => {
    process.stdout.write(' cleaned up')
    process.exit(130)
  })
  process.stdout.write('ready')
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

  it('rejects with the command, its exit code and the tail of its stderr — never its arguments', async () => {
    const { ConvexCliError, runConvex } = await import('../../src/convex-cli')
    installFakeConvex()
    // Node's own `execFile` error would read `Command failed: … fail SOME_NAME a-value-in-argv`.
    const failure = runConvex(rootDir, ['fail', '--prod', 'SOME_NAME', 'a-value-in-argv'])

    await expect(failure).rejects.toBeInstanceOf(ConvexCliError)
    // The last three lines, on one, without the colour codes.
    await expect(failure).rejects.toMatchObject({
      message: 'convex fail exited with code 2: first line second line ✖ deployment says no',
      code: 2,
      timedOut: false,
      stderrTail: 'first line second line ✖ deployment says no',
    })
  })

  it('kills a hung CLI once the timeout passes, and says so', async () => {
    const { runConvex } = await import('../../src/convex-cli')
    installFakeConvex()
    await expect(runConvex(rootDir, ['hang'], { timeout: 250 })).rejects.toMatchObject({ timedOut: true, message: 'convex hang timed out after 0.25s' })
  })

  it('names only the subcommand: env set, never the name or the value after it', async () => {
    const { runConvex } = await import('../../src/convex-cli')
    // A working directory that is gone: the spawn itself fails, and Node's
    // spawn error carries every argument (`spawnargs`).
    const failure = runConvex(join(rootDir, 'gone'), ['env', 'set', '--prod', 'EMAIL_API_KEY', 're_value_in_argv'])
    await expect(failure).rejects.toMatchObject({ message: 'convex env set could not start (ENOENT)', code: null })
    await expect(failure).rejects.not.toHaveProperty('spawnargs')
  })
})

describe('runConvex input', () => {
  // The value `convex env set NAME` reads when it is not given one, so it
  // never sits in argv: `ps` shows every process's arguments, and a failed
  // command's error would quote them.
  const SECRET = 're_"quoted" $HOME; echo owned && exit 1'

  it('reaches the child on stdin, never in argv', async () => {
    const { runConvex } = await import('../../src/convex-cli')
    installFakeConvex()

    const { stdout } = await runConvex(rootDir, ['echo-stdin', 'env', 'set', 'EMAIL_API_KEY'], { input: SECRET })

    const seen = JSON.parse(stdout) as { args: string[], stdin: string }
    expect(seen.args).toEqual(['echo-stdin', 'env', 'set', 'EMAIL_API_KEY'])
    expect(seen.args.join(' ')).not.toContain(SECRET)
    // One newline closes it; the Convex CLI drops exactly that one.
    expect(seen.stdin).toBe(`${SECRET}\n`)
  })

  it('is an empty, closed stdin without one, so a CLI that reads it never waits', async () => {
    const { runConvex } = await import('../../src/convex-cli')
    installFakeConvex()
    const { stdout } = await runConvex(rootDir, ['echo-stdin'], { timeout: 5_000 })
    expect(JSON.parse(stdout)).toMatchObject({ stdin: '' })
  })

  it('is scrubbed from the stderr a failure quotes', async () => {
    const { runConvex } = await import('../../src/convex-cli')
    installFakeConvex()
    const failure = runConvex(rootDir, ['echo-stdin-and-fail'], { input: SECRET })

    await expect(failure).rejects.toMatchObject({ message: 'convex echo-stdin-and-fail exited with code 1: rejected value [redacted]' })
    const error = await failure.catch((caught: unknown) => caught) as Error & { stderrTail: string }
    expect(`${error.message} ${error.stderrTail} ${error.stack}`).not.toContain(SECRET)
  })

  it('never reaches the error of a run that times out', async () => {
    const { runConvex } = await import('../../src/convex-cli')
    installFakeConvex()
    const error = await runConvex(rootDir, ['hang', 'env', 'set', 'EMAIL_API_KEY'], { input: SECRET, timeout: 250 }).catch((caught: unknown) => caught) as Error
    expect(error.message).toBe('convex hang timed out after 0.25s')
    expect(JSON.stringify({ ...error, message: error.message, stack: error.stack })).not.toContain(SECRET)
  })

  it('rejects up front, without spawning, when convex is not installed', async () => {
    const { runConvex } = await import('../../src/convex-cli')
    resolver.absent = true
    await expect(runConvex(rootDir, ['env', 'list'])).rejects.toThrow('The `convex` package is not installed')
  })
})

describe('forwardStopSignals', () => {
  it.skipIf(process.platform === 'win32')('passes SIGINT and SIGTERM on to the child as SIGINT, the signal convex dev cleans up on', async () => {
    const { forwardStopSignals } = await import('../../src/convex-cli')
    const cli = installFakeConvex()
    const child = spawn(process.execPath, [cli, 'until-sigint'], { stdio: ['ignore', 'pipe', 'inherit'] })
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => out += chunk.toString())
    const exited = new Promise<number | null>(resolve => child.on('exit', resolve))
    await vi.waitFor(() => expect(out).toBe('ready'))

    // What an agent's `kill <pid>` delivers to nuxt-backend dev alone.
    const target = new EventEmitter()
    const stop = forwardStopSignals(child, target, process.platform)
    target.emit('SIGTERM')

    expect(await exited).toBe(130)
    expect(out).toBe('ready cleaned up')
    stop()
    expect([target.listenerCount('SIGINT'), target.listenerCount('SIGTERM')]).toEqual([0, 0])
  })

  it('stays out of the way on Windows, where kill() would end the child before its cleanup', async () => {
    const { forwardStopSignals } = await import('../../src/convex-cli')
    const child = { kill: vi.fn() }
    const target = new EventEmitter()
    forwardStopSignals(child, target, 'win32')
    target.emit('SIGINT')
    expect(child.kill).not.toHaveBeenCalled()
    expect(target.listenerCount('SIGINT')).toBe(0)
  })
})
