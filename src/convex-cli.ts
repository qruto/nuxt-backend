import { type ChildProcess, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'

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
  /**
   * Written to the child's stdin, which is then closed: how a value reaches
   * `convex env set NAME` without ever being one of its arguments (see
   * `setDeploymentEnv`). A failure's error never quotes it.
   */
  input?: string
}

/**
 * A `convex` run that did not succeed. Its message names the command by its
 * subcommand (`convex env set`) and says how it ended, with the last lines of
 * its stderr — never its arguments, its stdin or its stdout. Node's own
 * `execFile` error reads `Command failed: <every argument>`, so a value passed
 * as an argument would reach every log line and JSON report that quotes the
 * failure.
 */
export class ConvexCliError extends Error {
  /** The exit code; null when a signal ended the child, or it never started. */
  readonly code: number | null
  /** The signal that ended the child — SIGTERM after a timeout. */
  readonly signal: NodeJS.Signals | null
  /** Whether the timeout ended it. */
  readonly timedOut: boolean
  /** The stderr lines the message quotes, with the input scrubbed out. */
  readonly stderrTail: string

  constructor(message: string, details: { code: number | null, signal: NodeJS.Signals | null, timedOut: boolean, stderrTail: string }) {
    super(message)
    this.name = 'ConvexCliError'
    this.code = details.code
    this.signal = details.signal
    this.timedOut = details.timedOut
    this.stderrTail = details.stderrTail
  }
}

/** The subcommands whose second word names the command too (`env set`). */
const ENV_SUBCOMMANDS = new Set(['set', 'list', 'get', 'remove'])

/**
 * `convex env set`, `convex run`: what an error may call a command. Only the
 * subcommand, never what follows it — a function's arguments, a variable's
 * name or value.
 */
function commandName(args: readonly string[]): string {
  const [first, second] = args
  if (first === 'env' && second && ENV_SUBCOMMANDS.has(second)) return `convex env ${second}`
  return first && /^[a-z][a-z-]*$/.test(first) ? `convex ${first}` : 'convex'
}

/** How much of a failed run's stderr its error quotes. */
const STDERR_TAIL_LINES = 3
const STDERR_TAIL_CHARS = 400

/**
 * Below this length an input is a switch ('1', 'sandbox', 'production'),
 * never one of the secrets the package handles, and scrubbing it would garble
 * the message it happens to appear in.
 */
const SCRUB_MIN_LENGTH = 12

/**
 * The last few lines of a failed run's stderr, on one line. The input is
 * scrubbed out before anything is cut, so no fragment of it survives — the
 * Convex CLI does not echo what it reads, and this keeps it that way should
 * that ever change.
 */
function stderrTail(stderr: string, input: string | undefined): string {
  // Colour and cursor codes a CLI may write even into a pipe go first.
  let text = stripVTControlCharacters(stderr)
  if (input !== undefined && input.length >= SCRUB_MIN_LENGTH) text = text.split(input).join('[redacted]')
  const tail = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(-STDERR_TAIL_LINES).join(' ')
  return tail.length > STDERR_TAIL_CHARS ? `…${tail.slice(-STDERR_TAIL_CHARS)}` : tail
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
 * arguments reach the CLI verbatim on every platform. `input`, when given, is
 * the child's stdin; otherwise stdin is closed at once. Rejects when the CLI
 * is not installed, and with a {@link ConvexCliError} when it fails, times out
 * or cannot start.
 */
export function runConvex(rootDir: string, args: string[], options: RunConvexOptions = {}): Promise<{ stdout: string, stderr: string }> {
  const cli = resolveConvexCli(rootDir)
  if (!cli) return Promise.reject(new Error('The `convex` package is not installed in this project.'))
  const command = commandName(args)
  const timeout = options.timeout ?? 30_000
  return new Promise((resolve, reject) => {
    // fallow-ignore-next-line security-sink -- the command is this Node binary running the project's own convex CLI, no shell; the arguments are fixed subcommands and env names, and values travel on stdin; verified 2026-10-16
    const child = spawn(process.execPath, [cli, ...args], { cwd: rootDir, stdio: 'pipe', windowsHide: true })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk
    })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeout)
    const fail = (how: string, code: number | null, signal: NodeJS.Signals | null) => {
      const tail = stderrTail(stderr, options.input)
      reject(new ConvexCliError(tail ? `${command} ${how}: ${tail}` : `${command} ${how}`, { code, signal, timedOut, stderrTail: tail }))
    }
    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      // Node's spawn error carries the arguments (`spawnargs`): only its code
      // is passed on.
      fail(`could not start (${error.code ?? 'unknown error'})`, null, null)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (timedOut) fail(`timed out after ${timeout / 1000}s`, code, signal)
      else if (code === 0) resolve({ stdout, stderr })
      else fail(signal ? `was stopped by ${signal}` : `exited with code ${code}`, code, signal)
    })
    // A child that exits before reading what it was given (a bad flag, no
    // deployment) fails the write with EPIPE; its exit code reports why.
    child.stdin.on('error', () => {})
    // The Convex CLI drops one trailing newline from what it reads, so the
    // value arrives exactly as given — a trailing newline of its own included.
    child.stdin.end(options.input === undefined ? undefined : `${options.input}\n`)
  })
}
