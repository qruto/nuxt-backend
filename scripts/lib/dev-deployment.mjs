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
  // The Convex CLI follows a deploy key over CONVEX_DEPLOYMENT. These scripts
  // wipe and seed data, so a key exported to run one production command must
  // not come along: drop it from the environment, and refuse one kept in
  // .env.local, which the Convex CLI would load by itself.
  if (env.CONVEX_DEPLOY_KEY || env.CONVEX_DEPLOYMENT_TOKEN) {
    console.error('.env.local holds a deploy key — the Convex CLI would act on that deployment. Remove it; these scripts only ever touch the dev deployment.')
    process.exit(1)
  }
  const shell = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => name !== 'CONVEX_DEPLOY_KEY' && name !== 'CONVEX_DEPLOYMENT_TOKEN'))
  return {
    env: { ...shell, CONVEX_DEPLOYMENT: deployment },
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
