import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * The project's `convex` CLI entry, resolved from the project root — then from
 * this package, whose peer dependency it is. `undefined` when neither has it.
 *
 * Resolved rather than reached through `npx convex`: npx would fetch the
 * package from the registry in a directory without it (a fresh checkout, a
 * test's temp dir), and on Windows it is `npx.cmd`, which needs a shell that
 * then re-parses every argument.
 */
export function resolveConvexCli(rootDir: string): string | undefined {
  for (const base of [join(rootDir, 'package.json'), import.meta.url]) {
    try {
      // `convex/bin/main.js` sits outside the package's `exports` map, so it is
      // reached through the one file the map does expose — the manifest — and
      // the `bin` entry declared there.
      const manifestPath = createRequire(base).resolve('convex/package.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { bin?: string | Record<string, string> }
      const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.convex
      if (bin) return join(dirname(manifestPath), bin)
    }
    catch {
      // try the next base
    }
  }
  return undefined
}

export interface RunConvexOptions {
  /** Milliseconds before the child is killed. */
  timeout?: number
}

/**
 * Pass a stop request on to `child` as SIGINT, until the returned function is
 * called. A Ctrl-C in the terminal reaches the child directly, but a signal
 * sent to this process alone does not: an agent's or a task runner's
 * `kill -INT <pid>`, or a plain `kill`. SIGINT is the one signal `convex dev`
 * cleans up on (it stops Nuxt and a local backend before exiting), and it
 * ignores a second one that arrives within half a second of the first, which
 * is what a terminal's Ctrl-C plus this forward amounts to. Not on Windows,
 * where `kill('SIGINT')` ends the child at once, before its cleanup.
 */
export function forwardStopSignals(child: Pick<ChildProcess, 'kill'>, target: Pick<NodeJS.EventEmitter, 'on' | 'off'> = process, platform: NodeJS.Platform = process.platform): () => void {
  if (platform === 'win32') return () => {}
  const forward = () => {
    child.kill('SIGINT')
  }
  target.on('SIGINT', forward)
  target.on('SIGTERM', forward)
  return () => {
    target.off('SIGINT', forward)
    target.off('SIGTERM', forward)
  }
}

/**
 * Run `convex <args>` with the terminal attached, for the interactive
 * commands: the login and project prompts, the `dev` watch. Resolves with the
 * exit code. No shell, like {@link runConvex}. While the child runs, this
 * process waits for it rather than stopping on SIGINT or SIGTERM, and passes
 * either on (see {@link forwardStopSignals}).
 */
export function spawnConvex(rootDir: string, args: string[], options: { env?: NodeJS.ProcessEnv } = {}): Promise<number> {
  const cli = resolveConvexCli(rootDir)
  if (!cli) return Promise.reject(new Error('The `convex` package is not installed in this project.'))
  return new Promise((resolve, reject) => {
    // fallow-ignore-next-line security-sink -- the command is this Node binary running the project's own convex CLI, no shell; the arguments come from the developer's own nuxt-backend invocation on their machine; verified 2026-09-27
    const child = spawn(process.execPath, [cli, ...args], { cwd: rootDir, stdio: 'inherit', env: options.env ?? process.env })
    const stopForwarding = forwardStopSignals(child)
    child.on('error', (error) => {
      stopForwarding()
      reject(error)
    })
    child.on('exit', (code, signal) => {
      stopForwarding()
      resolve(code ?? (signal === 'SIGINT' ? 130 : 1))
    })
  })
}

/**
 * Run `convex <args>` in the project with the current Node — no shell, so the
 * arguments reach the CLI verbatim on every platform. Rejects when the CLI is
 * not installed or exits non-zero.
 */
export async function runConvex(rootDir: string, args: string[], options: RunConvexOptions = {}): Promise<{ stdout: string, stderr: string }> {
  const cli = resolveConvexCli(rootDir)
  if (!cli) throw new Error('The `convex` package is not installed in this project.')
  const { stdout, stderr } = await execFileAsync(process.execPath, [cli, ...args], {
    cwd: rootDir,
    encoding: 'utf-8',
    timeout: options.timeout ?? 30_000,
  })
  return { stdout, stderr }
}
