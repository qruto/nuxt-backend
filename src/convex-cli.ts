import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
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
      return createRequire(base).resolve('convex/bin/main.js')
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
