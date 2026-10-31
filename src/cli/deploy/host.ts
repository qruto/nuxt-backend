import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// The app's host, as `nuxt-backend deploy` writes it: on Vercel, the linked
// project's production env through the Vercel CLI and the developer's own
// login (no token is read or stored here); anywhere else, nothing is
// written and the command names what to set.

/** What `deploy` does with the app's host. */
export interface DeployHost {
  /** `vercel`: a project `vercel link` linked; `other`: any other host, written by hand. */
  kind: 'vercel' | 'other'
  /** The production env's names (never values); null when they could not be read. */
  envNames: () => Promise<string[] | null>
  /** Add one name to the production env, the value on the CLI's stdin. */
  addEnv: (name: string, value: string) => Promise<void>
}

/** The build command the host runs: the backend first, then the app against it. */
export const BUILD_COMMAND = 'npx convex deploy --cmd \'npm run build\' --cmd-url-env-var-name NUXT_PUBLIC_BACKEND_URL'

/** Whether `vercel link` linked this folder to a Vercel project. */
export function isVercelLinked(rootDir: string): boolean {
  return existsSync(join(rootDir, '.vercel', 'project.json'))
}

/**
 * Why the host's build would not ship the backend, or null when it does:
 * `vercel.json`'s `buildCommand` runs `convex deploy` (or `nuxt-backend
 * deploy --build`, which runs it). Without a `vercel.json` build command the
 * project's dashboard setting decides, which only the dashboard shows.
 */
export function buildCommandAdvice(rootDir: string): string | null {
  const path = join(rootDir, 'vercel.json')
  let command: unknown
  try {
    command = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as { buildCommand?: unknown }).buildCommand : undefined
  }
  catch {
    return 'vercel.json does not parse: fix it, so the build command it holds can be read.'
  }
  if (typeof command === 'string' && /convex deploy|nuxt-backend deploy --build/.test(command)) return null
  return `Check the project's build command ships the backend first: ${BUILD_COMMAND} (Settings, Build and Deployment, or buildCommand in vercel.json).`
}

/** The names in a `vercel env ls` table: the first column of each row that holds one. */
export function vercelEnvNames(listing: string): string[] {
  return [...new Set(listing
    .split('\n')
    .map(line => line.trim().split(/\s+/)[0] ?? '')
    .filter(name => /^[A-Z_][A-Z0-9_]*$/.test(name)))]
}

/** A Vercel CLI call that failed, with its exit code and the last lines it printed: never the value it was given. */
export class VercelCliError extends Error {}

/**
 * `vercel <args>` in the project, the value (when given) on its stdin: never
 * an argument, where every process on the machine could read it. No shell,
 * except on Windows, where the CLI is a `.cmd` shim Node will only start
 * through one; the arguments are fixed subcommands and env names there.
 */
function runVercel(rootDir: string, args: string[], input?: string): Promise<string> {
  const windows = process.platform === 'win32'
  return new Promise((resolve, reject) => {
    // fallow-ignore-next-line security-sink -- the developer's own Vercel CLI, run with fixed subcommands and env names; a value travels on stdin, never as an argument; verified 2026-10-27
    const child = spawn(windows ? 'vercel.cmd' : 'vercel', args, { cwd: rootDir, stdio: 'pipe', shell: windows, windowsHide: true })
    let output = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk
    })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk
    })
    child.on('error', (error: NodeJS.ErrnoException) => {
      reject(new VercelCliError(error.code === 'ENOENT'
        ? 'the Vercel CLI is not installed: npm i -g vercel, then vercel login'
        : `vercel ${args[0]} could not start (${error.code ?? 'unknown error'})`))
    })
    child.on('close', (code) => {
      if (code === 0) return resolve(output)
      const tail = output.split('\n').map(line => line.trim()).filter(Boolean).slice(-2).join(' ')
      reject(new VercelCliError(`vercel ${args.slice(0, 2).join(' ')} exited with code ${code}${tail ? `: ${tail}` : ''}`))
    })
    child.stdin.on('error', () => {})
    child.stdin.end(input)
  })
}

/** The host `deploy` writes: the linked Vercel project, or another host it only names values for. */
export function deployHost(rootDir: string): DeployHost {
  if (!isVercelLinked(rootDir)) {
    return { kind: 'other', envNames: async () => null, addEnv: async () => {
      throw new VercelCliError('no Vercel project is linked')
    } }
  }
  return {
    kind: 'vercel',
    envNames: () => runVercel(rootDir, ['env', 'ls', 'production']).then(vercelEnvNames, () => null),
    addEnv: async (name, value) => {
      await runVercel(rootDir, ['env', 'add', name, 'production'], value)
    },
  }
}
