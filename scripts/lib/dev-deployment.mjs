import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The repository root, from any script under scripts/. */
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function parseEnvLine(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const [key, ...rest] = trimmed.split('=')
  if (!key) return null
  return [key.trim(), rest.join('=').split('#')[0].trim()]
}

/** Load a dotenv file without external deps; `{}` when it does not exist. */
export function loadEnvFile(path) {
  try {
    const env = {}
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const pair = parseEnvLine(line)
      if (pair) env[pair[0]] = pair[1]
    }
    return env
  }
  catch {
    return {}
  }
}

/**
 * The dev deployment the repo-root .env.local points at, as the environment
 * and the `--url` arguments `convex run` needs. Exits when there is none — the
 * db scripts have nothing to talk to without it.
 */
export function devDeployment() {
  const env = loadEnvFile(resolve(root, '.env.local'))
  const deployment = env.CONVEX_DEPLOYMENT
  const url = env.CONVEX_URL
  if (!deployment) {
    console.error('CONVEX_DEPLOYMENT not found in .env.local. Run `npx convex dev` first.')
    process.exit(1)
  }
  return {
    env: { ...process.env, CONVEX_DEPLOYMENT: deployment },
    urlArgs: url ? ['--url', url] : [],
  }
}

/**
 * `convex run <args>` against the dev deployment, as argv — no shell, so a
 * JSON argument needs no quoting. Returns the trimmed stdout.
 */
export function convexRun(args) {
  const { env, urlArgs } = devDeployment()
  return execFileSync('pnpm', ['exec', 'convex', 'run', ...args, ...urlArgs], { env, cwd: root, stdio: 'pipe' })
    .toString()
    .trim()
}
